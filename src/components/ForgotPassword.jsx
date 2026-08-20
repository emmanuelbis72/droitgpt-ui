import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());
}

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    if (!isEmail(cleanEmail)) {
      setError("Adresse email invalide.");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword({ email: cleanEmail });
      setMessage("Si cette adresse existe, un lien de réinitialisation vient d'être envoyé.");
    } catch (err) {
      setError(err?.message || "Demande impossible pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,#064e3b_0,#0f172a_35%,#020617_100%)] px-4 py-8 text-slate-50">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center">
        <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white">
            Retour à la connexion
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Mot de passe oublié</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Entrez l'adresse email liée à votre compte. Vous recevrez un lien sécurisé pour créer un nouveau mot de passe.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200">Adresse email</label>
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="ex: nom@email.com"
                autoComplete="email"
              />
            </div>

            {message ? (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                loading
                  ? "cursor-wait bg-slate-700 text-slate-300"
                  : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600"
              }`}
            >
              {loading ? "Envoi..." : "Recevoir le lien de réinitialisation"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
