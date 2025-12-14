import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/chat";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Le mot de passe doit avoir au moins 6 caractères.");
      return;
    }
    if (password !== password2) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      await register({ email: email.trim(), password });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || "Inscription impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="text-xs text-slate-300 hover:text-slate-100 underline">
            ⬅️ Accueil
          </Link>
          <span className="text-[11px] text-slate-400">DroitGPT • Inscription</span>
        </div>

        <h1 className="text-xl font-semibold">Créer un compte</h1>
        <p className="text-xs text-slate-400 mt-1">
          Obligatoire pour accéder aux services DroitGPT.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Email</label>
            <input
              className="w-full px-3 py-2 rounded-2xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="ex: nom@email.com"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Mot de passe</label>
            <input
              className="w-full px-3 py-2 rounded-2xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Confirmer le mot de passe</label>
            <input
              className="w-full px-3 py-2 rounded-2xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              type="password"
              required
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-2xl px-3 py-2">
              ❌ {error}
            </div>
          )}

          <button
            disabled={loading}
            className={`w-full px-4 py-2.5 rounded-2xl text-sm font-medium transition ${
              loading
                ? "bg-slate-700 text-slate-300 cursor-wait"
                : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
            }`}
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>

          <p className="text-[11px] text-slate-400">
            Déjà un compte ?{" "}
            <Link to={`/login?next=${encodeURIComponent(next)}`} className="text-emerald-300 hover:underline">
              Se connecter
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
