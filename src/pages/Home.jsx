import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-6 border-b border-white/10 bg-slate-950/70 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-slate-300 font-bold">
              <strong>Assistant juridique congolais</strong>
            </div>
            <h1 className="text-3xl font-semibold mt-1">DroitGPT</h1>
            <p className="mt-1 text-sm text-slate-300">
              Discutez, analysez et générez des documents juridiques avec un assistant intelligent.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            <span className="inline-flex items-center gap-2 text-[11px] text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Disponible 24h/24 • RDC 🇨🇩
            </span>
            <a
              href="https://droitgpt.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-emerald-300 hover:text-emerald-200 hover:underline"
            >
              www.droitgpt.com
            </a>
          </div>
        </div>

        {/* 👉 GROS CTA CRÉER UN COMPTE */}
        <div className="px-6 py-6 bg-gradient-to-r from-indigo-950/60 via-slate-900/60 to-emerald-950/60 border-b border-white/10">
          <div className="flex flex-col items-center text-center gap-3">
            <h2 className="text-xl font-semibold">Accédez à toutes les fonctionnalités de DroitGPT</h2>
            <p className="text-sm text-slate-300 max-w-xl">
              Créez gratuitement votre compte pour discuter avec l’assistant juridique, analyser vos documents et
              générer des actes juridiques en quelques secondes.
            </p>

            <Link
              to="/register"
              className="mt-2 inline-flex items-center justify-center px-8 py-4 rounded-2xl
                         bg-gradient-to-r from-indigo-500 to-emerald-500
                         hover:from-indigo-600 hover:to-emerald-600
                         text-white font-semibold text-lg
                         shadow-2xl shadow-emerald-500/40
                         transition"
            >
              🚀 Créer un compte gratuitement
            </Link>

            <p className="text-[11px] text-slate-400">Aucun paiement requis • Accès immédiat</p>
          </div>
        </div>

        {/* Options */}
        <div className="px-6 py-8 bg-slate-950/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1) Chatbot juridique */}
            <Link
              to="/chat"
              className="group rounded-2xl border border-white/10 bg-slate-900/80 px-5 py-4 flex flex-col gap-1 hover:border-emerald-400/70 hover:bg-slate-900 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">💬</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Recommandé</span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">Chatbot juridique</h2>
              <p className="text-xs text-slate-300">
                Posez vos questions juridiques et recevez des explications claires basées sur le droit congolais.
              </p>
            </Link>

            {/* 2) ⚖️ Justice Lab */}
            <Link
              to="/justice-lab"
              className="group rounded-2xl border border-rose-400/70 bg-slate-900/80 px-5 py-4 flex flex-col gap-2 hover:border-rose-300 hover:bg-slate-900 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">⚖️</span>

                <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-semibold text-rose-200">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-400" />
                  </span>
                  Nouveau
                </span>
              </div>

              <h2 className="text-lg font-semibold">
                Justice Lab <span className="text-xs">(jeu IA)</span>
              </h2>

              <p className="text-xs text-slate-300">
                Cas pratiques congolais simulés : procédure → <strong>Audience</strong> (objections) → décision →{" "}
                <strong>Cour d’appel</strong> + scoring.
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-slate-200">
                  🏛️ Audience
                </span>
                <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-slate-200">
                  🧠 Feedback instant
                </span>
                <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-slate-200">
                  ⚖️ Appel
                </span>
              </div>
            </Link>

            {/* 3) Assistant vocal */}
            <Link
              to="/assistant-vocal"
              className="group rounded-2xl border border-emerald-400/70 bg-slate-900 px-5 py-4 flex flex-col gap-1 hover:bg-slate-900/80 hover:border-emerald-300 transition shadow-lg shadow-emerald-500/10"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">🎤</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Nouveau</span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">Assistant vocal</h2>
              <p className="text-xs text-slate-300">
                Parlez directement à l’assistant vocal juridique et recevez une réponse audio.
              </p>
            </Link>

            {/* 4) Analyse de documents */}
            <Link
              to="/analyse"
              className="group rounded-2xl border border-sky-400/70 bg-slate-900/80 px-5 py-4 flex flex-col gap-1 hover:border-sky-300 hover:bg-slate-900 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📄</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-sky-300">Analyse</span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">Analyse de documents</h2>
              <p className="text-xs text-slate-300">
                Téléversez un document juridique (PDF ou Word) et obtenez une analyse claire.
              </p>
            </Link>

            {/* 5) Génération de documents */}
            <Link
              to="/generate"
              className="group rounded-2xl border border-amber-400/70 bg-slate-900/80 px-5 py-4 flex flex-col gap-1 hover:border-amber-300 hover:bg-slate-900 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📝</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Génération</span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">Documents juridiques</h2>
              <p className="text-xs text-slate-300">
                Générez automatiquement des contrats, actes et documents juridiques en PDF.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
