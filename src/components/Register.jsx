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

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/chat";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = normalizePhone(phone);

    if (cleanName.length < 2) {
      setError("Veuillez renseigner vos noms.");
      return;
    }

    if (!isEmail(cleanEmail)) {
      setError("Adresse email invalide.");
      return;
    }

    if (!/^\+\d{8,15}$/.test(cleanPhone)) {
      setError("Numéro WhatsApp invalide. Exemple : +243816307451");
      return;
    }

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
      await register({ fullName: cleanName, email: cleanEmail, phone: cleanPhone, password });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err?.message || "Inscription impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,#065f46_0,#0f172a_38%,#020617_100%)] px-4 py-8 text-slate-50">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-2xl md:grid-cols-[0.9fr_1.1fr]">
          <div className="hidden border-r border-white/10 bg-emerald-500/10 p-8 md:block">
            <Link to="/" className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              DroitGPT
            </Link>
            <h1 className="mt-10 text-3xl font-semibold leading-tight">
              Créez votre compte pour générer et retrouver vos documents.
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              L'adresse email servira à sécuriser le compte, récupérer le mot de passe et rattacher votre historique de documents.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">Générations payées suivies côté serveur.</div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">Téléchargements récupérables après reconnexion.</div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <Link to="/" className="text-sm text-slate-300 hover:text-white">
                Accueil
              </Link>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                Inscription
              </span>
            </div>

            <h2 className="text-2xl font-semibold">Créer un compte</h2>
            <p className="mt-2 text-sm text-slate-400">
              Renseignez vos informations principales. Vous pourrez vous connecter par email ou WhatsApp.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200">Nom complet</label>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  type="text"
                  required
                  placeholder="ex: Bisimwa Emmanuel"
                  autoComplete="name"
                />
              </div>

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

              <div>
                <label className="block text-sm font-medium text-slate-200">Numéro WhatsApp</label>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  required
                  placeholder="ex: +243816307451"
                  autoComplete="tel"
                  inputMode="tel"
                />
                <p className="mt-1 text-xs text-slate-500">Format international recommandé : +243...</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-200">Mot de passe</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    required
                    placeholder="Minimum 6 caractères"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200">Confirmation</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    type="password"
                    required
                    placeholder="Répéter le mot de passe"
                    autoComplete="new-password"
                  />
                </div>
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
                {loading ? "Création..." : "Créer mon compte"}
              </button>

              <p className="text-center text-sm text-slate-400">
                Déjà un compte ?{" "}
                <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-emerald-300 hover:text-emerald-200">
                  Se connecter
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
