import React from "react";
import { Link } from "react-router-dom";

/**
 * Home.jsx – Web alignée au layout Android (activity_main.xml)
 * - Fond dégradé
 * - Icône centrale moderne en SVG inline (balance de justice)
 * - Titre + sous-titre
 * - 3 boutons principaux (bleu/rouge/jaune – style RDC)
 * - Bandeau d'infos + site web
 *
 * Tailwind requis. Aucune dépendance externe.
 */
export default function Home() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#0c2748] via-[#0a1e38] to-[#071629] text-white flex">
      {/* Scroll area comme un ScrollView Android */}
      <div className="w-full max-w-md mx-auto px-6 py-10 flex flex-col items-center">
        {/* Icône centrale moderne */}
        <IconBadge />

        {/* Titre */}
        <h1 className="text-3xl font-bold text-center">DroitGPT</h1>

        {/* Sous-titre */}
        <p className="mt-2 text-base text-center text-white/90">
          Assistant juridique • Droit congolais 🇨🇩
        </p>

        {/* Boutons principaux */}
        <div className="w-full mt-6 space-y-3">
          <Link
            to="/chat"
            className="block w-full rounded-xl bg-[#1e40af] px-5 py-4 text-base font-medium text-white shadow hover:bg-[#1b3a9c] focus:outline-none focus:ring-2 focus:ring-white/40 transition"
          >
            <span className="mr-2">💬</span> Chatbot juridique
          </Link>

          <Link
            to="/generate"
            className="block w-full rounded-xl bg-[#b91c1c] px-5 py-4 text-base font-medium text-white shadow hover:bg-[#991b1b] focus:outline-none focus:ring-2 focus:ring-white/40 transition"
          >
            <span className="mr-2">📄</span> Générer un document PDF
          </Link>

          <Link
            to="/analyse"
            className="block w-full rounded-xl bg-[#f59e0b] px-5 py-4 text-base font-medium text-black shadow hover:bg-[#f59e0b]/90 focus:outline-none focus:ring-2 focus:ring-white/40 transition"
          >
            <span className="mr-2">🔍</span> Analyser un document
          </Link>

          {/* ⭐⭐ Nouveau bouton : Assistant Vocal ⭐⭐ */}
          <Link
            to="/assistant-vocal"
            className="block w-full rounded-xl bg-blue-600 px-5 py-4 text-base font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white/40 transition"
          >
            <span className="mr-2">🎤</span> Parler avec l’assistant vocal
          </Link>
        </div>

        {/* Bandeau infos */}
        <p className="mt-8 text-sm text-center text-white/90 leading-relaxed">
          Génération automatique de documents juridiques • Analyse PDF/DOCX • Export PDF
        </p>

        {/* Site web */}
        <a
          href="https://droitgpt.com"
          target="_blank"
          rel="noreferrer"
          className="mt-2 text-sm font-semibold text-white hover:underline"
        >
          www.droitgpt.com
        </a>
      </div>
    </div>
  );
}

/**
 * IconBadge – bloc icône style app Android (balance de justice moderne en SVG)
 */
function IconBadge() {
  return (
    <div
      aria-label="Symbole de justice"
      className="relative mt-4 mb-4 h-28 w-28 rounded-3xl bg-white/10 ring-1 ring-white/10 shadow-2xl flex items-center justify-center overflow-hidden"
    >
      {/* Glow subtil */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      {/* SVG inline balance */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        fill="currentColor"
        className="h-16 w-16 text-white drop-shadow"
        aria-hidden
      >
        <path d="M32 2a2 2 0 012 2v6h8a2 2 0 110 4h-1.2l9.8 19.6A4 4 0 0150 40H38a6 6 0 01-6-6 6 6 0 01-6 6H14a4 4 0 01-3.6-6.4L20.2 14H19a2 2 0 110-4h8V4a2 2 0 012-2h3zm-9.5 16L14 34h12a2 2 0 000-4H16.7l6-12H22.5zM42 30a2 2 0 000 4h10l-9.5-16H38l4 8zM30 44h4v12h8a2 2 0 110 4H22a2 2 0 110-4h8V44z" />
      </svg>
    </div>
  );
}
