// ./pages/JusticeLab.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CASES, CASE_TEMPLATES, generateCase, listGeneratedCases } from "../justiceLab/cases";
import { readRuns } from "../justiceLab/storage";

const MAX_DYNAMIC_VISIBLE = 24;

function formatDomainLabel(d) {
  const map = {
    penal: "Pénal",
    foncier: "Foncier",
    travail: "Travail",
    famille: "Famille",
    constitutionnel: "Constitutionnel",
    militaire: "Pénal militaire",
    administratif: "Administratif",
    commercial: "Commercial / OHADA",
  };
  return map[d] || d || "—";
}

function badgeForLevel(level) {
  if (level === "avancé") return "bg-rose-500/15 text-rose-200 border-rose-500/40";
  if (level === "intermédiaire") return "bg-amber-500/15 text-amber-200 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-500/40";
}

export default function JusticeLab() {
  const navigate = useNavigate();

  const baseCases = Array.isArray(CASES) ? CASES : [];
  const templates = Array.isArray(CASE_TEMPLATES) ? CASE_TEMPLATES : [];

  const [selectedDomain, setSelectedDomain] = useState("penal");
  const [selectedLevel, setSelectedLevel] = useState("débutant");
  const [seed, setSeed] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [dynamicCases, setDynamicCases] = useState([]);

  const [q, setQ] = useState("");
  const [filterDomain, setFilterDomain] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");

  const [runs, setRuns] = useState([]);

  useEffect(() => {
    const gen = listGeneratedCases?.() || [];
    setDynamicCases(Array.isArray(gen) ? gen.slice(0, MAX_DYNAMIC_VISIBLE) : []);

    const r = readRuns?.() || [];
    setRuns(Array.isArray(r) ? r : []);
  }, []);

  const allCases = useMemo(() => {
    const dyn = Array.isArray(dynamicCases) ? dynamicCases : [];
    const base = Array.isArray(baseCases) ? baseCases : [];
    return [...dyn, ...base];
  }, [dynamicCases, baseCases]);

  const filteredCases = useMemo(() => {
    const query = q.trim().toLowerCase();

    return allCases
      .filter((c) => {
        const domOk = filterDomain === "all" ? true : c?.domain === filterDomain;
        const lvlOk = filterLevel === "all" ? true : (c?.level || "débutant") === filterLevel;

        const text = [
          c?.title,
          c?.domain,
          c?.city,
          c?.jurisdiction,
          c?.parties?.demandeur?.name,
          c?.parties?.defendeur?.name,
          c?.caseNumber,
          c?.summary,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const qOk = !query ? true : text.includes(query);
        return domOk && lvlOk && qOk;
      })
      .slice(0, 60);
  }, [allCases, q, filterDomain, filterLevel]);

  const lastRun = useMemo(() => {
    if (!runs?.length) return null;
    const sorted = [...runs].sort((a, b) => {
      const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return tb - ta;
    });
    return sorted[0] || null;
  }, [runs]);

  function handleOpenCase(caseId) {
    // ✅ route alignée avec JusticeLabPlay.jsx
    navigate(`/justice-lab/play/${encodeURIComponent(caseId)}`);
  }

  async function handleGenerate() {
    setCreateError("");
    setCreating(true);

    try {
      const preferredTemplate = templates[0];
      const normalizedSeed = seed.trim() || String(Date.now());

      const newCase = await Promise.resolve(
        generateCase({
          templateId: preferredTemplate?.templateId,
          seed: normalizedSeed,
          level: selectedLevel,
          domain: selectedDomain,
        })
      );

      if (!newCase?.id) throw new Error("Le générateur a renvoyé un dossier invalide (id manquant).");

      const gen = listGeneratedCases?.() || [];
      setDynamicCases(Array.isArray(gen) ? gen.slice(0, MAX_DYNAMIC_VISIBLE) : []);

      handleOpenCase(newCase.id);
    } catch (e) {
      setCreateError(e?.message || "Erreur lors de la génération du dossier.");
    } finally {
      setCreating(false);
    }
  }

  const domains = useMemo(() => {
    const set = new Set();
    templates.forEach((t) => t?.domaine && set.add(String(t.domaine).toLowerCase()));
    baseCases.forEach((c) => c?.domain && set.add(c.domain));
    if (!set.size) ["penal", "foncier", "travail", "famille", "constitutionnel", "militaire"].forEach((d) => set.add(d));
    return Array.from(set);
  }, [templates, baseCases]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="border-b border-slate-800/70 bg-slate-950/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.25em] uppercase text-slate-400">DROITGPT • JUSTICE LAB</div>
            <div className="text-lg font-semibold">Simulateur judiciaire intelligent</div>
            <div className="text-xs text-slate-400 mt-1">Génération de dossiers + audience + scoring</div>
          </div>

          <div className="flex items-center gap-2">
            <Link className="text-xs text-slate-300 hover:text-white" to="/">Accueil</Link>
            <Link className="text-xs text-slate-300 hover:text-white" to="/chat">Chat juridique</Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 md:px-8 py-6">
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">✨ Générateur</div>
            <div className="mt-3 grid gap-2">
              <div>
                <div className="text-xs text-slate-400 mb-1">Domaine</div>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                >
                  {domains.map((d) => (
                    <option key={d} value={d}>{formatDomainLabel(d)}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-1">Niveau</div>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                >
                  <option value="débutant">Débutant</option>
                  <option value="intermédiaire">Intermédiaire</option>
                  <option value="avancé">Avancé</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-1">Seed (optionnel)</div>
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="ex: 2026-01"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={creating}
                className={`px-4 py-2.5 rounded-2xl text-sm font-semibold transition ${
                  creating
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                }`}
              >
                {creating ? "Génération en cours…" : "✨ Générer un dossier IA"}
              </button>

              {createError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                  {createError}
                </div>
              )}

              {lastRun?.runId && (
                <button
                  onClick={() => navigate(`/justice-lab/play/${encodeURIComponent(lastRun.runId)}?mode=run`)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold border border-white/10 bg-white/5 hover:bg-white/10"
                >
                  ▶️ Reprendre la dernière audience
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Dossiers disponibles</h2>
                <p className="text-xs text-slate-400 mt-1">Clique un dossier pour lancer la simulation.</p>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher (ville, N° dossier, mots-clés)…"
                  className="w-full md:w-72 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                />

                <select
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                >
                  <option value="all">Tous domaines</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>{formatDomainLabel(d)}</option>
                  ))}
                </select>

                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                >
                  <option value="all">Tous niveaux</option>
                  <option value="débutant">Débutant</option>
                  <option value="intermédiaire">Intermédiaire</option>
                  <option value="avancé">Avancé</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              {filteredCases.map((c, idx) => (
                <button
                  key={c?.id || c?.caseId || `case-${idx}`}
                  onClick={() => handleOpenCase(c?.id || c?.caseId)}
                  className="text-left rounded-2xl border border-white/10 bg-slate-950/40 hover:bg-white/5 transition p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-400">
                        {formatDomainLabel(c?.domain)} • {c?.city || "—"} • {c?.jurisdiction || "—"}
                      </div>
                      <div className="mt-1 font-semibold">{c?.title || "Dossier"}</div>
                      <div className="mt-2 text-xs text-slate-300 line-clamp-2">{c?.summary || ""}</div>
                    </div>

                    <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full border ${badgeForLevel(c?.level || "débutant")}`}>
                      {(c?.level || "débutant").toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-3 text-[11px] text-slate-400">
                    N° {c?.caseNumber || c?.id}
                    {c?.isDynamic ? <span className="ml-2 text-emerald-300">• IA</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
