// 📄 src/pages/Generate.jsx (ou src/components/Generate.jsx selon ton projet)
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import MobileMoneyPayment from "./payments/MobileMoneyPayment.jsx";
import { clearStoredPayment } from "../services/paymentsApi.js";

const PDF_API_URL =
  import.meta.env.VITE_PDF_API_URL ||
  "https://droitgpt-pdf-api.onrender.com/generate-pdf";

const PAYMENT_API_BASE = import.meta.env.VITE_BP_API_BASE || "https://businessplan-v9yy.onrender.com";

export default function Generate() {
  const [paymentOrder, setPaymentOrder] = useState("");
  const [paymentOpenSignal, setPaymentOpenSignal] = useState(0);
  const [paymentResetSignal, setPaymentResetSignal] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // ✅ Auth
  const { accessToken, logout } = useAuth();
  const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  const redirectToLogin = (nextPath = "/generate") => {
    logout();
    const next = encodeURIComponent(nextPath);
    window.location.href = `/login?next=${next}`;
  };

  // Simulation douce de barre de progression
  useEffect(() => {
    let interval;
    if (loading) {
      setProgress(10);
      interval = setInterval(() => {
        setProgress((p) => (p < 90 ? p + 8 : p));
      }, 350);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Nettoyage de l’ancienne URL de PDF
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const handleTemplate = (tpl) => {
    if (tpl === "contrat") {
      setTitle("Contrat de travail à durée indéterminée");
      setContent(
        "Employeur, salarié, fonction, durée de la période d’essai, rémunération, avantages, horaires, obligations des parties, confidentialité, clause de non-concurrence éventuelle, rupture du contrat, droit applicable et juridiction compétente."
      );
    } else if (tpl === "bail") {
      setTitle("Contrat de bail d’habitation");
      setContent(
        "Identité du bailleur et du locataire, description du bien loué, durée du bail, montant du loyer, garantie locative, charges, entretien et réparations, sous-location, résiliation anticipée, état des lieux d’entrée et de sortie, juridiction compétente."
      );
    } else if (tpl === "mise") {
      setTitle("Lettre de mise en demeure");
      setContent(
        "Identité du débiteur et du créancier, rappel des faits, montant ou obligation non exécutée, base juridique, délai pour s’exécuter, menaces de poursuites en cas d’inaction, coordonnées complètes de la partie qui met en demeure."
      );
    }
  };

  const handleGenerate = async () => {
    setError("");
    setPdfUrl("");

    if (!title.trim() || !content.trim()) {
      setError("Merci de préciser un titre et les informations essentielles.");
      return;
    }

    if (!paymentOrder) {
      setPaymentOpenSignal((value) => value + 1);
      return;
    }
    const usedPaymentOrder = paymentOrder;
    setLoading(true);
    try {
      const res = await fetch(PDF_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
          "X-Payment-Order": usedPaymentOrder,
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });

      // ✅ backend protégé → non connecté
      if (res.status === 401) {
        redirectToLogin("/generate");
        return;
      }

      if (!res.ok) {
        const raw = await res.text();
        throw new Error(
          `Erreur serveur (${res.status}). Détails : ${raw.slice(0, 200)}`
        );
      }

      const blob = await res.blob();
      clearStoredPayment("legal_document");
      setPaymentOrder("");
      setPaymentResetSignal((value) => value + 1);
      const url = URL.createObjectURL(blob);
      setProgress(100);
      setPdfUrl(url);
    } catch (err) {
      setError(err.message || "Erreur lors de la génération du PDF.");
    } finally {
      setLoading(false);
    }
  };

  const truncatedPreview =
    content.trim().length > 0
      ? content.trim().slice(0, 600) +
        (content.trim().length > 600 ? "…" : "")
      : "Le contenu détaillé de votre document apparaîtra ici pour aperçu.";

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-5xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-white/10 bg-slate-950/70 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              DroitGPT • Génération de documents
            </span>
            <h1 className="text-lg md:text-xl font-semibold mt-1">
              Créez vos contrats & actes juridiques en PDF
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Les textes sont rédigés selon le droit congolais, avec un style
              professionnel et structuré.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <Link
              to="/chat"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-600/70 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition"
            >
              💬 Chat DroitGPT
            </Link>
            <Link
              to="/assistant-vocal"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-500/80 bg-slate-900/80 text-emerald-200 hover:bg-emerald-500/10 transition"
            >
              🎤 Assistant vocal
            </Link>
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-600/70 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition"
            >
              ⬅️ Accueil
            </Link>
          </div>
        </div>

        {/* Corps : 2 colonnes */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-1 bg-slate-950/80">
          {/* Colonne formulaire */}
          <div className="px-4 md:px-6 py-5 border-b md:border-b-0 md:border-r border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100">
                📝 Paramètres du document
              </h2>
              <button
                onClick={() => {
                  setTitle("");
                  setContent("");
                  setPdfUrl("");
                  setError("");
                }}
                className="text-[11px] text-rose-300 hover:text-rose-200"
              >
                Réinitialiser
              </button>
            </div>

            <label className="block text-xs font-medium text-slate-300 mb-1">
              Titre du document
            </label>
            <input
              type="text"
              className="w-full mb-3 px-3 py-2 rounded-2xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-transparent"
              placeholder='Ex : "Contrat de travail à durée indéterminée"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <label className="block text-xs font-medium text-slate-300 mb-1">
              Informations à inclure (faits, parties, clauses importantes…)
            </label>
            <textarea
              className="w-full h-40 md:h-48 px-3 py-2 rounded-2xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-transparent resize-none"
              placeholder="Décrivez ici tous les éléments que le document doit impérativement contenir (noms des parties, dates, montants, obligations, etc.)."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />

            {/* Templates rapides */}
            <div className="mt-3">
              <p className="text-[11px] text-slate-400 mb-1">
                Besoin d’inspiration ? Utilisez un modèle de départ :
              </p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <button
                  onClick={() => handleTemplate("contrat")}
                  className="px-3 py-1.5 rounded-full border border-emerald-500/60 text-emerald-200 bg-slate-900/90 hover:bg-emerald-500/10 transition"
                >
                  Contrat de travail
                </button>
                <button
                  onClick={() => handleTemplate("bail")}
                  className="px-3 py-1.5 rounded-full border border-sky-500/60 text-sky-200 bg-slate-900/90 hover:bg-sky-500/10 transition"
                >
                  Bail d’habitation
                </button>
                <button
                  onClick={() => handleTemplate("mise")}
                  className="px-3 py-1.5 rounded-full border border-amber-500/60 text-amber-200 bg-slate-900/90 hover:bg-amber-500/10 transition"
                >
                  Mise en demeure
                </button>
              </div>
            </div>

            <div className="mt-4">
              <MobileMoneyPayment apiBase={PAYMENT_API_BASE} documentType="legal_document" variant="dark"
                disabled={loading} openSignal={paymentOpenSignal} resetSignal={paymentResetSignal}
                onPaymentReady={setPaymentOrder} paidMessage="Paiement confirme. Vous pouvez generer votre document juridique." />
            </div>
            {/* Bouton générer + progression */}
            <div className="mt-5 space-y-2">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`w-full inline-flex items-center justify-center px-4 py-2.5 rounded-2xl text-sm font-medium transition ${
                  loading
                    ? "bg-slate-700 text-slate-300 cursor-wait"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                }`}
              >
                {loading ? "Génération en cours…" : !paymentOrder ? "Payer puis generer le PDF juridique" : "⚖️ Générer le PDF juridique"}
              </button>

              {loading && (
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {error && (
                <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-2xl px-3 py-2 mt-1">
                  ❌ {error}
                </div>
              )}
            </div>
          </div>

          {/* Colonne aperçu & résultat */}
          <div className="px-4 md:px-6 py-5 flex flex-col gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-3">
              <h2 className="text-xs font-semibold text-slate-200 mb-1">
                👁️ Aperçu textuel du futur document
              </h2>
              <p className="text-[11px] text-slate-400 mb-2">
                Ceci n’est qu’un aperçu simplifié. Le PDF final sera structuré
                et rédigé de manière professionnelle.
              </p>

              <div className="mt-1 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                <strong className="block mb-1">
                  {title || "Titre juridique à définir"}
                </strong>
                {truncatedPreview}
              </div>
            </div>

            {pdfUrl && (
              <div className="rounded-2xl border border-emerald-500/60 bg-emerald-500/5 px-3 py-3 space-y-2">
                <div className="text-sm text-emerald-200 font-medium">
                  ✅ Document généré avec succès
                </div>
                <p className="text-[11px] text-emerald-100/90">
                  Vous pouvez le télécharger ou l’ouvrir dans un nouvel onglet.
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <a
                    href={pdfUrl}
                    download={`document_${(title || "droitgpt")
                      .replace(/\s+/g, "_")
                      .toLowerCase()}.pdf`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition"
                  >
                    ⬇️ Télécharger le PDF
                  </a>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-400/70 text-emerald-200 bg-slate-900/90 hover:bg-emerald-500/10 transition"
                  >
                    👁️ Ouvrir dans le navigateur
                  </a>
                  <button
                    onClick={() => setPdfUrl("")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-600/70 text-slate-200 bg-slate-900/80 hover:bg-slate-800 transition"
                  >
                    🗑️ Effacer le résultat
                  </button>
                </div>

                <button
                  onClick={() => navigate("/")}
                  className="mt-2 text-[11px] text-emerald-200 underline underline-offset-2 hover:text-emerald-100"
                >
                  ⬅️ Retour à l’accueil
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
