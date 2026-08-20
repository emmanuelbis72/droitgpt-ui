import React, { useEffect, useMemo, useState } from "react";
import {
  getGrantAdvice,
  getGrantJob,
  getGrantJobResult,
  getGrantOpportunity,
  getGrantPatrolStatus,
  listGrantOpportunities,
  searchGrants,
  semanticSearchGrants,
} from "../services/grantsApi.js";

const CATEGORY_DEFS = [
  {
    id: "all",
    label: "Toutes",
    title: "Toutes les opportunités",
    description: "Annuaire complet : financements, appels d'offres, bourses, concours et programmes.",
    accent: "slate",
    types: [],
    query: "",
  },
  {
    id: "entrepreneurs",
    label: "Entrepreneurs",
    title: "Entrepreneurs, startups et PME",
    description: "Incubateurs, accélérateurs, concours, subventions d'innovation et programmes business.",
    accent: "emerald",
    types: ["accelerator", "competition", "grant"],
    query: "startup entrepreneur PME accelerator incubateur concours innovation",
  },
  {
    id: "tenders",
    label: "Appels d'offres",
    title: "Appels d'offres et marchés",
    description: "Procurement, tenders, RFP/RFQ, marchés publics et avis d'appel d'offres.",
    accent: "amber",
    types: ["tender"],
    query: "appel d'offres tender procurement marché public RFP RFQ",
  },
  {
    id: "ngo",
    label: "ONG",
    title: "ONG, ASBL et appels à projets",
    description: "Financements ONG, subventions, appels à propositions et programmes bailleurs.",
    accent: "sky",
    types: ["ngo_funding", "call_for_projects", "grant"],
    query: "ONG ASBL civil society call for proposals financement subvention",
  },
  {
    id: "scholarships",
    label: "Bourses",
    title: "Bourses, fellowships et formations",
    description: "Bourses d'études, fellowships, formations internationales, masters et doctorats.",
    accent: "indigo",
    types: ["scholarship", "fellowship"],
    query: "bourse scholarship fellowship formation master phd étudiant",
  },
];

const TYPES = [
  ["", "Tous les types"],
  ["grant", "Subvention"],
  ["ngo_funding", "Financement ONG"],
  ["call_for_projects", "Appel à projets"],
  ["tender", "Appel d'offres"],
  ["scholarship", "Bourse"],
  ["competition", "Concours"],
  ["accelerator", "Accélérateur / incubateur"],
  ["fellowship", "Fellowship"],
  ["other", "Autre"],
];

const SECTORS = [
  ["", "Tous les secteurs"],
  ["entrepreneurship", "Entrepreneuriat"],
  ["education", "Éducation"],
  ["health", "Santé"],
  ["climate", "Climat"],
  ["agriculture", "Agriculture"],
  ["digital", "Numérique"],
  ["women", "Femmes"],
  ["youth", "Jeunesse"],
  ["governance", "Gouvernance"],
  ["innovation", "Innovation"],
  ["procurement", "Marchés / achats"],
];

const REGION_OPTIONS = [
  ["", "Toutes régions"],
  ["Africa", "Afrique"],
  ["global", "Global"],
  ["francophone", "Afrique francophone"],
  ["RDC", "RDC"],
];

const DEFAULT_FILTERS = {
  q: "",
  country: "RDC",
  region: "",
  sector: "",
  type: "",
  deadlineTo: "",
  limit: 80,
};

const JOB_POLL_ATTEMPTS = 100;
const JOB_POLL_INTERVAL_MS = 3000;

export default function GrantsManagementPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [webSearch, setWebSearch] = useState({
    query: "",
    sites: "",
    maxResults: 12,
  });
  const [opportunities, setOpportunities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [patrol, setPatrol] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const category = CATEGORY_DEFS.find((item) => item.id === activeCategory) || CATEGORY_DEFS[0];
  const currentRows = useMemo(() => currentOnly(opportunities), [opportunities]);
  const stats = useMemo(() => buildStats(currentRows), [currentRows]);

  useEffect(() => {
    refreshPatrolStatus();
    loadDirectory(activeCategory, filters).catch((err) => setError(err.message));
    const timer = window.setInterval(refreshPatrolStatus, 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshPatrolStatus() {
    try {
      const data = await getGrantPatrolStatus();
      setPatrol(data);
    } catch {
      // Non-bloquant pour l'utilisateur.
    }
  }

  async function loadDirectory(categoryId = activeCategory, nextFilters = filters) {
    setLoading(true);
    setError("");
    const cat = CATEGORY_DEFS.find((item) => item.id === categoryId) || CATEGORY_DEFS[0];
    try {
      const rows = await fetchDirectoryRows(cat, nextFilters);
      setOpportunities(rows);
      setMessage(`${rows.length} opportunité(s) ouvertes ou à vérifier chargée(s). Les opportunités expirées sont exclues.`);
      setActiveCategory(categoryId);
    } catch (err) {
      setError(err?.message || "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDirectoryRows(cat, nextFilters) {
    const baseFilters = {
      ...nextFilters,
      q: nextFilters.q,
      limit: nextFilters.limit || 80,
    };

    const requestedType = nextFilters.type;
    if (requestedType) {
      const data = await listGrantOpportunities({ ...baseFilters, type: requestedType });
      return currentOnly(data.rows || []);
    }

    if (!cat.types.length) {
      const data = await listGrantOpportunities(baseFilters);
      return currentOnly(data.rows || []);
    }

    const batches = await Promise.all(
      cat.types.map((type) => listGrantOpportunities({ ...baseFilters, type }).catch(() => ({ rows: [] })))
    );
    return dedupeOpportunities(currentOnly(batches.flatMap((batch) => batch.rows || [])));
  }

  async function runSemanticSearch() {
    const q = cleanJoin(filters.q, category.query);
    if (!q.trim()) {
      await loadDirectory(activeCategory, filters);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await semanticSearchGrants(q, {
        country: filters.country,
        region: filters.region,
        sector: filters.sector,
        type: filters.type,
        limit: 30,
      });
      const rows = currentOnly(data.rows || []);
      setOpportunities(rows);
      setMessage(`${rows.length} résultat(s) intelligents dans l'annuaire. ${data.semantic ? "Recherche sémantique active." : "Mode texte utilisé."}`);
    } catch (err) {
      setError(err?.message || "Recherche intelligente impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function runWebSearch() {
    const query = cleanJoin(webSearch.query, filters.q, category.query, filters.country, filters.region);
    if (!query.trim()) {
      setError("Indique une recherche ou choisis une catégorie avant de lancer la recherche IA.");
      return;
    }

    setSearching(true);
    setError("");
    setMessage("Recherche IA en ligne lancée. DroitGPT vérifie les sources et exclut les opportunités expirées.");
    try {
      const payload = {
        query,
        country: filters.country,
        region: filters.region || "Africa",
        sectors: filters.sector ? [filters.sector] : inferCategorySectors(category),
        types: filters.type ? [filters.type] : category.types,
        sites: splitLines(webSearch.sites),
        language: "fr",
        maxResults: Number(webSearch.maxResults || 12),
        candidateLimit: Math.max(Number(webSearch.maxResults || 12) * 6, 50),
      };
      const started = await searchGrants(payload);
      const result = await pollJob(started.jobId);
      if (result.pending) {
        setJob(result.job);
        setMessage(`Recherche encore en cours sur Render. Job: ${started.jobId}. Reviens dans quelques minutes et clique sur "Récupérer".`);
        return;
      }
      applyJobResult(result);
      await refreshPatrolStatus();
    } catch (err) {
      setError(err?.message || "Recherche IA impossible.");
    } finally {
      setSearching(false);
    }
  }

  async function pollJob(jobId) {
    let latestJob = null;
    for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
      const data = await getGrantJob(jobId);
      latestJob = data.job;
      setJob(latestJob);
      if (latestJob?.status === "done") return getGrantJobResult(jobId);
      if (latestJob?.status === "error") throw new Error(latestJob.error || "Recherche en erreur.");
      await sleep(JOB_POLL_INTERVAL_MS);
    }
    return { pending: true, jobId, job: latestJob };
  }

  async function refreshJobResult() {
    if (!job?.id) return;
    setSearching(true);
    setError("");
    try {
      const data = await getGrantJob(job.id);
      setJob(data.job);
      if (data.job?.status === "done") {
        const result = await getGrantJobResult(job.id);
        applyJobResult(result);
      } else if (data.job?.status === "error") {
        throw new Error(data.job.error || "Recherche en erreur.");
      } else {
        setMessage(`Job encore en cours : ${data.job?.status || "running"}.`);
      }
    } catch (err) {
      setError(err?.message || "Résultat du job indisponible.");
    } finally {
      setSearching(false);
    }
  }

  function applyJobResult(result) {
    const rows = currentOnly(result.opportunities || result.result?.results || []);
    setOpportunities(rows);
    setMessage(`${rows.length} opportunité(s) vérifiée(s) et non expirée(s) trouvée(s).`);
  }

  async function openDetails(opp) {
    setAdvice(null);
    setSelected(opp);
    try {
      const data = await getGrantOpportunity(opp.id);
      if (isCurrent(data.opportunity)) setSelected(data.opportunity);
    } catch {
      setSelected(opp);
    }
  }

  async function loadAdvice(opp) {
    if (!opp?.id) return;
    setAdviceLoading(true);
    setAdvice(null);
    try {
      const data = await getGrantAdvice(opp.id, {
        country: filters.country,
        sector: filters.sector,
        category: category.label,
      });
      setAdvice(data.advice);
    } catch (err) {
      setAdvice({ fitSummary: err?.message || "Conseils indisponibles.", firstActions: [], documentsToPrepare: [], risks: [], draftPositioning: "" });
    } finally {
      setAdviceLoading(false);
    }
  }

  function chooseCategory(id) {
    const next = CATEGORY_DEFS.find((item) => item.id === id) || CATEGORY_DEFS[0];
    const nextFilters = { ...filters, type: "" };
    setActiveCategory(id);
    setFilters(nextFilters);
    setWebSearch((prev) => ({ ...prev, query: next.query }));
    loadDirectory(id, nextFilters);
  }

  return (
    <div className="space-y-6 text-slate-950">
      <Hero
        category={category}
        stats={stats}
        patrol={patrol}
        loading={loading || searching}
        onRefresh={() => loadDirectory(activeCategory, filters)}
      />

      {error ? <Notice tone="red">{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {job ? <JobBanner job={job} loading={searching} onRefresh={refreshJobResult} /> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {CATEGORY_DEFS.map((item) => (
          <CategoryCard
            key={item.id}
            category={item}
            active={item.id === activeCategory}
            count={countForCategory(currentRows, item)}
            onClick={() => chooseCategory(item.id)}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <DirectorySearch
          filters={filters}
          setFilters={setFilters}
          loading={loading}
          onApply={() => loadDirectory(activeCategory, filters)}
          onSemantic={runSemanticSearch}
          onReset={() => {
            setFilters(DEFAULT_FILTERS);
            loadDirectory(activeCategory, DEFAULT_FILTERS);
          }}
        />
        <WebSearchBox
          webSearch={webSearch}
          setWebSearch={setWebSearch}
          category={category}
          searching={searching}
          onSearch={runWebSearch}
        />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Annuaire</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{category.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {category.description} Les cartes affichées ont toutes une source officielle et ne sont pas expirées.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            {currentRows.length} résultat(s)
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {(loading || searching) && !currentRows.length ? <SkeletonCards /> : null}
          {!loading && !searching && !currentRows.length ? <EmptyState onSearch={runWebSearch} /> : null}
          {currentRows.map((opp) => (
            <OpportunityCard key={opp.id || opp.sourceUrl} opportunity={opp} onDetails={openDetails} />
          ))}
        </div>
      </section>

      {selected ? (
        <DetailsModal
          opportunity={selected}
          advice={advice}
          adviceLoading={adviceLoading}
          onAdvice={() => loadAdvice(selected)}
          onClose={() => {
            setSelected(null);
            setAdvice(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Hero({ category, stats, patrol, loading, onRefresh }) {
  return (
    <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-sm">
      <div className="relative p-6 sm:p-8">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">DroitGPT Opportunities</p>
            <h1 className="mt-4 max-w-4xl text-3xl font-black leading-tight sm:text-5xl">
              Un annuaire intelligent d'opportunités à jour.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Entrepreneurs, ONG, étudiants et entreprises peuvent retrouver des financements, appels d'offres,
              bourses, concours, incubateurs et programmes internationaux avec source, deadline et score de fiabilité.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill>Sources vérifiées</Pill>
              <Pill>Pas d'expirées</Pill>
              <Pill>Patrouille automatique</Pill>
              <Pill>Recherche Exa + IA</Pill>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Ouvertes" value={stats.open} />
            <Metric label="À vérifier" value={stats.review} />
            <Metric label="Prochaine deadline" value={stats.nextDeadline ? formatDate(stats.nextDeadline) : "-"} small />
            <Metric label="Catégorie active" value={category.label} small />
          </div>
        </div>

        <div className="relative mt-6 flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-white">Mise à jour automatique</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {patrol?.enabled
                ? `Patrouille active toutes les ${patrol.intervalMinutes || 360} minutes. Dernier passage : ${formatDateTime(patrol.lastRun?.doneAt || patrol.lastRun?.startedAt)}.`
                : "Patrouille automatique désactivée côté backend."}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Actualisation..." : "Actualiser l'annuaire"}
          </button>
        </div>
      </div>
    </section>
  );
}

function CategoryCard({ category, active, count, onClick }) {
  const activeClass = active ? "border-slate-950 bg-slate-950 text-white shadow-lg" : "border-slate-200 bg-white text-slate-950 hover:border-slate-300";
  return (
    <button type="button" onClick={onClick} className={`rounded-3xl border p-4 text-left transition ${activeClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`h-3 w-3 rounded-full ${accentDot(category.accent)}`} />
        <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}>
          {count}
        </span>
      </div>
      <p className="mt-4 text-base font-black">{category.label}</p>
      <p className={`mt-1 line-clamp-2 text-xs leading-5 ${active ? "text-slate-300" : "text-slate-500"}`}>{category.description}</p>
    </button>
  );
}

function DirectorySearch({ filters, setFilters, loading, onApply, onSemantic, onReset }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Recherche dans l'annuaire</p>
      <h2 className="mt-1 text-xl font-black">Filtrer les opportunités déjà indexées</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Mot-clé" value={filters.q} onChange={(v) => setFilters({ ...filters, q: v })} placeholder="ex: santé, startup, éducation, tender..." />
        <Field label="Pays" value={filters.country} onChange={(v) => setFilters({ ...filters, country: v })} placeholder="RDC, Africa, global..." />
        <Select label="Région" value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })} options={REGION_OPTIONS} />
        <Select label="Type" value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })} options={TYPES} />
        <Select label="Secteur" value={filters.sector} onChange={(v) => setFilters({ ...filters, sector: v })} options={SECTORS} />
        <Field label="Deadline avant" type="date" value={filters.deadlineTo} onChange={(v) => setFilters({ ...filters, deadlineTo: v })} />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <PrimaryButton disabled={loading} onClick={onApply}>Appliquer les filtres</PrimaryButton>
        <SecondaryButton disabled={loading} onClick={onSemantic}>Recherche intelligente</SecondaryButton>
        <GhostButton disabled={loading} onClick={onReset}>Réinitialiser</GhostButton>
      </div>
    </section>
  );
}

function WebSearchBox({ webSearch, setWebSearch, category, searching, onSearch }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-700">Agent IA en ligne</p>
      <h2 className="mt-1 text-xl font-black">Trouver et indexer de nouvelles opportunités</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        L'agent recherche en ligne, ouvre les sources, extrait les informations et classe uniquement les résultats non expirés.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px]">
        <Field
          label="Recherche"
          value={webSearch.query}
          onChange={(v) => setWebSearch({ ...webSearch, query: v })}
          placeholder={category.query || "financements ONG santé Afrique francophone 2026"}
        />
        <Field label="Nombre" type="number" value={webSearch.maxResults} onChange={(v) => setWebSearch({ ...webSearch, maxResults: v })} />
      </div>
      <TextArea
        label="Sites à exploiter en priorité"
        value={webSearch.sites}
        onChange={(v) => setWebSearch({ ...webSearch, sites: v })}
        placeholder={"https://www2.fundsforngos.org\nhttps://opportunitydesk.org\nNom du site | https://example.org/opportunities"}
        helper="Optionnel : une ligne par site. Ces sites seront intégrés dans la recherche sans les enregistrer définitivement."
      />
      <div className="mt-4">
        <PrimaryButton disabled={searching} onClick={onSearch}>{searching ? "Recherche en cours..." : "Rechercher en ligne et indexer"}</PrimaryButton>
      </div>
    </section>
  );
}

function OpportunityCard({ opportunity, onDetails }) {
  const status = normalizeStatus(opportunity.status);
  return (
    <article className="flex min-h-[310px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={status} />
          <TypeBadge type={opportunity.type} />
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
          {Number(opportunity.reliabilityScore || 0)}/100
        </span>
      </div>
      <h3 className="mt-4 line-clamp-3 text-lg font-black leading-snug text-slate-950">{opportunity.title}</h3>
      <p className="mt-2 text-sm font-bold text-emerald-700">{opportunity.organization || opportunity.sourceName || "Organisme à vérifier"}</p>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">{opportunity.summary || opportunity.description || "Résumé indisponible. Consultez la source officielle."}</p>
      <div className="mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
        <Info label="Deadline" value={formatDate(opportunity.deadline)} />
        <Info label="Pays" value={(opportunity.countries || []).join(", ") || "Non précisé"} />
        <Info label="Secteurs" value={(opportunity.sectors || []).join(", ") || "Non précisé"} />
        <Info label="Source" value={opportunity.sourceName || hostLabel(opportunity.sourceUrl)} />
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <a className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800" href={opportunity.sourceUrl} target="_blank" rel="noreferrer">
          Voir source
        </a>
        <button className="rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" onClick={() => onDetails(opportunity)}>
          Voir détails
        </button>
      </div>
    </article>
  );
}

function DetailsModal({ opportunity, advice, adviceLoading, onAdvice, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="mx-auto max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={opportunity.status} />
              <TypeBadge type={opportunity.type} />
            </div>
            <h2 className="mt-3 max-w-3xl text-2xl font-black leading-tight text-slate-950">{opportunity.title}</h2>
            <p className="mt-1 text-sm font-bold text-emerald-700">{opportunity.organization || opportunity.sourceName}</p>
          </div>
          <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-5">
            <TextBlock title="Résumé" value={opportunity.summary} />
            <TextBlock title="Description" value={opportunity.description} />
            <TextBlock title="Éligibilité" value={opportunity.eligibility} />
            <TextBlock title="Notes de vérification" value={opportunity.verificationNotes} />
            {advice ? <AdviceBlock advice={advice} /> : null}
          </div>

          <aside className="space-y-3 rounded-3xl bg-slate-50 p-4">
            <Info label="Deadline" value={formatDate(opportunity.deadline)} />
            <Info label="Montant" value={[opportunity.amount, opportunity.currency].filter(Boolean).join(" ") || "Non précisé"} />
            <Info label="Fiabilité" value={`${Number(opportunity.reliabilityScore || 0)}/100`} />
            <Info label="Pays" value={(opportunity.countries || []).join(", ") || "Non précisé"} />
            <Info label="Dernière vérification" value={formatDateTime(opportunity.lastCheckedAt)} />
            <a className="block rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white hover:bg-slate-800" href={opportunity.applicationUrl || opportunity.sourceUrl} target="_blank" rel="noreferrer">
              Ouvrir le lien officiel
            </a>
            <button className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100" onClick={onAdvice} disabled={adviceLoading}>
              {adviceLoading ? "Préparation..." : "Conseils pour postuler"}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AdviceBlock({ advice }) {
  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800">Conseils pour postuler</h3>
      <p className="mt-2 text-sm leading-7 text-emerald-950">{advice.fitSummary || "Analyse indisponible."}</p>
      <AdviceList title="Premières actions" items={advice.firstActions} />
      <AdviceList title="Documents à préparer" items={advice.documentsToPrepare} />
      <AdviceList title="Risques" items={advice.risks} />
      {advice.draftPositioning ? <p className="mt-3 text-sm leading-7 text-emerald-950">{advice.draftPositioning}</p> : null}
    </section>
  );
}

function AdviceList({ title, items }) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-black uppercase tracking-wide text-emerald-800">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-emerald-950">
        {rows.map((item, idx) => (
          <li key={`${title}-${idx}`}>- {String(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="block text-sm">
      <span className="font-black text-slate-700">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-emerald-500 transition focus:ring-2"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="font-black text-slate-700">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-emerald-500 transition focus:ring-2">
        {options.map(([optionValue, labelText]) => (
          <option key={`${optionValue}-${labelText}`} value={optionValue}>{labelText}</option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder = "", helper = "" }) {
  return (
    <label className="mt-4 block text-sm">
      <span className="font-black text-slate-700">{label}</span>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-emerald-500 transition focus:ring-2" />
      {helper ? <span className="mt-1 block text-xs leading-5 text-slate-500">{helper}</span> : null}
    </label>
  );
}

function PrimaryButton({ children, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
      {children}
    </button>
  );
}

function SecondaryButton({ children, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
      {children}
    </button>
  );
}

function GhostButton({ children, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-full px-5 py-3 text-sm font-black text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
      {children}
    </button>
  );
}

function Pill({ children }) {
  return <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{children}</span>;
}

function Metric({ label, value, small }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <p className={small ? "text-lg font-black" : "text-3xl font-black"}>{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-300">{label}</p>
    </div>
  );
}

function Notice({ tone, children }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${cls}`}>{children}</div>;
}

function JobBanner({ job, loading, onRefresh }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <div>Recherche en ligne : <strong>{job.status}</strong>{job.id ? ` | Job ${job.id}` : ""}</div>
      <button type="button" disabled={loading} onClick={onRefresh} className="rounded-full bg-sky-900 px-4 py-2 text-xs font-black text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60">
        Récupérer
      </button>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = normalizeStatus(status);
  if (s === "open") return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 ring-1 ring-emerald-200">Ouverte</span>;
  if (s === "unknown") return <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-800 ring-1 ring-sky-200">À vérifier</span>;
  return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">Revue requise</span>;
}

function TypeBadge({ type }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">{humanType(type)}</span>;
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || "Non précisé"}</p>
    </div>
  );
}

function TextBlock({ title, value }) {
  return (
    <section>
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{value || "Information non confirmée dans la source."}</p>
    </section>
  );
}

function EmptyState({ onSearch }) {
  return (
    <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <p className="text-xl font-black text-slate-950">Aucune opportunité active dans cette sélection.</p>
      <p className="mt-2 text-sm text-slate-600">Élargissez les filtres ou lancez une recherche IA en ligne pour enrichir l'annuaire.</p>
      <button type="button" onClick={onSearch} className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
        Rechercher en ligne
      </button>
    </div>
  );
}

function SkeletonCards() {
  return Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="h-80 animate-pulse rounded-3xl bg-slate-100" />);
}

function currentOnly(items) {
  return (items || []).filter(isCurrent);
}

function isCurrent(item) {
  if (!item || item.status === "expired" || item.status === "hidden") return false;
  if (!item.deadline) return true;
  const deadline = new Date(item.deadline);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() >= Date.now();
}

function dedupeOpportunities(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = item.id || item.sourceUrl || `${item.title}-${item.organization}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => sortDeadline(a.deadline) - sortDeadline(b.deadline));
}

function buildStats(items) {
  const rows = currentOnly(items);
  const dates = rows.map((opp) => new Date(opp.deadline)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
  return {
    open: rows.filter((opp) => opp.status === "open").length,
    review: rows.filter((opp) => opp.status !== "open").length,
    nextDeadline: dates[0] || null,
  };
}

function countForCategory(items, category) {
  if (!category.types.length) return items.length;
  return items.filter((item) => category.types.includes(item.type)).length;
}

function inferCategorySectors(category) {
  if (category.id === "entrepreneurs") return ["entrepreneurship", "digital", "innovation"];
  if (category.id === "tenders") return ["procurement", "business", "services"];
  if (category.id === "scholarships") return ["education", "research", "training"];
  if (category.id === "ngo") return ["education", "health", "climate", "agriculture", "governance"];
  return [];
}

function sortDeadline(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime();
}

function splitLines(value) {
  return String(value || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanJoin(...values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();
  return status || "draft_review";
}

function humanType(type) {
  const labels = {
    grant: "Subvention",
    ngo_funding: "Financement ONG",
    call_for_projects: "Appel à projets",
    tender: "Appel d'offres",
    scholarship: "Bourse",
    competition: "Concours",
    accelerator: "Accélérateur",
    fellowship: "Fellowship",
    other: "Autre",
  };
  return labels[type] || type || "Autre";
}

function accentDot(accent) {
  const map = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    indigo: "bg-indigo-500",
    slate: "bg-slate-500",
  };
  return map[accent] || "bg-slate-500";
}

function formatDate(value) {
  if (!value) return "Non précisée";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d);
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
