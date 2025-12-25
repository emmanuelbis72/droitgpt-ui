import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

function getAuthToken() {
  try {
    const candidates = ["token", "authToken", "accessToken", "droitgpt_token"];
    for (const k of candidates) {
      const v = localStorage.getItem(k);
      if (v && v.trim().length > 10) return v.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function NavItem({ to, label, emoji, active, badge }) {
  return (
    <Link
      to={to}
      className={[
        "relative inline-flex items-center gap-2 px-3 py-2 rounded-full border text-xs md:text-sm transition",
        active
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:border-white/20",
      ].join(" ")}
    >
      <span className="text-base md:text-lg leading-none">{emoji}</span>
      <span className="font-medium">{label}</span>

      {badge ? (
        <span className="ml-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold text-rose-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-400" />
          </span>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function TopNav({
  title = "DroitGPT",
  subtitle = "Modules",
  showNewJusticeLab = true,
  rightSlot = null,
}) {
  const { pathname } = useLocation();

  const isAuthed = useMemo(() => !!getAuthToken(), []);
  const isActive = (prefix) => pathname === prefix || pathname.startsWith(prefix + "/");

  return (
    <div className="w-full border-b border-white/10 bg-slate-950/70 backdrop-blur-2xl">
      <div className="px-4 md:px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Brand */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
            <span className="text-lg">⚖️</span>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{subtitle}</div>
            <div className="text-lg md:text-xl font-semibold text-emerald-300 leading-tight">{title}</div>
            <div className="text-[11px] text-slate-400">RDC 🇨🇩 • Assistant juridique & entraînement pratique</div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex flex-wrap gap-2 items-center">
          <NavItem to="/" emoji="🏠" label="Accueil" active={pathname === "/"} />
          <NavItem to="/chat" emoji="💬" label="Chat" active={isActive("/chat")} />
          <NavItem
            to="/justice-lab"
            emoji="⚖️"
            label="Justice Lab"
            active={isActive("/justice-lab")}
            badge={showNewJusticeLab ? "Nouveau" : null}
          />
          <NavItem to="/analyse" emoji="📄" label="Analyse" active={isActive("/analyse")} />
          <NavItem to="/generate" emoji="📝" label="Documents" active={isActive("/generate")} />
          <NavItem to="/assistant-vocal" emoji="🎤" label="Vocal" active={isActive("/assistant-vocal")} />

          {/* Right */}
          {rightSlot ? (
            <div className="ml-1">{rightSlot}</div>
          ) : isAuthed ? (
            <Link
              to="/justice-lab/dashboard"
              className="ml-1 inline-flex items-center gap-2 px-3 py-2 rounded-full border border-violet-500/60 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 transition text-xs md:text-sm"
              title="Tableau de bord Justice Lab"
            >
              📊 Dashboard
            </Link>
          ) : (
            <div className="ml-1 flex gap-2">
              <Link
                to="/login"
                className="inline-flex items-center px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs md:text-sm"
              >
                Se connecter
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center px-3 py-2 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition text-xs md:text-sm"
              >
                Créer un compte
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
