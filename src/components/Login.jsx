import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

function normalizePhone(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  return raw.replace(/[()\s-]/g, "");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/chat";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanIdentifier = identifier.trim();
    const payload = { password };

    if (cleanIdentifier.includes("@")) {
      if (!isEmail(cleanIdentifier)) {
        setError("Adresse email invalide.");
        return;
      }
      payload.email = cleanIdentifier.toLowerCase();
      payload.identifier = payload.email;
    } else {
      const cleanPhone = normalizePhone(cleanIdentifier);
      if (!/^\+\d{8,15}$/.test(cleanPhone)) {
        setError("Numéro WhatsApp invalide. Exemple : +243816307451");
        return;
      }
      payload.phone = cleanPhone;
      payload.identifier = cleanPhone;
    }

    setLoading(true);
    try {
      await login(payload);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err?.message || "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,#064e3b_0,#0f172a_35%,#020617_100%)] px-4 py-8 text-slate-50">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-2xl md:grid-cols-[0.9fr_1.1fr]">
          <div className="hidden border-r border-white/10 bg-emerald-500/10 p-8 md:block">
            <Link to="/" className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              DroitGPT
            </Link>
            <h1 className="mt-10 text-3xl font-semibold leading-tight">
              Connectez-vous à votre espace juridique et documents.
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Votre compte centralise le chat, les générations payées, les documents en cours et les téléchargements.
            </p>
            <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
              Les générations lancées côté serveur restent récupérables dans "Mes documents", même après une coupure de connexion.
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <Link to="/" className="text-sm text-slate-300 hover:text-white">
                Accueil
              </Link>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                Connexion sécurisée
              </span>
            </div>

            <h2 className="text-2xl font-semibold">Se connecter</h2>
            <p className="mt-2 text-sm text-slate-400">
              Utilisez votre adresse email ou votre numéro WhatsApp.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200">Email ou numéro WhatsApp</label>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  type="text"
                  required
                  placeholder="ex: nom@email.com ou +243816307451"
                  autoComplete="username"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-slate-200">Mot de passe</label>
                  <Link to="/forgot-password" className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                    Mot de passe oublié ?
                  </Link>
                </div>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                />
              </div>

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
                {loading ? "Connexion..." : "Se connecter"}
              </button>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                <p className="text-sm text-slate-300">Vous n'avez pas encore de compte ?</p>
                <Link
                  to={`/register?next=${encodeURIComponent(next)}`}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-emerald-400/40 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/10"
                >
                  Créer un compte
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
