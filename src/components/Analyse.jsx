import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { useAuth } from "../auth/AuthContext.jsx";

const ANALYSE_API = "https://droitgpt-analysepdf.onrender.com/analyse-document";

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

// Evite d'injecter du texte brut dans du HTML combiné
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function Analyse() {
  // ✅ Upload mode: "doc" (PDF/DOCX) or "images"
  const [mode, setMode] = useState("doc");

  // DOC (single)
  const [file, setFile] = useState(null);

  // IMAGES (multi)
  const [imageFiles, setImageFiles] = useState([]); // File[]
  const [pieces, setPieces] = useState([]); // { id, name, status, error, analysisHtml, extractedText, ocrUsed }

  // OCR options
  const [useOcr, setUseOcr] = useState(true);
  const [ocrLang, setOcrLang] = useState("fra+eng");

  // Output (global/combined)
  const [analysis, setAnalysis] = useState("");
  const [docContext, setDocContext] = useState(null);
  const [docTitle, setDocTitle] = useState(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("analyseHistory");
    return saved ? JSON.parse(saved) : [];
  });

  const navigate = useNavigate();

  // ✅ Auth
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
    }));
    setPieces(mapped);
  };

  // Progress UI (simulé)
  const simulateProgress = () => {
    setProgress(0);
    let value = 0;
    const interval = setInterval(() => {
      value += Math.random() * 10;
      if (value >= 98) clearInterval(interval);
      setProgress(Math.min(value, 98));
    }, 200);
    return interval;
  };

  const updatePiece = (id, patch) => {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const postAnalyseSingle = async (oneFile) => {
    const formData = new FormData();
    formData.append("file", oneFile);

    // OCR: seulement si image (sinon inutile)
    const shouldOcr = useOcr && isImageFile(oneFile);
    formData.append("useOcr", shouldOcr ? "1" : "0");
    formData.append("ocrLang", ocrLang);

    const res = await fetch(ANALYSE_API, {
      method: "POST",
      headers: { ...authHeaders },
      body: formData,
    });

    // ✅ Si non authentifié (backend protégé)
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
        throw new Error(j?.details || j?.error || `Erreur (${res.status})`);
      } catch {
        throw new Error(rawText?.slice(0, 220) || `Erreur (${res.status})`);
      }
    }

    if (!contentType.includes("application/json")) {
      throw new Error(`Réponse inattendue : ${rawText.slice(0, 120)}`);
    }

    return JSON.parse(rawText || "{}");
  };

  const buildCombinedHtmlFromPieces = (arr) => {
    const ok = Array.isArray(arr) ? arr : [];

    // ✅ Rapport final demandé : texte OCR + analyse (pas d’images)
    const blocks = ok
      .map((p, i) => {
        const title = `Pièce ${i + 1} — ${p.name}`;

        const ocrText = (p.extractedText || "").trim();
        const ocrBlock = `
          <h3>${title} — Texte OCR extrait</h3>
          <p>${escapeHtml(ocrText || "Texte OCR indisponible.")}</p>
        `;

        const analysisBlock = p.analysisHtml
          ? `<h3>${title} — Analyse</h3>${p.analysisHtml}`
          : `<h3>${title} — Analyse</h3><p>Analyse indisponible.</p>`;

        const err = p.error
          ? `<h3>${title} — Erreur</h3><p>${escapeHtml(p.error)}</p>`
          : "";

        return `${err}${ocrBlock}${analysisBlock}`;
      })
      .join("");

    return `
      <h2>Rapport OCR + Analyse</h2>
      <p>Ce rapport contient uniquement le texte OCR extrait, suivi de l’analyse juridique pour chaque pièce.</p>
      ${blocks || "<p>Aucune pièce analysée.</p>"}
    `.trim();
  };

  const handleAnalyse = async () => {
    setError("");
    if (!canAnalyse) {
      setError(
        mode === "doc"
          ? "Veuillez sélectionner un fichier PDF ou DOCX."
          : "Veuillez sélectionner une ou plusieurs images (JPG/PNG/WebP/TIFF/BMP)."
      );
      return;
    }

    setLoading(true);
    resetOutputs();
    const interval = simulateProgress();

    try {
      // ======================
      // MODE DOC (PDF/DOCX)
      // ======================
      if (mode === "doc") {
        if (!file || !isDocFile(file)) {
          throw new Error("Format non supporté. Choisissez un PDF ou DOCX.");
        }

        const data = await postAnalyseSingle(file);
        if (!data) return;

        const htmlAnalysis = data.analysis || "❌ Analyse vide.";
        setAnalysis(htmlAnalysis);
        setDocContext(data.documentText || null);
        setDocTitle(file.name);

        const record = {
          filename: file.name,
          timestamp: new Date().toLocaleString(),
          content: htmlAnalysis,
        };
        const updatedHistory = [record, ...history.slice(0, 9)];
        setHistory(updatedHistory);
        localStorage.setItem("analyseHistory", JSON.stringify(updatedHistory));
      }

      // ======================
      // MODE IMAGES (multi)
      // ======================
      if (mode === "images") {
        if (!imageFiles.length) throw new Error("Sélectionnez au moins une image.");

        // init pieces (UI)
        const init = imageFiles.map((f, idx) => ({
          id: `p_${Date.now()}_${idx}`,
          name: f.name,
          status: "en attente",
          error: "",
          analysisHtml: "",
          extractedText: "",
          ocrUsed: false,
        }));
        setPieces(init);

        // ✅ Stockage local fiable des résultats (pas de dépendance au state)
        const results = [...init];

        // traitement séquentiel
        for (let i = 0; i < imageFiles.length; i++) {
          const f = imageFiles[i];
          const id = init[i].id;

          updatePiece(id, { status: "en cours", error: "" });
          results[i] = { ...results[i], status: "en cours", error: "" };

          try {
            const data = await postAnalyseSingle(f);
            if (!data) return;

            const patched = {
              status: "terminé",
              analysisHtml: data.analysis || "<p>Analyse vide.</p>",
              extractedText: data.documentText || "",
              ocrUsed: !!data.ocrUsed,
            };

            updatePiece(id, patched);
            results[i] = { ...results[i], ...patched };
          } catch (e) {
            const patched = { status: "erreur", error: e?.message || "Erreur analyse" };
            updatePiece(id, patched);
            results[i] = { ...results[i], ...patched };
          }

          setProgress(Math.round(((i + 1) / imageFiles.length) * 100));
        }

        // ✅ Synchronise l’état final une seule fois
        setPieces(results);

        const combinedHtml = buildCombinedHtmlFromPieces(results);
        setAnalysis(combinedHtml);

        // docContext = concat texte OCR (utile pour /chat)
        const mergedText = results
          .map((p, idx) => {
            const t = (p.extractedText || "").trim();
            if (!t) return "";
            return `--- PIECE ${idx + 1}: ${p.name} ---\n${t}\n`;
          })
          .filter(Boolean)
          .join("\n");

        setDocContext(mergedText || null);
        setDocTitle(`Dossier OCR (${imageFiles.length} images)`);

        // Historique
        const record = {
          filename: `Dossier OCR (${imageFiles.length} images)`,
          timestamp: new Date().toLocaleString(),
          content: combinedHtml,
        };
        const updatedHistory = [record, ...history.slice(0, 9)];
        setHistory(updatedHistory);
        localStorage.setItem("analyseHistory", JSON.stringify(updatedHistory));
      }
    } catch (err) {
      console.error("❌ Erreur analyse :", err);
      setError(err.message || "Erreur lors de l'analyse.");
    } finally {
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 500);
    }
  };

  // ✅ PDF final demandé :
  // - si mode images : TEXTE OCR + ANALYSE par pièce (pas d’images)
  // - si mode doc : analyse classique (comme avant)
  const handleDownloadPDF = () => {
    if (mode === "images") {
      if (!pieces.length) return;

      const doc = new jsPDF();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("📄 DroitGPT — Rapport OCR + Analyse", 20, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      let y = 32;

      const addBlock = (title, text) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(title, 20, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(text || "", 170);
        doc.text(lines, 20, y);
        y += lines.length * 5 + 8;
      };

      addBlock(
        "Résumé",
        `Rapport généré le ${new Date().toLocaleString()} — ${pieces.length} pièce(s).`
      );

      addBlock("1) Texte OCR extrait", "");
      pieces.forEach((p, idx) => {
        const ocr = (p.extractedText || "").trim();
        addBlock(`Pièce ${idx + 1} — ${p.name}`, ocr || "Texte OCR indisponible.");
      });

      addBlock("2) Analyse juridique", "");
      pieces.forEach((p, idx) => {
        const ana = safePlainFromHtml(p.analysisHtml || "").trim();
        addBlock(
          `Analyse — Pièce ${idx + 1} — ${p.name}`,
          ana || "Analyse indisponible."
        );
      });

      doc.save(`rapport_ocr_analyse_${pieces.length}_pieces.pdf`);
      return;
    }

    // mode doc
    if (!analysis) return;
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("📄 Analyse Juridique – DroitGPT", 20, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const plain = safePlainFromHtml(analysis);
    const lines = doc.splitTextToSize(plain, 170);
    doc.text(lines, 20, 32);

    doc.save("analyse_juridique.pdf");
  };

  const handleResetHistory = () => {
    localStorage.removeItem("analyseHistory");
    setHistory([]);
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
        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-white/10 bg-slate-950/70 flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              DroitGPT • Analyse de documents
            </span>
            <h1 className="text-lg md:text-xl font-semibold mt-1">
              Analyse PDF/DOCX + OCR manuscrits (multi-images)
            </h1>
            <p className="text-[11px] text-slate-400 mt-1">
              PDF/DOCX (texte) ou photos/scans manuscrits. OCR sur images + analyse juridique RDC.
            </p>
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

        {/* Corps */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 px-4 md:px-6 py-4 bg-slate-950/70">
          {/* Colonne gauche : upload + actions */}
          <div className="space-y-4">
            {/* Mode selector */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Mode d’analyse
              </div>
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
                  📄 PDF/DOCX (1 fichier)
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
                  🧾 OCR (multi-images)
                </button>
              </div>
            </div>

            {/* Upload box */}
            <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-900/60 px-4 py-4 flex flex-col gap-3">
              {mode === "doc" ? (
                <>
                  <p className="text-sm text-slate-200">
                    📁 <strong>Sélectionnez un document PDF ou DOCX</strong>
                  </p>
                  <p className="text-xs text-slate-400">
                    Pour PDF scanné (image), utilise plutôt le mode multi-images (OCR).
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
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-200">
                    🧾 <strong>Uploader plusieurs images (scans / manuscrits)</strong>
                  </p>
                  <p className="text-xs text-slate-400">
                    Formats: JPG/PNG/WebP/TIFF/BMP. Conseillé: photos nettes, bonne lumière, page à plat.
                  </p>

                  {/* OCR toggle */}
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-100">
                          ✅ OCR activé
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          L’OCR s’applique automatiquement aux images.
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setUseOcr((v) => !v)}
                        className={`px-3 py-1.5 rounded-xl text-xs border transition ${
                          useOcr
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        {useOcr ? "Activé" : "Désactivé"}
                      </button>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Langue OCR:</span>
                      <select
                        value={ocrLang}
                        onChange={(e) => setOcrLang(e.target.value)}
                        className="text-xs bg-slate-900/70 border border-white/10 rounded-xl px-2 py-1 text-slate-100"
                      >
                        <option value="fra+eng">Français + Anglais (recommandé)</option>
                        <option value="fra">Français</option>
                        <option value="eng">Anglais</option>
                      </select>
                    </div>
                  </div>

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
                    <p className="text-xs text-emerald-300 mt-1">
                      ✅ {imageFiles.length} image(s) sélectionnée(s)
                    </p>
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
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {error && <p className="text-xs text-red-400 mt-1">❌ {error}</p>}

            {/* Actions PDF / Reset */}
            {analysis && (
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadPDF}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                >
                  ⬇️ Télécharger le rapport (PDF)
                </button>
                <button
                  onClick={handleResetHistory}
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

          {/* Colonne droite : résultat + (si mode images) liste des pièces */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:p-5 min-h-[420px]">
            {!analysis ? (
              <div className="text-sm text-slate-300">
                {mode === "doc"
                  ? "Téléverse un PDF/DOCX pour obtenir une analyse structurée."
                  : "Téléverse plusieurs images (PV, notes manuscrites) pour OCR + analyse par pièce + rapport final (texte uniquement)."}
                {mode === "images" && (
                  <div className="mt-2 text-xs text-slate-400">
                    Astuce : photo nette + bonne lumière + page à plat = meilleur OCR.
                  </div>
                )}
              </div>
            ) : (
              <div
                className="prose prose-invert max-w-none prose-p:text-slate-200 prose-li:text-slate-200 prose-strong:text-white"
                dangerouslySetInnerHTML={{ __html: analysis }}
              />
            )}

            {/* Pieces list */}
            {mode === "images" && pieces.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Pièces (images)
                </div>
                <div className="mt-2 space-y-2">
                  {pieces.map((p, idx) => (
                    <details
                      key={p.id}
                      className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2"
                    >
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
                            {p.ocrUsed ? " • OCR" : ""}
                          </div>
                        </div>

                        <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5">
                          Ouvrir
                        </span>
                      </summary>

                      {p.error && (
                        <div className="mt-2 text-xs text-red-300">
                          ❌ {p.error}
                        </div>
                      )}

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

            {/* Historique */}
            {history?.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Historique (10 derniers)
                </div>
                <div className="mt-2 space-y-2">
                  {history.map((h, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-200 font-medium">
                          {h.filename}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {h.timestamp}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {String(h.content || "")
                          .replace(/<[^>]+>/g, "")
                          .slice(0, 160)}
                        …
                      </div>
                    </div>
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
