// src/pages/JusticeLab.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CASES, listGeneratedCases } from "../justiceLab/cases";

function getAuthToken() {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token") || localStorage.getItem("token") || null;
  } catch {
    return null;
  }
}

async function postJSON(url, body) {
  const token = getAuthToken();
  if (!token) throw new Error("AUTH_TOKEN_MISSING");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP_${resp.status}:${text.slice(0, 220)}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Même cache que src/justiceLab/cases.js
const CASE_CACHE_KEY_V2 = "justicelab_caseCache_v2";
function saveCaseToCacheV2(caseData) {
  try {
    if (typeof window === "undefined") return;
    if (!caseData?.caseId) return;
    const raw = localStorage.getItem(CASE_CACHE_KEY_V2);
    const cache = raw ? JSON.parse(raw) : {};
    cache[caseData.caseId] = caseData;
    localStorage.setItem(CASE_CACHE_KEY_V2, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function mapDomainToLabel(d) {
  const m = {
    "": "Auto",
    penal: "Pénal",
    foncier: "Foncier",
    travail: "Travail",
    ohada: "OHADA",
    constitutionnel: "Constitutionnel",
    administratif: "Administratif",
    civil: "Civil",
    famille: "Famille",
    fiscal: "Fiscal",
    douanier: "Douanier",
    minier: "Minier",
    militaire: "Pénal militaire",
    environnement: "Environnement",
    routier: "Routier / Circulation",
    immobilier: "Immobilier",
    bancaire: "Bancaire / Finance",
    "droit-des-affaires": "Droit des affaires",
    "propriete-intellectuelle": "Propriété intellectuelle",
  };
  return m[d] || d || "Auto";
}

function mapLevelToLabel(lvl) {
  if (lvl === "avancé") return "Avancé";
  if (lvl === "intermédiaire") return "Intermédiaire";
  return "Débutant";
}

const MAX_DYNAMIC_VISIBLE = 24;

// ✅ Centralisation des options "bientôt dispo"
const UPCOMING_FEATURES = [
  {
    key: "import_pdf",
    title: "📎 Importer un dossier réel (PDF)",
    description: (
      <>
        Ajoute un PDF : on crée un dossier “import” et on le lance en simulation.
        <div className="mt-1 text-[11px] text-slate-500">(Extraction avancée backend = option future)</div>
      </>
    ),
    ctaLabel: "Choisir un PDF (désactivé)",
  },
  {
    key: "exam_mode",
    title: "🎓 Mode Examen ENM / Magistrature",
    description: (
      <>
        Notation “officielle” (plus stricte). Ouvre les audiences avec{" "}
        <code className="text-slate-200">?mode=exam</code>.
        <div className="mt-2 text-[11px] text-slate-500">
          DÉSACTIVÉ — (Le scoring détaillé sera lu dans ton engine / results. Ici on activera le mode côté navigation.)
        </div>
      </>
    ),
    ctaLabel: "Activer (désactivé)",
  },
];

function formatDomainLabel(d) {
  const map = {
    "": "Auto (selon le contenu)",
    penal: "Pénal",
    foncier: "Foncier",
    travail: "Travail",
    ohada: "OHADA (Commercial / Sociétés)",
    constitutionnel: "Constitutionnel",
    administratif: "Administratif",
    civil: "Civil",
    famille: "Famille",
    fiscal: "Fiscal",
    douanier: "Douanier",
    minier: "Minier",
    militaire: "Pénal militaire",
    environnement: "Environnement",
    routier: "Routier / Circulation",
    immobilier: "Immobilier",
    bancaire: "Bancaire / Finance",
    "droit-des-affaires": "Droit des affaires",
    "propriete-intellectuelle": "Propriété intellectuelle",
  };
  return map[d] || d || "—";
}

function badgeForLevel(level) {
  if (level === "avancé") return "bg-rose-500/15 text-rose-200 border-rose-500/40";
  if (level === "intermédiaire") return "bg-amber-500/15 text-amber-200 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-500/40";
}

function safeUpper(v) {
  return String(v || "").toUpperCase();
}

function UpcomingFeatureCard({ title, description, ctaLabel }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-slate-400 mt-1">{description}</div>
        </div>
        <span className="text-[11px] px-2 py-1 rounded-full border border-slate-700 bg-slate-900/40 text-slate-200">
          BIENTÔT DISPO
        </span>
      </div>

      <div className="mt-3">
        <button
          disabled
          className="rounded-xl border border-slate-700 bg-slate-900/30 px-3 py-2 text-xs opacity-60 cursor-not-allowed"
          title="Bientôt disponible"
        >
          {ctaLabel}
        </button>
      </div>

      <div className="mt-3 text-[11px] text-slate-400">
        🔒 Fonctionnalité temporairement désactivée — <span className="text-slate-200">bientôt disponible</span>.
      </div>
    </div>
  );
}

export default function JusticeLab() {
  const navigate = useNavigate();

  // Tabs
  const [tab, setTab] = useState("dossiers"); // dossiers | join | championship
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const baseCases = Array.isArray(CASES) ? CASES : [];

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Générateur
  const [selectedDomain, setSelectedDomain] = useState(""); // "" = auto
  const [selectedLevel, setSelectedLevel] = useState("débutant");
  const [casePrompt, setCasePrompt] = useState("");

  // Dossiers IA (cache)
  const [dynamicCases, setDynamicCases] = useState([]);

  // Recherche / filtres
  const [q, setQ] = useState("");
  const [filterDomain, setFilterDomain] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");

  useEffect(() => {
    const gen = listGeneratedCases?.({ limit: MAX_DYNAMIC_VISIBLE }) || [];
    setDynamicCases(Array.isArray(gen) ? gen.slice(0, MAX_DYNAMIC_VISIBLE) : []);
  }, []);

  const counts = useMemo(() => {
    const localCount = baseCases.length || 0; // attendu: 24
    const aiCount = (dynamicCases || []).length || 0;
    return { localCount, aiCount };
  }, [baseCases, dynamicCases]);

  const allCases = useMemo(() => {
    // IA d’abord (plus récent), puis locaux
    return [...(dynamicCases || []), ...(baseCases || [])];
  }, [dynamicCases, baseCases]);

  const domains = useMemo(
    () => [
      "",
      "penal",
      "foncier",
      "travail",
      "ohada",
      "constitutionnel",
      "administratif",
      "civil",
      "famille",
      "fiscal",
      "douanier",
      "minier",
      "militaire",
      "environnement",
      "routier",
      "immobilier",
      "bancaire",
      "droit-des-affaires",
      "propriete-intellectuelle",
    ],
    []
  );

  const filteredCases = useMemo(() => {
    const query = q.trim().toLowerCase();

    return allCases
      .filter((c) => {
        const domOk = filterDomain === "all" ? true : c?.domain === filterDomain;
        const lvlOk = filterLevel === "all" ? true : (c?.level || "débutant") === filterLevel;

        const text = [
          c?.title,
          c?.summary,
          c?.domain,
          c?.city,
          c?.jurisdiction,
          c?.caseNumber,
          c?.id,
          c?.caseId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const qOk = !query ? true : text.includes(query);
        return domOk && lvlOk && qOk;
      })
      .slice(0, 60);
  }, [allCases, q, filterDomain, filterLevel]);

  function openCase(caseId) {
    const id = encodeURIComponent(caseId);
    navigate(`/justice-lab/play/${id}`);
  }

  async function handleGenerate() {
    setCreateError("");
    setCreating(true);

    try {
      const prompt = (casePrompt || "").trim();
      const domaine = mapDomainToLabel(selectedDomain || "");
      const level = mapLevelToLabel(selectedLevel || "débutant");

      // ✅ Génération côté backend (réelle IA) — inclut prompt utilisateur
      const API_BASE = import.meta?.env?.VITE_INDEXER_API || "https://droitgpt-indexer.onrender.com";
      const resp = await postJSON(`${API_BASE}/justice-lab/generate-case`, {
        mode: "full",
        domaine,
        level,
        lang: "fr",
        seed: String(Date.now()),
        prompt,
      });

      const caseData = resp?.caseData;
      if (!caseData?.caseId) throw new Error("Le backend a renvoyé un dossier invalide (caseId manquant).");

      // ✅ Persist local cache (pour apparaître dans la liste et s’ouvrir immédiatement)
      saveCaseToCacheV2({
        ...caseData,
        meta: { ...(caseData.meta || {}), source: "generated", generatedAt: caseData?.meta?.generatedAt || new Date().toISOString() },
      });

      const gen = listGeneratedCases?.({ limit: MAX_DYNAMIC_VISIBLE }) || [];
      setDynamicCases(Array.isArray(gen) ? gen.slice(0, MAX_DYNAMIC_VISIBLE) : []);

      openCase(caseData.caseId);
    } catch (e) {
      setCreateError(e?.message || "Erreur lors de la génération du dossier.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800/70 bg-slate-950/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.25em] uppercase text-slate-400">DROITGPT • JUSTICE LAB</div>
            <div className="text-lg md:text-xl font-semibold">Simulateur judiciaire intelligent</div>
            <div className="text-xs text-slate-400 mt-1">Gameplay • Réalisme • Pédagogie • Évaluation</div>

            {/* Badges Local vs IA */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] px-2 py-1 rounded-full border border-slate-700 bg-slate-900/40 text-slate-200">
                🔹 Dossiers locaux ({counts.localCount})
              </span>
              <span className="text-[11px] px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                🤖 Dossiers IA ({counts.aiCount})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link className="text-xs text-slate-300 hover:text-white" to="/">
              Accueil
            </Link>
            <Link className="text-xs text-slate-300 hover:text-white" to="/chat">
              Chat juridique
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 md:px-8 py-6">
        {/* Tabs */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab("dossiers")}
            className={
              "px-3 py-2 rounded-xl text-sm border transition " +
              (tab === "dossiers"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-950/40 text-slate-200 hover:border-slate-700")
            }
          >
            Dossiers
          </button>
          <button
            onClick={() => setTab("join")}
            className={
              "px-3 py-2 rounded-xl text-sm border transition " +
              (tab === "join"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-950/40 text-slate-200 hover:border-slate-700")
            }
          >
            Joindre une audience
          </button>
          <button
            onClick={() => setTab("championship")}
            className={
              "px-3 py-2 rounded-xl text-sm border transition border-slate-800 bg-slate-950/40 text-slate-400 cursor-not-allowed"
            }
            disabled
            title="Bientôt disponible"
          >
            Championship (bientôt)
          </button>
        </div>

        {tab === "join" && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 max-w-xl">
            <div className="text-sm font-semibold">Rejoindre une salle d'audience</div>
            <div className="text-xs text-slate-400 mt-1">
              Entre le code de la salle (ex: <span className="text-slate-200">JL-AB12CD</span>).
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                value={joinCode}
                onChange={(e) => {
                  setJoinError("");
                  setJoinCode(e.target.value);
                }}
                placeholder="JL-XXXXXX"
                className="w-full sm:flex-1 px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <button
                onClick={() => {
                  const code = String(joinCode || "").trim().toUpperCase();
                  if (!code) {
                    setJoinError("Code requis.");
                    return;
                  }
                  navigate(`/justice-lab/play?join=1&room=${encodeURIComponent(code)}`);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                Continuer
              </button>
            </div>
            {joinError && <div className="mt-2 text-xs text-rose-300">{joinError}</div>}
          </div>
        )}

        {tab === "championship" && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Championship</div>
            <div className="text-xs text-slate-400 mt-1">
              Bientôt : classement, arbitre IA, finale publique et replays.
            </div>
          </div>
        )}

        {tab === "dossiers" && (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left: Générateur + options bientôt dispo centralisées */}
          <div className="lg:col-span-1 space-y-4">
            {/* Générateur */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">✨ Générateur de dossier</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Domaine optionnel. Si “Auto”, le contenu guide le type de dossier.
                  </div>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                  IA / Hybrid
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Domaine (optionnel)</div>
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  >
                    {domains.map((d) => (
                      <option key={d || "auto"} value={d}>
                        {formatDomainLabel(d)}
                      </option>
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
                  <div className="text-xs text-slate-400 mb-1">Contenu du dossier (texte libre)</div>
                  <textarea
                    value={casePrompt}
                    onChange={(e) => setCasePrompt(e.target.value)}
                    placeholder="Décris les faits, parties, pièces, lieu, dates, enjeux…"
                    rows={6}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none resize-none"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Astuce : plus tu donnes de détails, plus le dossier sera réaliste.
                  </div>
                </div>

                {createError ? (
                  <div className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
                    {createError}
                  </div>
                ) : null}

                <button
                  onClick={handleGenerate}
                  disabled={creating}
                  className="w-full rounded-xl bg-emerald-500 text-white py-2 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60"
                >
                  {creating ? "Génération..." : "Générer un dossier"}
                </button>
              </div>
            </div>

            {/* ✅ Options centralisées : "Bientôt dispo" */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="text-sm font-semibold">🧩 Options (bientôt disponibles)</div>
              <div className="text-xs text-slate-400 mt-1">
                Ces modules sont en préparation. Ils seront activés après finalisation du workflow et du scoring.
              </div>

              <div className="mt-3 space-y-3">
                {UPCOMING_FEATURES.map((f) => (
                  <UpcomingFeatureCard
                    key={f.key}
                    title={f.title}
                    description={f.description}
                    ctaLabel={f.ctaLabel}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Liste des dossiers */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">📚 Dossiers disponibles</div>
                <div className="text-xs text-slate-400 mt-1">
                  Clique sur un dossier pour lancer la simulation (audience / incidents / notation).
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher..."
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none"
                />

                <select
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none"
                >
                  <option value="all">Tous domaines</option>
                  {domains.map((d) => (
                    <option key={`fd-${d || "auto"}`} value={d}>
                      {formatDomainLabel(d)}
                    </option>
                  ))}
                </select>

                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none"
                >
                  <option value="all">Tous niveaux</option>
                  <option value="débutant">Débutant</option>
                  <option value="intermédiaire">Intermédiaire</option>
                  <option value="avancé">Avancé</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              {filteredCases.map((c, idx) => {
                const id = c?.id || c?.caseId || `case-${idx}`;
                const isAI = Boolean(c?.isDynamic);
                return (
                  <button
                    key={id}
                    onClick={() => openCase(id)}
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

                      <div className="flex flex-col items-end gap-2">
                        <span className={`text-[11px] px-2 py-1 rounded-full border ${badgeForLevel(c?.level || "débutant")}`}>
                          {safeUpper(c?.level || "débutant")}
                        </span>

                        <span
                          className={`text-[11px] px-2 py-1 rounded-full border ${
                            isAI
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-slate-700 bg-slate-900/40 text-slate-200"
                          }`}
                        >
                          {isAI ? "IA" : "LOCAL"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 text-[11px] text-slate-400">N° {c?.caseNumber || id}</div>
                  </button>
                );
              })}
            </div>

            {!filteredCases.length ? (
              <div className="mt-6 text-sm text-slate-400">Aucun dossier ne correspond aux filtres.</div>
            ) : null}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
