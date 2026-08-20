import React from "react";
import { Link } from "react-router-dom";

export default function Analyse() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">DroitGPT</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Analyse PDF désactivée</h1>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">
        Cette fonctionnalité a été retirée du frontend pour réduire les coûts Render. Les générations Business Plan,
        Mémoire, Projet ONG, Grants et le chat restent disponibles.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Retour à l’accueil
      </Link>
    </div>
  );
}
