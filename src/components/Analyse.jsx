import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import "jspdf-autotable";

export default function Analyse() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [docContext, setDocContext] = useState(null);
  const [docTitle, setDocTitle] = useState(null);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("analyseHistory");
    return saved ? JSON.parse(saved) : [];
  });

  const navigate = useNavigate();

  const handleFileChange = (e) => setFile(e.target.files[0] || null);

  const simulateProgress = () => {
    setProgress(0);
    let value = 0;
    const interval = setInterval(() => {
      value += Math.random() * 10;
      if (value >= 98) {
        clearInterval(interval);
      }
      setProgress(Math.min(value, 98));
    }, 200);
    return interval;
  };

  const handleAnalyse = async () => {
    if (!file) {
      setError("Veuillez sélectionner un fichier PDF ou DOCX.");
      return;
    }
    setError("");
    setLoading(true);
    setAnalysis("");
    setDocContext(null);
    setDocTitle(null);

    const formData = new FormData();
    formData.append("file", file);

    const interval = simulateProgress();

    try {
      const res = await fetch(
        "https://droitgpt-analysepdf.onrender.com/analyse-document",
        {
          method: "POST",
          body: formData,
        }
      );

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const raw = await res.text();
        throw new Error(`❌ Réponse inattendue : ${raw.slice(0, 120)}...`);
      }

      const data = await res.json();
      const htmlAnalysis = data.analysis || "❌ Analyse vide.";

      setAnalysis(htmlAnalysis);
      setDocContext(data.documentText || null);
      setDocTitle(file.name);

      // Historique (on stocke aussi le HTML)
      const record = {
        filename: file.name,
        timestamp: new Date().toLocaleString(),
        content: htmlAnalysis,
      };
      const updatedHistory = [record, ...history.slice(0, 9)];
      setHistory(updatedHistory);
      localStorage.setItem("analyseHistory", JSON.stringify(updatedHistory));
    } catch (err) {
      console.error("❌ Erreur analyse :", err);
      setError(err.message || "Erreur lors de l'analyse du document.");
    }

    clearInterval(interval);
    setProgress(100);
    setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 500);
  };

  // Conversion HTML → texte propre pour le PDF
  const htmlToPlainForPdf = (html) => {
    if (!html) return "";

    return (
      html
        // listes
        .replace(/<li>/gi, "• ")
        // sauts de ligne après blocs
        .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n\n")
        // supprimer les autres balises
        .replace(/<[^>]+>/g, "")
        // nettoyage
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    );
  };

  const handleDownloadPDF = () => {
    if (!analysis) return;
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("📄 Analyse Juridique – DroitGPT", 20, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const plain = htmlToPlainForPdf(analysis);
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
              Analyse juridique de PDF / DOCX
            </h1>
            <p className="text-[11px] text-slate-400 mt-1">
              Téléversez un contrat, jugement, décision, etc. DroitGPT vous
              donne une analyse structurée basée sur le droit congolais.
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
            <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-900/60 px-4 py-4 flex flex-col gap-3">
              <p className="text-sm text-slate-200">
                📁 <strong>Sélectionnez un document PDF ou DOCX</strong>
              </p>
              <p className="text-xs text-slate-400">
                Exemples : contrat de travail, bail, convention, décision de
                justice, règlement intérieur…
              </p>

              <label className="mt-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-sm text-slate-100 hover:bg-slate-700 transition">
                Choisir un fichier
                <input
                  type="file"
                  accept=".pdf,.docx"
                  hidden
                  onChange={handleFileChange}
                />
              </label>

              {file && (
                <p className="text-xs text-emerald-300 mt-1">
                  ✅ Fichier sélectionné : <strong>{file.name}</strong>
                </p>
              )}
            </div>

            <button
              onClick={handleAnalyse}
              disabled={loading || !file}
              className={`w-full inline-flex items-center justify-center px-4 py-2.5 rounded-2xl text-sm font-medium transition ${
                loading || !file
                  ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
              }`}
            >
              {loading ? "Analyse en cours…" : "Analyser le document"}
            </button>

            {loading && (
              <div className="w-full bg-slate-800 rounded-full h-2 mt-1 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 mt-1">❌ {error}</p>
            )}

            {docContext && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-emerald-200">
                  📂 Ce document peut servir de référence dans le chat.
                </p>
                <button
                  onClick={handleChatWithDocument}
                  className="w-full inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-emerald-500/80 bg-emerald-500/10 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20 transition"
                >
                  💬 Chatter avec ce document dans DroitGPT
                </button>
              </div>
            )}
          </div>

          {/* Colonne droite : aperçu de l'analyse */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                📋 Aperçu de l’analyse juridique
              </h3>
              {analysis && (
                <button
                  onClick={handleDownloadPDF}
                  className="text-xs text-emerald-300 underline hover:text-emerald-200"
                >
                  Télécharger en PDF
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-3 h-64 md:h-72 overflow-y-auto text-sm">
              {!analysis && !loading && (
                <p className="text-xs text-slate-400">
                  L’analyse détaillée de votre document apparaîtra ici : résumé,
                  clauses importantes, risques, recommandations…
                </p>
              )}

              {analysis && (
                <div
                  className="prose prose-sm max-w-none prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-emerald-300"
                  dangerouslySetInnerHTML={{ __html: analysis }}
                />
              )}

              {loading && (
                <p className="text-xs text-slate-400">
                  ⏳ DroitGPT lit le document et prépare une analyse structurée…
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Historique */}
        <div className="border-t border-white/10 bg-slate-950/80 px-4 md:px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-100">
              🕘 Historique des analyses
            </h3>
            {history.length > 0 && (
              <button
                onClick={handleResetHistory}
                className="text-[11px] text-red-300 underline hover:text-red-200"
              >
                Réinitialiser l’historique
              </button>
            )}
          </div>

          {history.length === 0 && (
            <p className="text-[11px] text-slate-500">
              Aucune analyse enregistrée pour l’instant.
            </p>
          )}

          {history.length > 0 && (
            <ul className="space-y-2 text-xs">
              {history.map((item, index) => (
                <li
                  key={index}
                  className="px-3 py-2 rounded-2xl border border-slate-700 bg-slate-900/80"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100 truncate">
                      📄 {item.filename}
                    </p>
                    <p className="text-slate-500 text-[10px]">
                      🗓️ {item.timestamp}
                    </p>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-emerald-300">
                      Voir l’analyse
                    </summary>
                    <div
                      className="mt-1 prose prose-xs max-w-none prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0.5"
                      dangerouslySetInnerHTML={{ __html: item.content }}
                    />
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
