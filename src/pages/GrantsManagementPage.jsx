import React, { useEffect, useMemo, useState } from "react";
import {
  addGrantSource,
  crawlGrants,
  getGrantAdvice,
  getGrantJob,
  getGrantJobResult,
  getGrantOpportunity,
  listGrantOpportunities,
  listGrantSources,
  searchGrants,
  semanticSearchGrants,
  updateGrantStatus,
} from "../services/grantsApi.js";

const TYPES = [
  ["", "Tous les types"],
  ["grant", "Subvention"],
  ["scholarship", "Bourse"],
  ["call_for_projects", "Appel à projets"],
  ["competition", "Concours"],
  ["accelerator", "Accélérateur"],
  ["fellowship", "Fellowship"],
  ["ngo_funding", "Financement ONG"],
  ["other", "Autre"],
];

const STATUS_OPTIONS = [
  ["open", "Ouvertes vérifiées"],
  ["unknown", "Deadline inconnue"],
  ["draft_review", "À vérifier"],
  ["expired", "Expirées"],
  ["hidden", "Masquées"],
  ["", "Toutes"],
];

const REGIONS = ["Africa", "global", "Europe", "North America", "Asia", "Middle East"];
const SECTORS = ["education", "health", "climate", "agriculture", "entrepreneurship", "governance", "women", "youth", "digital"];

const DEFAULT_SEARCH = {
  query: "financements ONG santé Afrique francophone 2026",
  country: "RDC",
  region: "Africa",
  sectors: "education, health, climate, agriculture",
  types: "grant, call_for_projects, ngo_funding",
  language: "fr",
  maxResults: 8,
};

const JOB_POLL_ATTEMPTS = 120;
const JOB_POLL_INTERVAL_MS = 3000;

export default function GrantsManagementPage() {
  const [filters, setFilters] = useState({
    q: "",
    type: "",
    country: "RDC",
    region: "Africa",
    sector: "",
    deadlineFrom: "",
    deadlineTo: "",
    status: "open",
    source: "",
    limit: 60,
  });
  const [searchForm, setSearchForm] = useState(DEFAULT_SEARCH);
  const [crawlForm, setCrawlForm] = useState({ cronSecret: "", maxSources: 12, maxPerSource: 2 });
  const [sourceForm, setSourceForm] = useState({ name: "", url: "", type: "ngo_funding", region: "global", active: true });
  const [opportunities, setOpportunities] = useState([]);
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const stats = useMemo(() => ({
    open: opportunities.filter((x) => x.status === "open").length,
    review: opportunities.filter((x) => x.status === "draft_review").length,
    unknown: opportunities.filter((x) => x.status === "unknown").length,
    expired: opportunities.filter((x) => x.status === "expired").length,
  }), [opportunities]);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    loadSources().catch(() => {});
  }, []);

  async function refresh(nextFilters = filters) {
    setLoading(true);
    setError("");
    try {
      const data = await listGrantOpportunities(nextFilters);
      setOpportunities(data.rows || []);
      setMessage(`${data.total || 0} opportunité(s) chargée(s).`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSources() {
    const data = await listGrantSources();
    setSources(data.sources || []);
  }

  async function runAiSearch() {
    setLoading(true);
    setError("");
    setMessage("Recherche IA lancée. Les résultats non vérifiés resteront en revue.");
    try {
      const payload = {
        ...searchForm,
        maxResults: Number(searchForm.maxResults || 8),
        sectors: splitCsv(searchForm.sectors),
        types: splitCsv(searchForm.types),
      };
      const started = await searchGrants(payload);
      const result = await pollJob(started.jobId, "Recherche IA");
      if (result.pending) {
        handlePendingJob(result, "Recherche IA");
        return;
      }
      applyJobResult(result, "Recherche terminée");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runPatrol() {
    setLoading(true);
    setError("");
    setMessage("Patrouille des sources lancée.");
    try {
      const started = await crawlGrants({
        query: searchForm.query,
        country: searchForm.country,
        region: searchForm.region,
        sectors: splitCsv(searchForm.sectors),
        types: splitCsv(searchForm.types),
        language: searchForm.language,
        maxSources: Number(crawlForm.maxSources || 12),
        maxPerSource: Number(crawlForm.maxPerSource || 2),
      }, crawlForm.cronSecret);
      const result = await pollJob(started.jobId, "Patrouille");
      if (result.pending) {
        handlePendingJob(result, "Patrouille");
        return;
      }
      applyJobResult(result, "Patrouille terminée");
    } catch (e) {
      setError(e.message === "UNAUTHORIZED" ? "Clé CRON_SECRET invalide ou absente pour lancer la patrouille." : e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runSemanticFilter() {
    if (!filters.q.trim()) {
      setError("Ajoute une phrase de recherche, par exemple: Je suis une ONG en RDC dans l'éducation.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await semanticSearchGrants(filters.q, { limit: filters.limit || 30 });
      setOpportunities(data.rows || []);
      setMessage(data.semantic ? "Recherche sémantique terminée." : `Recherche classique utilisée: ${data.reason || "Qdrant indisponible"}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function pollJob(jobId, label) {
    let latestJob = null;
    for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
      const data = await getGrantJob(jobId);
      latestJob = data.job;
      setJob(latestJob);
      if (latestJob?.status === "done") return getGrantJobResult(jobId);
      if (latestJob?.status === "error") throw new Error(latestJob.error || `${label} échouée.`);
      await sleep(JOB_POLL_INTERVAL_MS);
    }
    return { pending: true, jobId, job: latestJob, status: latestJob?.status || "running" };
  }

  function applyJobResult(result, prefix) {
    setOpportunities(nonExpired(result.opportunities || result.result?.results || []));
    setFilters((prev) => ({ ...prev, status: "" }));
    setMessage(jobSummary(result, prefix));
  }

  function handlePendingJob(result, label) {
    setMessage(`${label} toujours en cours sur Render. Job: ${result.jobId}. Clique sur \"Récupérer le résultat\" dans le bandeau quand le statut passe à done.`);
  }

  async function refreshCurrentJobResult() {
    if (!job?.id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getGrantJob(job.id);
      setJob(data.job);
      if (data.job?.status === "done") {
        const result = await getGrantJobResult(job.id);
        applyJobResult(result, "Job terminé");
      } else if (data.job?.status === "error") {
        throw new Error(data.job.error || "Job en erreur.");
      } else {
        setMessage(`Job encore en cours: ${data.job?.status || "running"}.`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(opp) {
    setAdvice(null);
    setSelected(opp);
    try {
      const data = await getGrantOpportunity(opp.id);
      setSelected(data.opportunity || opp);
    } catch {
      setSelected(opp);
    }
  }

  async function loadAdvice(opp) {
    setLoading(true);
    setError("");
    try {
      const data = await getGrantAdvice(opp.id, {
        country: filters.country,
        sectors: splitCsv(searchForm.sectors),
        profile: "Utilisateur DroitGPT cherchant une opportunité réelle et vérifiée.",
      });
      setSelected(opp);
      setAdvice(data.advice);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(opp, status) {
    try {
      const data = await updateGrantStatus(opp.id, status);
      setOpportunities((prev) => prev.map((item) => item.id === opp.id ? data.opportunity : item));
      setSelected((prev) => prev?.id === opp.id ? data.opportunity : prev);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitSource(e) {
    e.preventDefault();
    setError("");
    try {
      await addGrantSource(sourceForm);
      setSourceForm({ name: "", url: "", type: "ngo_funding", region: "global", active: true });
      await loadSources();
      setMessage("Source ajoutée à la veille.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6 text-slate-900">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,#10b981_0,#0f172a_42%,#020617_100%)] px-5 py-8 text-white sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">DroitGPT Grants Intelligence</p>
              <h1 className="mt-3 max-w-4xl text-3xl font-black leading-tight sm:text-5xl">
                Opportunités réelles, vérifiées et faciles à exploiter
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">
                Recherche en ligne, patrouille de sources fiables, vérification des deadlines et classification pour ONG, entrepreneurs, bourses et appels à projets.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Ouvertes" value={stats.open} tone="emerald" />
              <Metric label="À vérifier" value={stats.review} tone="amber" />
              <Metric label="Sans deadline" value={stats.unknown} tone="sky" />
              <Metric label="Expirées" value={stats.expired} tone="rose" />
            </div>
          </div>
        </div>
      </section>

      {error ? <Notice tone="red">{error}</Notice> : null}
      {message ? <Notice tone="green">{message}</Notice> : null}
      {job ? <JobBanner job={job} onRefresh={refreshCurrentJobResult} disabled={loading} /> : null}

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Recherche intelligente" eyebrow="IA + sources contrôlées">
          <div className="space-y-4">
            <input
              value={searchForm.query}
              onChange={(e) => setSearchForm({ ...searchForm, query: e.target.value })}
              placeholder="Rechercher des appels à projets, bourses, financements ONG..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-emerald-500 transition focus:ring-2"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Pays" value={searchForm.country} onChange={(v) => setSearchForm({ ...searchForm, country: v })} />
              <Select label="Région" value={searchForm.region} onChange={(v) => setSearchForm({ ...searchForm, region: v })} options={REGIONS.map((x) => [x, x])} />
              <Field label="Langue" value={searchForm.language} onChange={(v) => setSearchForm({ ...searchForm, language: v })} />
              <Field label="Secteurs" value={searchForm.sectors} onChange={(v) => setSearchForm({ ...searchForm, sectors: v })} />
              <Field label="Types" value={searchForm.types} onChange={(v) => setSearchForm({ ...searchForm, types: v })} />
              <Field label="Max résultats" type="number" value={searchForm.maxResults} onChange={(v) => setSearchForm({ ...searchForm, maxResults: v })} />
            </div>
            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={loading} onClick={runAiSearch}>{loading ? "Recherche en cours..." : "Rechercher avec l'IA"}</PrimaryButton>
              <SecondaryButton disabled={loading} onClick={runPatrol}>Lancer une patrouille des opportunités</SecondaryButton>
            </div>
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
              <Field label="Clé CRON_SECRET" type="password" value={crawlForm.cronSecret} onChange={(v) => setCrawlForm({ ...crawlForm, cronSecret: v })} placeholder="Requis pour /grants/crawl" />
              <Field label="Sources max" type="number" value={crawlForm.maxSources} onChange={(v) => setCrawlForm({ ...crawlForm, maxSources: v })} />
              <Field label="Liens par source" type="number" value={crawlForm.maxPerSource} onChange={(v) => setCrawlForm({ ...crawlForm, maxPerSource: v })} />
            </div>
          </div>
        </Panel>

        <Panel title="Ajouter une source" eyebrow="Veille extensible">
          <form className="space-y-3" onSubmit={submitSource}>
            <Field label="Nom" value={sourceForm.name} onChange={(v) => setSourceForm({ ...sourceForm, name: v })} placeholder="Funds for NGOs" />
            <Field label="URL" value={sourceForm.url} onChange={(v) => setSourceForm({ ...sourceForm, url: v })} placeholder="https://..." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Type" value={sourceForm.type} onChange={(v) => setSourceForm({ ...sourceForm, type: v })} options={TYPES.filter(([v]) => v)} />
              <Field label="Région" value={sourceForm.region} onChange={(v) => setSourceForm({ ...sourceForm, region: v })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={sourceForm.active} onChange={(e) => setSourceForm({ ...sourceForm, active: e.target.checked })} />
              Source active pour la patrouille.
            </label>
            <SecondaryButton type="submit">Ajouter la source</SecondaryButton>
            <p className="text-xs text-slate-500">{sources.length} source(s) configurée(s), incluant les plateformes de départ.</p>
          </form>
        </Panel>
      </section>

      <Panel title="Filtres" eyebrow="Catalogue d'opportunités">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Field label="Recherche" value={filters.q} onChange={(v) => setFilters({ ...filters, q: v })} placeholder="ONG, climat, bourse..." />
          <Select label="Type" value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })} options={TYPES} />
          <Field label="Pays" value={filters.country} onChange={(v) => setFilters({ ...filters, country: v })} />
          <Select label="Région" value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })} options={[["", "Toutes"], ...REGIONS.map((x) => [x, x])]} />
          <Select label="Secteur" value={filters.sector} onChange={(v) => setFilters({ ...filters, sector: v })} options={[["", "Tous"], ...SECTORS.map((x) => [x, x])]} />
          <Select label="Statut" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={STATUS_OPTIONS} />
          <Field label="Deadline après" type="date" value={filters.deadlineFrom} onChange={(v) => setFilters({ ...filters, deadlineFrom: v })} />
          <Field label="Source" value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} placeholder="UNDP, YouthOp..." />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <PrimaryButton disabled={loading} onClick={() => refresh(filters)}>Appliquer les filtres</PrimaryButton>
          <SecondaryButton disabled={loading} onClick={runSemanticFilter}>Recherche sémantique</SecondaryButton>
          <SecondaryButton disabled={loading} onClick={() => {
            const next = { q: "", type: "", country: "RDC", region: "Africa", sector: "", deadlineFrom: "", deadlineTo: "", status: "open", source: "", limit: 60 };
            setFilters(next);
            refresh(next);
          }}>Réinitialiser</SecondaryButton>
        </div>
      </Panel>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {loading && !opportunities.length ? <SkeletonCards /> : null}
        {!loading && !opportunities.length ? <EmptyState /> : null}
        {opportunities.map((opp) => (
          <GrantCard key={opp.id} opportunity={opp} onDetails={openDetails} onAdvice={loadAdvice} onStatus={changeStatus} />
        ))}
      </section>

      {selected ? (
        <DetailsModal opportunity={selected} advice={advice} loading={loading} onClose={() => { setSelected(null); setAdvice(null); }} onAdvice={loadAdvice} />
      ) : null}
    </div>
  );
}

function GrantCard({ opportunity, onDetails, onAdvice, onStatus }) {
  return (
    <article className="group flex min-h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <Badge status={opportunity.status} />
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{opportunity.reliabilityScore || 0}/100</span>
      </div>
      <h2 className="mt-4 text-xl font-black leading-snug text-slate-950">{opportunity.title}</h2>
      <p className="mt-2 text-sm font-semibold text-emerald-700">{opportunity.organization || opportunity.sourceName || "Organisme à confirmer"}</p>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">{opportunity.summary || opportunity.description || "Résumé non disponible. Ouvre la source officielle avant toute candidature."}</p>
      <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <Info label="Type" value={humanType(opportunity.type)} />
        <Info label="Deadline" value={formatDate(opportunity.deadline) || opportunity.deadlineText || "À vérifier"} />
        <Info label="Pays" value={(opportunity.countries || []).join(", ") || "Non précisé"} />
        <Info label="Secteurs" value={(opportunity.sectors || []).slice(0, 3).join(", ") || "Non précisé"} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <a className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800" href={opportunity.sourceUrl} target="_blank" rel="noreferrer">Voir source</a>
        <button className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => onDetails(opportunity)}>Voir détails</button>
        <button className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50" onClick={() => onAdvice(opportunity)}>Conseils pour postuler</button>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700" value={opportunity.status} onChange={(e) => onStatus(opportunity, e.target.value)}>
          {STATUS_OPTIONS.filter(([v]) => v).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </article>
  );
}

function DetailsModal({ opportunity, advice, loading, onClose, onAdvice }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="mx-auto max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <Badge status={opportunity.status} />
            <h2 className="mt-3 text-2xl font-black text-slate-950">{opportunity.title}</h2>
            <p className="text-sm font-semibold text-emerald-700">{opportunity.organization || opportunity.sourceName}</p>
          </div>
          <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200" onClick={onClose}>Fermer</button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-5">
            <DetailBlock title="Description" value={opportunity.description || opportunity.summary} />
            <DetailBlock title="Éligibilité" value={opportunity.eligibility} />
            <DetailBlock title="Notes de vérification" value={opportunity.verificationNotes} />
            {advice ? <AdviceBlock advice={advice} /> : null}
          </div>
          <aside className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <Info label="Montant" value={[opportunity.amount, opportunity.currency].filter(Boolean).join(" ") || "Non précisé"} />
            <Info label="Deadline" value={formatDate(opportunity.deadline) || opportunity.deadlineText || "À vérifier"} />
            <Info label="Score de fiabilité" value={`${opportunity.reliabilityScore || 0}/100`} />
            <Info label="Source" value={opportunity.sourceName || host(opportunity.sourceUrl)} />
            <Info label="Dernière vérification" value={formatDateTime(opportunity.lastCheckedAt)} />
            <Info label="Extraction" value={formatDateTime(opportunity.extractedAt)} />
            <a className="block rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white hover:bg-slate-800" href={opportunity.applicationUrl || opportunity.sourceUrl} target="_blank" rel="noreferrer">Ouvrir le lien officiel</a>
            <button className="w-full rounded-2xl border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50" disabled={loading} onClick={() => onAdvice(opportunity)}>
              {loading ? "Analyse..." : "Conseils pour postuler"}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AdviceBlock({ advice }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="text-sm font-black uppercase tracking-wide text-emerald-900">Conseils pour postuler</h3>
      <p className="mt-2 text-sm leading-6 text-emerald-950">{advice.fitSummary}</p>
      <AdviceList title="Premières actions" items={advice.firstActions} />
      <AdviceList title="Documents à préparer" items={advice.documentsToPrepare} />
      <AdviceList title="Risques" items={advice.risks} />
      {advice.draftPositioning ? <p className="mt-3 rounded-xl bg-white p-3 text-sm leading-6 text-slate-700">{advice.draftPositioning}</p> : null}
    </div>
  );
}

function AdviceList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-emerald-950">
        {items.map((item, idx) => <li key={`${title}-${idx}`}>- {item}</li>)}
      </ul>
    </div>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="block text-sm">
      <span className="font-bold text-slate-700">{label}</span>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring-2" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="font-bold text-slate-700">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring-2">
        {options.map(([optionValue, labelText]) => <option key={`${optionValue}-${labelText}`} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}

function PrimaryButton({ children, disabled, onClick, type = "button" }) {
  return <button type={type} disabled={disabled} onClick={onClick} className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{children}</button>;
}

function SecondaryButton({ children, disabled, onClick, type = "button" }) {
  return <button type={type} disabled={disabled} onClick={onClick} className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{children}</button>;
}

function Metric({ label, value, tone }) {
  const tones = { emerald: "bg-emerald-400/15 text-emerald-100", amber: "bg-amber-400/15 text-amber-100", sky: "bg-sky-400/15 text-sky-100", rose: "bg-rose-400/15 text-rose-100" };
  return (
    <div className={`rounded-2xl p-4 ${tones[tone] || tones.emerald}`}>
      <p className="text-3xl font-black">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide opacity-90">{label}</p>
    </div>
  );
}

function Notice({ tone, children }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${cls}`}>{children}</div>;
}

function JobBanner({ job, onRefresh, disabled }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <div>
        Job {job.id}: <strong>{job.status}</strong>{job.query ? ` - ${job.query}` : ""}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRefresh}
        className="rounded-full bg-sky-900 px-4 py-2 text-xs font-black text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Récupérer le résultat
      </button>
    </div>
  );
}

function Badge({ status }) {
  const map = {
    open: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    expired: "bg-rose-100 text-rose-800 ring-rose-200",
    unknown: "bg-sky-100 text-sky-800 ring-sky-200",
    draft_review: "bg-amber-100 text-amber-800 ring-amber-200",
    hidden: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  const labels = { open: "Vérifiée", expired: "Expirée", unknown: "Deadline inconnue", draft_review: "À vérifier", hidden: "Masquée" };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${map[status] || map.draft_review}`}>{labels[status] || status || "À vérifier"}</span>;
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || "Non précisé"}</p>
    </div>
  );
}

function DetailBlock({ title, value }) {
  return (
    <section>
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{value || "Information non confirmée dans la source."}</p>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-xl font-black text-slate-950">Aucune opportunité active trouvée.</p>
      <p className="mt-2 text-sm text-slate-600">Lance une recherche IA, élargis les filtres ou consulte les opportunités à vérifier.</p>
    </div>
  );
}

function SkeletonCards() {
  return Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-72 animate-pulse rounded-3xl bg-slate-100" />);
}

function splitCsv(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
}

function nonExpired(items) {
  return (items || []).filter((item) => item.status !== "expired");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jobSummary(result, prefix) {
  const warning = result.result?.warning ? ` Alerte: ${result.result.warning}.` : "";
  const count = result.opportunities?.length ?? result.result?.total ?? 0;
  return `${prefix}: ${count} opportunité(s) traitée(s).${warning}`;
}

function humanType(type) {
  return Object.fromEntries(TYPES)[type] || type || "Autre";
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d);
}

function formatDateTime(value) {
  if (!value) return "Non précisé";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Non précisé";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source officielle";
  }
}
