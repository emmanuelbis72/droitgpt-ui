import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { useAuth } from "../auth/AuthContext.jsx";

const ANALYSE_API = "https://droitgpt-analysepdf.onrender.com/analyse-document";

/**
 * ✅ Conversion PDF scanné -> images (client-side)
 * Optimisé vitesse: scale par défaut 2.3 (au lieu de 3.0)
 */
async function pdfToImageFiles(pdfFile, { scale = 2.3, maxPages = 25 } = {}) {
  const pdfjsLib = await import("pdfjs-dist/build/pdf");
  const workerModule = await import("pdfjs-dist/build/pdf.worker?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  const pagesToRender = Math.min(totalPages, maxPages);

  const imageFiles = [];

  for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    if (!blob) continue;

    imageFiles.push(new File([blob], `page_${pageNum}.png`, { type: "image/png" }));
  }

  return { imageFiles, totalPages, renderedPages: pagesToRender };
}

function isImageFile(f) {
  const n = String(f?.name || "").toLowerCase();
  return (
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".webp") ||
    n.endsWith(".tif") ||
    n.endsWith(".tiff") ||
    n.endsWith(".bmp")
  );
}
function isDocFile(f) {
  const n = String(f?.name || "").toLowerCase();
  return n.endsWith(".pdf") || n.endsWith(".docx");
}
function isPdfFile(f) {
  return String(f?.name || "").toLowerCase().endsWith(".pdf");
}

function safePlainFromHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<li>/gi, "• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * ✅ Pool de promesses (2 pages en parallèle)
 */
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;

  async function next() {
    const current = idx++;
    if (current >= items.length) return;
    results[current] = await worker(items[current], current);
    return next();
  }

  const starters = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(starters);
  return results;
}

export default function Analyse() {
  const [mode, setMode] = useState("doc");
  const [file, setFile] = useState(null);

  const [imageFiles, setImageFiles] = useState([]);
  const [pieces, setPieces] = useState([]);

  // ✅ OCR options (silencieuses, non affichées)
  const useOcr = true;
  const ocrLang = "fra+eng";
  const useOcrPreprocess = true;
  const useOcrCleanup = true;

  const [analysis, setAnalysis] = useState("");
  const [docContext, setDocContext] = useState(null);
  const [docTitle, setDocTitle] = useState(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTarget, setProgressTarget] = useState(0);
  const [error, setError] = useState("");

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("analyseHistory");
    return saved ? JSON.parse(saved) : [];
  });

  const navigate = useNavigate();
  const { accessToken, logout } = useAuth();
  const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  const canAnalyse = useMemo(() => {
    if (mode === "doc") return !!file;
    return imageFiles.length > 0;
  }, [mode, file, imageFiles]);

  const resetOutputs = () => {
    setAnalysis("");
    setDocContext(null);
    setDocTitle(null);
    setPieces([]);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    resetOutputs();
  };

  const handleImagesChange = (e) => {
    const arr = Array.from(e.target.files || []).filter((f) => isImageFile(f));
    setImageFiles(arr);
    resetOutputs();

    const mapped = arr.map((f, idx) => ({
      id: `p_${Date.now()}_${idx}`,
      name: f.name,
      status: "en attente",
      error: "",
      analysisHtml: "",
      extractedText: "",
      ocrUsed: false,
      confidence: null,
    }));
    setPieces(mapped);
  };

  /**
   * ✅ Progress bar plus lente + plus “smooth”
   * - On anime progress vers progressTarget
   * - On laisse un “temps” plus long (sans sauter trop vite)
   */
  const startSmoothProgress = () => {
    setProgress(0);
    setProgressTarget(0);

    let current = 0;
    const interval = setInterval(() => {
      // avance doucement vers target, sinon avance très lentement (illusion de traitement)
      const target = progressTargetRef.current;
      const gap = target - current;

      if (gap > 0.5) {
        // rattrape progressivement le target (doucement)
        current += Math.min(gap * 0.15, 3.0);
      } else {
        // avance lente tant que le backend travaille
        current += 0.25 + Math.random() * 0.55; // ~0.25 à 0.8
      }

      // cap à 96 tant que pas fini
      current = Math.min(current, 96);
      setProgress(Math.round(current));
    }, 450); // plus lent que 200ms

    return interval;
  };

  // petit hack “ref” sans useRef (pour éviter de réécrire ton fichier avec imports)
  const progressTargetRef = {
    current: 0,
  };
  const setTarget = (v) => {
    const clamped = Math.max(0, Math.min(100, v));
    progressTargetRef.current = clamped;
    setProgressTarget(clamped);
  };

  const updatePiece = (id, patch) => {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const postAnalyseSingle = async (oneFile) => {
    const formData = new FormData();
    formData.append("file", oneFile);

    // ✅ OCR activé (silencieux)
    const shouldOcr = useOcr && (isImageFile(oneFile) || isPdfFile(oneFile));
    formData.append("useOcr", shouldOcr ? "1" : "0");
    formData.append("ocrLang", ocrLang);
    formData.append("useOcrPreprocess", useOcrPreprocess ? "1" : "0");
    formData.append("useOcrCleanup", useOcrCleanup ? "1" : "0");

    const res = await fetch(ANALYSE_API, {
      method: "POST",
      headers: { ...authHeaders },
      body: formData,
    });

    if (res.status === 401) {
      logout();
      const next = encodeURIComponent("/analyse");
      window.location.href = `/login?next=${next}`;
      return null;
    }

    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    if (!res.ok) {
      try {
        const j = JSON.parse(rawText || "{}");
        const msg = j?.details || j?.error || `Erreur (${res.status})`;
        if (res.status === 422 && j?.scannedPdf) {
          const err = new Error(msg);
          err.code = "SCANNED_PDF";
          err.details = j;
          throw err;
        }
        throw new Error(msg);
      } catch (e) {
        if (e?.code === "SCANNED_PDF") throw e;
        throw new Error(rawText?.slice(0, 240) || `Erreur (${res.status})`);
      }
    }

    if (!contentType.includes("application/json")) {
      throw new Error(`Réponse inattendue : ${rawText.slice(0, 120)}`);
    }

    return JSON.parse(rawText || "{}");
  };

  const buildCombinedHtmlFromPieces = (arr) => {
    const ok = Array.isArray(arr) ? arr : [];
    const low = ok.filter((p) => Number.isFinite(p.confidence) && p.confidence < 35).length;

    const banner =
      low > 0
        ? `<p><strong>⚠️ Qualité faible détectée :</strong> ${low} page(s) ont une confiance OCR < 35%.</p>`
        : "";

    const blocks = ok
      .map((p, i) => {
        const title = `Page ${i + 1}`;
        const conf = Number.isFinite(p.confidence) ? ` (${p.confidence}%)` : "";

        const extracted = `<h3>${title} — Texte extrait${conf}</h3><p>${escapeHtml(
          (p.extractedText || "").slice(0, 4000) || "Texte indisponible."
        )}</p>`;

        const analysisBlock = p.analysisHtml
          ? `<h3>${title} — Analyse</h3>${p.analysisHtml}`
          : `<h3>${title} — Analyse</h3><p>Analyse indisponible.</p>`;

        const err = p.error ? `<h3>${title} — Erreur</h3><p>${escapeHtml(p.error)}</p>` : "";
        return `${err}${extracted}${analysisBlock}`;
      })
      .join("");

    return `
      <h2>Rapport OCR + Analyse</h2>
      <p>Rapport texte uniquement (OCR + analyse). Confiance (%) par page.</p>
      ${banner}
      ${blocks || "<p>Aucune page analysée.</p>"}
    `.trim();
  };

  const runImagesFlow = async (filesArr, titleForDoc = null) => {
    if (!filesArr?.length) throw new Error("Aucune image à analyser.");

    setMode("images");
    setFile(null);
    setImageFiles(filesArr);

    const init = filesArr.map((f, idx) => ({
      id: `p_${Date.now()}_${idx}`,
      name: f.name,
      status: "en attente",
      error: "",
      analysisHtml: "",
      extractedText: "",
      ocrUsed: false,
      confidence: null,
    }));
    setPieces(init);

    const results = [...init];
    let completed = 0;

    await runPool(filesArr, 2, async (f, i) => {
      const id = init[i].id;

      updatePiece(id, { status: "en cours", error: "" });
      results[i] = { ...results[i], status: "en cours", error: "" };

      try {
        const data = await postAnalyseSingle(f);
        if (!data) return null;

        const patched = {
          status: "terminé",
          analysisHtml: data.analysis || "<p>Analyse vide.</p>",
          extractedText: data.documentText || "",
          ocrUsed: !!data.ocrUsed,
          confidence: Number.isFinite(data.ocrConfidence) ? data.ocrConfidence : null,
        };

        updatePiece(id, patched);
        results[i] = { ...results[i], ...patched };
      } catch (e) {
        const patched = { status: "erreur", error: e?.message || "Erreur analyse" };
        updatePiece(id, patched);
        results[i] = { ...results[i], ...patched };
      } finally {
        completed++;
        // ✅ on met une cible de progression (la barre montera doucement vers cette cible)
        setTarget(Math.round((completed / filesArr.length) * 100));
      }

      return results[i];
    });

    setPieces(results);

    const combinedHtml = buildCombinedHtmlFromPieces(results);
    setAnalysis(combinedHtml);

    const mergedText = results
      .map((p, idx) => {
        const t = (p.extractedText || "").trim();
        if (!t) return "";
        return `--- PAGE ${idx + 1} ---\n${t}\n`;
      })
      .filter(Boolean)
      .join("\n");

    setDocContext(mergedText || null);
    setDocTitle(titleForDoc || `Dossier OCR (${filesArr.length} pages)`);

    const record = {
      filename: titleForDoc || `Dossier OCR (${filesArr.length} pages)`,
      timestamp: new Date().toLocaleString(),
      content: combinedHtml,
    };
    const updatedHistory = [record, ...history.slice(0, 9)];
    setHistory(updatedHistory);
    localStorage.setItem("analyseHistory", JSON.stringify(updatedHistory));
  };

  const handleAnalyse = async () => {
    setError("");
    if (!canAnalyse) {
      setError(mode === "doc" ? "Veuillez sélectionner un fichier PDF ou DOCX." : "Veuillez sélectionner une ou plusieurs images.");
      return;
    }

    setLoading(true);
    resetOutputs();

    // ✅ démarrage barre “plus lente”
    const interval = startSmoothProgress();

    try {
      if (mode === "doc") {
        if (!file || !isDocFile(file)) throw new Error("Format non supporté. Choisissez un PDF ou DOCX.");

        try {
          const data = await postAnalyseSingle(file);
          if (!data) return;

          const htmlAnalysis = data.analysis || "❌ Analyse vide.";
          setAnalysis(htmlAnalysis);
          setDocContext(data.documentText || null);
          setDocTitle(file.name);

          const record = { filename: file.name, timestamp: new Date().toLocaleString(), content: htmlAnalysis };
          const updatedHistory = [record, ...history.slice(0, 9)];
          setHistory(updatedHistory);
          localStorage.setItem("analyseHistory", JSON.stringify(updatedHistory));
          setTarget(100);
        } catch (e) {
          if (e?.code === "SCANNED_PDF" && file.name.toLowerCase().endsWith(".pdf")) {
            const scaleAuto = file.size > 6 * 1024 * 1024 ? 2.1 : 2.3;

            const { imageFiles: imgs, totalPages, renderedPages } = await pdfToImageFiles(file, {
              scale: scaleAuto,
              maxPages: 25,
            });

            if (!imgs.length) throw new Error("Impossible de convertir ce PDF en images. Réessaie avec un PDF moins lourd.");

            await runImagesFlow(imgs, `PDF scanné (${renderedPages}/${totalPages} pages)`);
            setTarget(100);
          } else {
            throw e;
          }
        }
      }

      if (mode === "images") {
        if (!imageFiles.length) throw new Error("Sélectionnez au moins une image.");
        await runImagesFlow(imageFiles, `Dossier OCR (${imageFiles.length} images)`);
        setTarget(100);
      }
    } catch (err) {
      console.error("❌ Erreur analyse :", err);
      setError(err.message || "Erreur lors de l'analyse.");
    } finally {
      // ✅ fin plus “progressive”
      setTimeout(() => {
        clearInterval(interval);
        setProgress(100);
      }, 600);

      setTimeout(() => {
        setLoading(false);
        setProgress(0);
        setProgressTarget(0);
        progressTargetRef.current = 0;
      }, 1800); // plus long qu'avant (500ms)
    }
  };

  const handleDownloadPDF = () => {
    if (!analysis) return;

    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("📄 DroitGPT — Rapport OCR + Analyse", 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const plain = safePlainFromHtml(analysis);
    const lines = doc.splitTextToSize(plain, 170);
    doc.text(lines, 20, 32);

    doc.save(mode === "images" ? "rapport_ocr_analyse.pdf" : "analyse_juridique.pdf");
  };

  const handleChatWithDocument = () => {
    if (!docContext) return;
    navigate("/chat", {
      state: {
        documentText: docContext,
        filename: docTitle || "Document analysé",
        fromAnalyse: true,
      },
    });
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-5xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-white/10 bg-slate-950/70 flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">DroitGPT • Analyse de documents</span>
            <h1 className="text-lg md:text-xl font-semibold mt-1">Analyse PDF/DOCX + OCR (scans & manuscrits)</h1>
            <p className="text-[11px] text-slate-400 mt-1">PDF scanné supporté : conversion auto → OCR → analyse (texte seulement).</p>
          </div>

          <div className="flex flex-col items-end gap-2 text-[11px]">
            <div className="flex gap-2">
              <Link
                to="/chat"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-500/80 bg-slate-900/80 text-emerald-200 hover:bg-emerald-500/10 transition"
              >
                💬 Chat texte
              </Link>
              <Link
                to="/assistant-vocal"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-blue-500/80 bg-slate-900/80 text-blue-200 hover:bg-blue-500/10 transition"
              >
                🎤 Assistant vocal
              </Link>
            </div>
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-600/70 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition"
            >
              ⬅️ Accueil
            </Link>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 px-4 md:px-6 py-4 bg-slate-950/70">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Mode d’analyse</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("doc");
                    setImageFiles([]);
                    setPieces([]);
                    resetOutputs();
                  }}
                  className={`px-3 py-2 rounded-xl text-xs border transition ${
                    mode === "doc"
                      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  📄 PDF/DOCX
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("images");
                    setFile(null);
                    resetOutputs();
                  }}
                  className={`px-3 py-2 rounded-xl text-xs border transition ${
                    mode === "images"
                      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  🧾 Photos / Scans
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-900/60 px-4 py-4 flex flex-col gap-3">
              {mode === "doc" ? (
                <>
                  <p className="text-sm text-slate-200">
                    📁 <strong>Sélectionnez un PDF/DOCX</strong> (PDF scanné accepté)
                  </p>
                  <label className="mt-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-sm text-slate-100 hover:bg-slate-700 transition">
                    Choisir un fichier
                    <input type="file" accept=".pdf,.docx" hidden onChange={handleFileChange} />
                  </label>
                  {file && (
                    <p className="text-xs text-emerald-300 mt-1">
                      ✅ Fichier sélectionné : <strong>{file.name}</strong>
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    Si le PDF est scanné, DroitGPT convertit automatiquement les pages en images puis applique l’OCR.
                  </p>
                </>
              ) : (
                <>
                  {/* ✅ Texte minimal (sans détails techniques) */}
                  <p className="text-sm text-slate-200">
                    🧾 <strong>Uploader des images (scans / manuscrits)</strong>
                  </p>

                  <label className="mt-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-sm text-slate-100 hover:bg-slate-700 transition">
                    Choisir les images (multi)
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp"
                      hidden
                      onChange={handleImagesChange}
                    />
                  </label>

                  {imageFiles.length > 0 && (
                    <p className="text-xs text-emerald-300 mt-1">✅ {imageFiles.length} image(s) sélectionnée(s)</p>
                  )}
                </>
              )}
            </div>

            <button
              onClick={handleAnalyse}
              disabled={loading || !canAnalyse}
              className={`w-full inline-flex items-center justify-center px-4 py-2.5 rounded-2xl text-sm font-medium transition ${
                loading || !canAnalyse
                  ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
              }`}
            >
              {loading ? "Analyse en cours…" : "Analyser"}
            </button>

            {loading && (
              <div className="w-full bg-slate-800 rounded-full h-2 mt-1 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
              </div>
            )}

            {error && <p className="text-xs text-red-400 mt-1">❌ {error}</p>}

            {analysis && (
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadPDF}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                >
                  ⬇️ Télécharger le rapport (PDF)
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem("analyseHistory");
                    setHistory([]);
                  }}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                >
                  ♻️ Reset
                </button>
              </div>
            )}

            {docContext && (
              <button
                onClick={handleChatWithDocument}
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-emerald-500/80 bg-emerald-500/10 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20 transition"
              >
                💬 Chatter avec ce texte dans DroitGPT
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:p-5 min-h-[420px]">
            {!analysis ? (
              <div className="text-sm text-slate-300">
                {mode === "doc"
                  ? "Téléverse un PDF/DOCX. Les PDF scannés sont convertis automatiquement puis analysés."
                  : "Téléverse des images. DroitGPT extrait le texte puis fournit l’analyse."}
              </div>
            ) : (
              <div
                className="prose prose-invert max-w-none prose-p:text-slate-200 prose-li:text-slate-200 prose-strong:text-white"
                dangerouslySetInnerHTML={{ __html: analysis }}
              />
            )}

            {mode === "images" && pieces.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Pages / Pièces</div>
                <div className="mt-2 space-y-2">
                  {pieces.map((p, idx) => (
                    <details key={p.id} className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
                      <summary className="cursor-pointer flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-200 font-medium truncate">
                            {idx + 1}. {p.name}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            Statut:{" "}
                            <span
                              className={
                                p.status === "terminé"
                                  ? "text-emerald-300"
                                  : p.status === "en cours"
                                  ? "text-amber-300"
                                  : p.status === "erreur"
                                  ? "text-red-300"
                                  : "text-slate-300"
                              }
                            >
                              {p.status}
                            </span>
                            {Number.isFinite(p.confidence) ? ` • Confiance: ${p.confidence}%` : ""}
                          </div>
                        </div>

                        <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5">Ouvrir</span>
                      </summary>

                      {p.error && <div className="mt-2 text-xs text-red-300">❌ {p.error}</div>}

                      {p.extractedText && (
                        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-200 bg-slate-950/60 border border-white/10 rounded-xl p-2 max-h-40 overflow-auto">
                          {p.extractedText}
                        </pre>
                      )}

                      {p.analysisHtml && (
                        <div
                          className="mt-2 prose prose-invert max-w-none prose-p:text-slate-200 prose-li:text-slate-200 prose-strong:text-white text-sm bg-slate-950/60 border border-white/10 rounded-xl p-2 max-h-52 overflow-auto"
                          dangerouslySetInnerHTML={{ __html: p.analysisHtml }}
                        />
                      )}
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
