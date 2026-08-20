import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Lien de réinitialisation incomplet.");
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
      await resetPassword({ token, password });
      navigate("/chat", { replace: true });
    } catch (err) {
      setError(err?.message || "Réinitialisation impossible.");
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
          <h1 className="mt-6 text-2xl font-semibold">Nouveau mot de passe</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Choisissez un mot de passe sécurisé. Après validation, votre session sera ouverte automatiquement.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200">Nouveau mot de passe</label>
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
              <label className="block text-sm font-medium text-slate-200">Confirmer le mot de passe</label>
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

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading || !token}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                loading || !token
                  ? "cursor-wait bg-slate-700 text-slate-300"
                  : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600"
              }`}
            >
              {loading ? "Réinitialisation..." : "Changer le mot de passe"}
            </button>

            {!token ? (
              <p className="text-sm text-slate-400">
                Le lien ne contient pas de token. Demandez un nouveau lien depuis la page mot de passe oublié.
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
