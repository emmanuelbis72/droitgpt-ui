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

        {/* Options */}
        <div className="px-6 py-8 bg-slate-950/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Chatbot juridique */}
            <Link
              to="/chat"
              className="group rounded-2xl border border-white/10 bg-slate-900/80 px-5 py-4 flex flex-col gap-1 hover:border-emerald-400/70 hover:bg-slate-900 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">💬</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                  Recommandé
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">Chatbot juridique</h2>
              <p className="text-xs text-slate-300">
                Posez vos questions juridiques et recevez des explications claires basées sur le droit congolais.
              </p>
            </Link>

            {/* Assistant vocal */}
            <Link
              to="/assistant-vocal"
              className="group rounded-2xl border border-emerald-400/70 bg-slate-900 px-5 py-4 flex flex-col gap-1 hover:bg-slate-900/80 hover:border-emerald-300 transition shadow-lg shadow-emerald-500/10"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">🎤</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                  Nouveau
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">Assistant vocal</h2>
              <p className="text-xs text-slate-300">
                Parlez directement à l’assistant vocal juridique et recevez une réponse audio.
              </p>
            </Link>

            {/* DroitGPT Académie – DÉSACTIVÉE */}
            <div
              className="group rounded-2xl border border-violet-400/40 bg-slate-900/50 px-5 py-4 flex flex-col gap-1
                         opacity-50 cursor-not-allowed pointer-events-none"
              title="DroitGPT Académie – fonctionnalité en pause"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📚</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-violet-300">
                  En pause
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">
                DroitGPT Académie <span className="text-xs">(bientôt)</span>
              </h2>
              <p className="text-xs text-slate-300">
                Formations juridiques intelligentes sur le droit congolais (temporairement indisponible).
              </p>
            </div>

            {/* Analyse de documents */}
            <Link
              to="/analyse"
              className="group rounded-2xl border border-sky-400/70 bg-slate-900/80 px-5 py-4 flex flex-col gap-1 hover:border-sky-300 hover:bg-slate-900 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📄</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-sky-300">
                  Analyse
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">Analyse de documents</h2>
              <p className="text-xs text-slate-300">
                Téléversez un document juridique (PDF ou Word) et obtenez une analyse claire.
              </p>
            </Link>

            {/* Génération de documents */}
            <Link
              to="/generate"
              className="group rounded-2xl border border-amber-400/70 bg-slate-900/80 px-5 py-4 flex flex-col gap-1 hover:border-amber-300 hover:bg-slate-900 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📝</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-amber-300">
                  Génération
                </span>
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
