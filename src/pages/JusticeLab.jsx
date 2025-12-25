import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// ✅ Dossiers dynamiques
import { listGeneratedCases, generateCase, CASE_TEMPLATES } from "../justiceLab/cases.js";
import { readRuns } from "../justiceLab/storage.js";

// ✅ même clé que JusticeLabPlay.jsx
const CASE_CACHE_KEY = "justicelab_caseCache_v1";
const MAX_DYNAMIC_VISIBLE = 18; // affichage (UI)
const MAX_CACHE_ITEMS = 80; // cache persistant (prod)

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}
function safe(v) {
  return String(v ?? "");
}
function randomSeed() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function lsAvailable() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__t";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function loadCaseCache() {
  if (!lsAvailable()) return {};
  try {
    const raw = localStorage.getItem(CASE_CACHE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function persistCaseToCache(caseData) {
  if (!lsAvailable()) return;
  if (!caseData?.caseId) return;

  try {
    const cache = loadCaseCache();
    cache[caseData.caseId] = caseData;

    // ✅ limite cache (garde les plus récents selon generatedAt si dispo)
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_ITEMS) {
      entries.sort((a, b) => {
        const da = a[1]?.meta?.generatedAt || "";
        const db = b[1]?.meta?.generatedAt || "";
        // desc
        return db.localeCompare(da);
      });
      const trimmed = entries.slice(0, MAX_CACHE_ITEMS);
      const nextCache = Object.fromEntries(trimmed);
      localStorage.setItem(CASE_CACHE_KEY, JSON.stringify(nextCache));
      return;
    }

    localStorage.setItem(CASE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function clearCaseCache() {
  if (!lsAvailable()) return;
  try {
    localStorage.removeItem(CASE_CACHE_KEY);
  } catch {
    // ignore
  }
}

function badgeClassByDomain(domain) {
  const d = (domain || "").toLowerCase();
  if (d.includes("pénal") || d.includes("penal")) return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  if (d.includes("foncier")) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (d.includes("travail")) return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  if (d.includes("famille")) return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function normalizeTemplateOptions() {
  // CASE_TEMPLATES peut exister ou pas selon ta version; on assure un fallback
  const arr =
    Array.isArray(CASE_TEMPLATES) && CASE_TEMPLATES.length
      ? CASE_TEMPLATES
      : [
          {
            templateId: "TPL_PENAL_DETENTION",
            domaine: "Pénal",
            baseTitle: "Détention préventive & droits de la défense",
            levels: ["Débutant", "Intermédiaire", "Avancé"],
          },
          {
            templateId: "TPL_FONCIER_TITRE_COUTUME",
            domaine: "Foncier",
            baseTitle: "Conflit titre foncier vs droit coutumier",
            levels: ["Intermédiaire", "Avancé"],
          },
        ];

  return arr.map((t) => ({
    templateId: t.templateId,
    label: `${t.domaine} — ${t.baseTitle}`,
    domaine: t.domaine,
    levels: t.levels || t.levelChoices || ["Intermédiaire"],
  }));
}

export default function JusticeLab() {
  const navigate = useNavigate();

  // Dernier run (résultats)
  const lastRun = useMemo(() => {
    try {
      const runs = readRuns();
      return runs?.[0] || null;
    } catch {
      return null;
    }
  }, []);

  // Catalogue stable
  const baseCases = useMemo(() => listGeneratedCases(), []);

  // Templates disponibles
  const templateOptions = useMemo(() => normalizeTemplateOptions(), []);
  const [selectedTemplate, setSelectedTemplate] = useState(
    templateOptions?.[0]?.templateId || "TPL_PENAL_DETENTION"
  );
  const selectedTemplateObj = useMemo(
    () => templateOptions.find((t) => t.templateId === selectedTemplate) || templateOptions[0],
    [templateOptions, selectedTemplate]
  );

  // Dossiers “dynamiques” visibles (UI)
  const [dynamicCases, setDynamicCases] = useState([]);

  // UI state
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("Tous");
  const [level, setLevel] = useState("Tous");
  const [showPedagogy, setShowPedagogy] = useState(true);

  // ✅ Charger cache persistant en prod (au mount)
  useEffect(() => {
    const cache = loadCaseCache();
    const values = Object.values(cache || {});
    // plus récents d’abord si generatedAt
    values.sort((a, b) => (b?.meta?.generatedAt || "").localeCompare(a?.meta?.generatedAt || ""));
    setDynamicCases(values.slice(0, MAX_DYNAMIC_VISIBLE));
  }, []);

  // Fusion catalogue + dynamiques
  const allCases = useMemo(() => {
    const m = new Map();
    [...dynamicCases, ...baseCases].forEach((c) => {
      if (!c?.caseId) return;
      if (!m.has(c.caseId)) m.set(c.caseId, c);
    });
    return Array.from(m.values());
  }, [dynamicCases, baseCases]);

  const domains = useMemo(() => uniq(allCases.map((c) => c.domaine)).sort(), [allCases]);
  const levels = useMemo(() => uniq(allCases.map((c) => c.niveau)).sort(), [allCases]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allCases
      .filter((c) => {
        if (domain !== "Tous" && c.domaine !== domain) return false;
        if (level !== "Tous" && c.niveau !== level) return false;

        if (!query) return true;

        const hay = [
          c.caseId,
          c.titre,
          c.resume,
          c.domaine,
          c.niveau,
          c.meta?.templateId,
          c.meta?.city,
        ]
          .map((x) => safe(x).toLowerCase())
          .join(" | ");

        return hay.includes(query);
      })
      .slice(0, 60);
  }, [allCases, q, domain, level]);

  const createNewDynamicCase = (forcedLevel = null) => {
    const seed = randomSeed();
    const templateId = selectedTemplate || "TPL_PENAL_DETENTION";

    const lvlChoices = selectedTemplateObj?.levels?.length
      ? selectedTemplateObj.levels
      : ["Débutant", "Intermédiaire", "Avancé"];

    const chosenLevel =
      forcedLevel || lvlChoices[Math.floor(Math.random() * lvlChoices.length)] || "Intermédiaire";

    const c = generateCase({ templateId, seed, level: chosenLevel });

    // ✅ persist cache (prod) + UI
    persistCaseToCache(c);
    setDynamicCases((arr) => [c, ...(arr || [])].slice(0, MAX_DYNAMIC_VISIBLE));
  };

  const clearDynamicHistory = () => {
    clearCaseCache();
    setDynamicCases([]);
  };

  const openCase = (caseId) => {
    // Play lit le cache si dossier dynamique (prod ok)
    navigate(`/justice-lab/play/${encodeURIComponent(caseId)}`);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 md:px-8 py-6 border-b border-white/10 bg-slate-950/70 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              DROITGPT • JUSTICE LAB
            </div>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-emerald-300">
              Jeu de cas pratiques congolais (IA + scoring)
            </h1>
            <p className="mt-1 text-xs md:text-sm text-slate-300 max-w-3xl">
              Pas de cours. Vous traitez des <strong>dossiers</strong>, faites des choix, tenez l’audience,
              rédigez une décision, puis recevez une évaluation continue + une{" "}
              <strong>Cour d’appel IA</strong>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs md:text-sm">
            <Link
              to="/justice-lab/dashboard"
              className="px-4 py-2 rounded-full border border-violet-500/70 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 transition"
            >
              📊 Tableau de bord
            </Link>

            {lastRun && (
              <>
                <Link
                  to={`/justice-lab/results/${encodeURIComponent(lastRun.runId)}`}
                  className="px-4 py-2 rounded-full border border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition"
                >
                  ✅ Dernier résultat
                </Link>
                <Link
                  to={`/justice-lab/journal/${encodeURIComponent(lastRun.runId)}`}
                  className="px-4 py-2 rounded-full border border-amber-500/70 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 transition"
                >
                  🧾 Journal
                </Link>
              </>
            )}

            <Link
              to="/chat"
              className="px-4 py-2 rounded-full border border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition"
            >
              💬 Chat DroitGPT
            </Link>

            <Link
              to="/"
              className="px-4 py-2 rounded-full border border-slate-600/70 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition"
            >
              ⬅️ Accueil
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 md:px-8 py-6 space-y-6">
          {/* Value props */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Mode pratique</p>
              <p className="mt-1 text-sm text-emerald-50">
                Dossier → Qualification → Procédure → Audience → Décision → Score → Appel
              </p>
            </div>
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">Dossiers dynamiques</p>
              <p className="mt-1 text-sm text-sky-50">
                Même template, infinies variantes (seed). Rejouable, partageable, plus réaliste.
              </p>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-violet-300/80">Didacticiel</p>
              <p className="mt-1 text-sm text-violet-50">
                Objectifs pédagogiques + checklist audience + erreurs fréquentes intégrées.
              </p>
            </div>
          </div>

          {/* Generator (prod) */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-100">✨ Générer un nouveau dossier</div>
                <div className="text-xs text-slate-400 mt-1">
                  Le dossier est enregistré dans le cache (production) pour être retrouvable après refresh.
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <div>
                  <label className="text-xs text-slate-400">Template</label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="mt-1 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50 min-w-[320px]"
                  >
                    {templateOptions.map((t) => (
                      <option key={t.templateId} value={t.templateId}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => createNewDynamicCase(null)}
                  className="px-4 py-3 rounded-2xl border border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition"
                  title="Génère un nouveau dossier (seed) — rejouable"
                >
                  Générer
                </button>

                <button
                  type="button"
                  onClick={clearDynamicHistory}
                  className="px-4 py-3 rounded-2xl border border-slate-600/70 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition"
                  title="Efface l’historique des dossiers générés (cache local)"
                >
                  Effacer historique
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(selectedTemplateObj?.levels || ["Débutant", "Intermédiaire", "Avancé"]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => createNewDynamicCase(lvl)}
                  className="text-xs px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                >
                  + {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex-1">
                <label className="text-xs text-slate-400">Recherche</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Chercher: pénal, foncier, titre, détention, seed, ville…"
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                />
              </div>

              <div className="flex gap-3 flex-wrap">
                <div>
                  <label className="text-xs text-slate-400">Domaine</label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="mt-1 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                  >
                    <option value="Tous">Tous</option>
                    {domains.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400">Niveau</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="mt-1 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                  >
                    <option value="Tous">Tous</option>
                    {levels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 mt-6 md:mt-0">
                  <input
                    id="pedago"
                    type="checkbox"
                    checked={showPedagogy}
                    onChange={() => setShowPedagogy((v) => !v)}
                    className="accent-emerald-500"
                  />
                  <label htmlFor="pedago" className="text-xs text-slate-300 select-none">
                    Afficher mode didacticiel
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100">Choisissez un dossier</div>
              <span className="text-xs text-slate-400">
                {filtered.length} affichés • {allCases.length} disponibles
              </span>
            </div>

            {dynamicCases.length ? (
              <div className="mt-3 text-[11px] text-slate-400">
                Dossiers générés (cache) : <span className="text-slate-200 font-semibold">{dynamicCases.length}</span>{" "}
                • Persistant en production (refresh OK).
              </div>
            ) : (
              <div className="mt-3 text-[11px] text-slate-500">Aucun dossier généré récemment. Clique “Générer”.</div>
            )}
          </div>

          {/* Cases grid */}
          <div className="grid gap-4 md:grid-cols-3">
            {filtered.map((c) => (
              <div
                key={c.caseId}
                className="rounded-2xl border border-white/10 bg-slate-950/60 hover:bg-slate-950/80 hover:border-emerald-400/60 transition p-5 flex flex-col"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span
                    className={`px-2 py-1 rounded-full border ${badgeClassByDomain(c.domaine)}`}
                    title={c.meta?.templateId ? `Template: ${c.meta.templateId}` : "Template"}
                  >
                    {c.domaine}
                  </span>
                  <span className="text-slate-500">{c.niveau}</span>
                </div>

                <h3 className="mt-3 text-base font-semibold text-emerald-300">{c.titre}</h3>

                <p className="mt-2 text-sm text-slate-300 leading-relaxed line-clamp-4">{c.resume}</p>

                {showPedagogy && c.pedagogy && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Didacticiel</div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-200">
                      {(c.pedagogy.objectifs || []).slice(0, 3).map((x, i) => (
                        <li key={i}>• {x}</li>
                      ))}
                    </ul>
                    <div className="mt-2 text-[11px] text-slate-400">
                      Checklist audience + erreurs fréquentes incluses.
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => openCase(c.caseId)}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition"
                  >
                    ▶️ Ouvrir le dossier
                  </button>

                  <div className="text-right">
                    <div className="text-slate-500">{c.caseId}</div>
                    {c.meta?.seed ? (
                      <div className="text-[11px] text-slate-500">seed: {String(c.meta.seed).slice(0, 18)}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4 text-xs text-slate-400">
            Conseil : clique “Générer” pour créer une variante. Le seed permet de rejouer exactement le même cas (et Play le
            retrouve via cache).
          </div>
        </div>
      </div>
    </div>
  );
}
