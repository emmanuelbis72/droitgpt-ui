import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* HEADER NAVIGATION */}
      <header className="flex items-center justify-between p-4 shadow-md bg-white">
        <h1 className="text-xl font-bold text-green-700">DroitGPT</h1>
        <button
          className="md:hidden text-3xl"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        <nav className="hidden md:flex space-x-6">
          <Link to="/" className="text-green-700 hover:underline">Accueil</Link>
          <Link to="/chat" className="text-green-700 hover:underline">Chat</Link>
          <Link to="/generate" className="text-green-700 hover:underline">Documents</Link>
        </nav>
      </header>

      {/* MOBILE MENU */}
      {menuOpen && (
        <nav className="md:hidden bg-white shadow p-4 space-y-2">
          <Link to="/" className="block text-green-700 hover:underline">Accueil</Link>
          <Link to="/chat" className="block text-green-700 hover:underline">Chat</Link>
          <Link to="/generate" className="block text-green-700 hover:underline">Documents</Link>
        </nav>
      )}

      {/* MAIN CONTENT */}
      <main className="flex flex-col items-center justify-center flex-grow p-6 space-y-8">
        <h2 className="text-2xl font-bold text-center text-green-700">Bienvenue sur DroitGPT</h2>

        <div className="text-center space-y-1 text-sm text-gray-700">
          <p>Contactez-nous :</p>
          <p>
            <a href="mailto:info@droitgpt.com" className="text-blue-600 hover:underline">info@droitgpt.com</a>
            <span className="mx-2 text-gray-400">|</span>
            <span className="text-green-700 font-semibold">+243 816 307 451</span>
          </p>
        </div>

        <div className="flex flex-col space-y-4 w-full max-w-xs">
          <Link to="/chat" className="px-4 py-3 bg-green-600 text-white rounded-xl text-center shadow hover:bg-green-700">
            💬 Accéder au Chat
          </Link>

          <Link to="/generate" className="px-4 py-3 bg-blue-600 text-white rounded-xl text-center shadow hover:bg-blue-700">
            📄 Générer un document juridique
          </Link>

          {/* CACHÉ TEMPORAIREMENT */}
          <button
            className="px-4 py-3 bg-yellow-600 text-white rounded-xl text-center shadow opacity-40 cursor-not-allowed"
            disabled
          >
            📁 Analyser un document juridique (bientôt)
          </button>
        </div>
      </main>
    </div>
  );
}