import React, { useEffect, useMemo, useState } from "react";
import {
  getGrantJob,
  getGrantJobResult,
  getGrantOpportunity,
  listGrantOpportunities,
  searchGrants,
} from "../services/grantsApi.js";

const TYPES = [
  ["", "Tous"],
  ["grant", "Subventions"],
  ["ngo_funding", "Financements ONG"],
  ["call_for_projects", "Appels à projets"],
  ["scholarship", "Bourses"],
  ["competition", "Concours"],
  ["accelerator", "Accélérateurs"],
  ["fellowship", "Fellowships"],
];

const SECTORS = [
  ["", "Tous"],
  ["education", "Éducation"],
  ["health", "Santé"],
  ["climate", "Climat"],
  ["agriculture", "Agriculture"],
  ["entrepreneurship", "Entrepreneuriat"],
  ["governance", "Gouvernance"],
  ["women", "Femmes"],
  ["youth", "Jeunesse"],
  ["digital", "Numérique"],
];

const DEFAULT_SEARCH = {
  query: "financements ONG Afrique francophone 2026",
  country: "RDC",
  region: "Africa",
  sector: "education",
  type: "ngo_funding",
  maxResults: 8,
};

const JOB_POLL_ATTEMPTS = 120;
const JOB_POLL_INTERVAL_MS = 3000;

export default function GrantsManagementPage() {
  const [search, setSearch] = useState(DEFAULT_SEARCH);
  const [filters, setFilters] = useState({ q: "", type: "", country: "RDC", sector: "", limit: 60 });
  const [opportunities, setOpportunities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const openCount = opportunities.length;
  const nextDeadline = useMemo(() => {
    const dates = opportunities.map((opp) => new Date(opp.deadline)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
    return dates[0] || null;
  }, [opportunities]);

  useEffect(() => {
    loadOpenOpportunities().catch((e) => setError(e.message));
  }, []);

  async function loadOpenOpportunities(nextFilters = filters) {
    setLoading(true);
    setError("");
    try {
      const data = await listGrantOpportunities({ ...nextFilters, status: "open" });
      setOpportunities(onlyOpen(data.rows || []));
      setMessage(`${data.total || 0} opportunité(s) ouverte(s) chargée(s).`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runSearch() {
    setLoading(true);
    setError("");
    setMessage("Recherche en cours. Seules les opportunités ouvertes seront affichées.");
    try {
      const payload = {
        query: search.query,
        country: search.country,
        region: search.region,
        sectors: search.sector ? [search.sector] : [],
        types: search.type ? [search.type] : [],
        language: "fr",
        maxResults: Number(search.maxResults || 8),
      };
      const started = await searchGrants(payload);
      const result = await pollJob(started.jobId);
      if (result.pending) {
        setMessage(`Recherche encore en cours sur Render. Job: ${result.jobId}. Utilise le bouton "Récupérer" quand il sera terminé.`);
        return;
      }
      applyJobResult(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
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
    setLoading(true);
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
        setMessage(`Job encore en cours: ${data.job?.status || "running"}.`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyJobResult(result) {
    const rows = onlyOpen(result.opportunities || result.result?.results || []);
    setOpportunities(rows);
    setFilters((prev) => ({ ...prev, status: "open" }));
    setMessage(`${rows.length} opportunité(s) ouverte(s) trouvée(s). Les opportunités expirées sont exclues.`);
  }

  async function openDetails(opp) {
    setSelected(opp);
    try {
      const data = await getGrantOpportunity(opp.id);
      if (data.opportunity?.status === "open") setSelected(data.opportunity);
    } catch {
      setSelected(opp);
    }
  }

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">DroitGPT Grants</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <h1 className="max-w-3xl text-3xl font-black leading-tight sm:text-5xl">Opportunités ouvertes et vérifiées</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Recherche des appels à projets, financements ONG, bourses et programmes encore ouverts. Les opportunités expirées ne sont pas affichées.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Ouvertes" value={openCount} />
            <Metric label="Prochaine deadline" value={nextDeadline ? formatDate(nextDeadline) : "-"} small />
          </div>
        </div>
      </section>

      {error ? <Notice tone="red">{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {job ? <JobBanner job={job} loading={loading} onRefresh={refreshJobResult} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Rechercher une opportunité</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_150px_170px_190px_120px]">
          <Field label="Recherche" value={search.query} onChange={(v) => setSearch({ ...search, query: v })} placeholder="Rechercher des appels à projets, bourses, financements ONG..." />
          <Field label="Pays" value={search.country} onChange={(v) => setSearch({ ...search, country: v })} />
          <Select label="Secteur" value={search.sector} onChange={(v) => setSearch({ ...search, sector: v })} options={SECTORS} />
          <Select label="Type" value={search.type} onChange={(v) => setSearch({ ...search, type: v })} options={TYPES} />
          <Field label="Résultats" type="number" value={search.maxResults} onChange={(v) => setSearch({ ...search, maxResults: v })} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <PrimaryButton disabled={loading || !search.query.trim()} onClick={runSearch}>{loading ? "Recherche..." : "Rechercher avec l'IA"}</PrimaryButton>
          <SecondaryButton disabled={loading} onClick={() => loadOpenOpportunities(filters)}>Actualiser la liste</SecondaryButton>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Filtrer les opportunités ouvertes</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Field label="Mot-clé" value={filters.q} onChange={(v) => setFilters({ ...filters, q: v })} placeholder="ONG, climat, santé..." />
          <Field label="Pays" value={filters.country} onChange={(v) => setFilters({ ...filters, country: v })} />
          <Select label="Secteur" value={filters.sector} onChange={(v) => setFilters({ ...filters, sector: v })} options={SECTORS} />
          <Select label="Type" value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })} options={TYPES} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <PrimaryButton disabled={loading} onClick={() => loadOpenOpportunities(filters)}>Appliquer</PrimaryButton>
          <SecondaryButton disabled={loading} onClick={() => {
            const reset = { q: "", type: "", country: "RDC", sector: "", limit: 60 };
            setFilters(reset);
            loadOpenOpportunities(reset);
          }}>Réinitialiser</SecondaryButton>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {loading && !opportunities.length ? <SkeletonCards /> : null}
        {!loading && !opportunities.length ? <EmptyState /> : null}
        {opportunities.map((opp) => <OpportunityCard key={opp.id} opportunity={opp} onDetails={openDetails} />)}
      </section>

      {selected ? <DetailsModal opportunity={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function OpportunityCard({ opportunity, onDetails }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 ring-1 ring-emerald-200">Ouverte</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{opportunity.reliabilityScore || 0}/100</span>
      </div>
      <h3 className="mt-4 text-xl font-black leading-snug text-slate-950">{opportunity.title}</h3>
      <p className="mt-2 text-sm font-semibold text-emerald-700">{opportunity.organization || opportunity.sourceName || "Organisme confirmé par source"}</p>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">{opportunity.summary || opportunity.description || "Résumé indisponible. Consulte la source officielle."}</p>
      <div className="mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
        <Info label="Deadline" value={formatDate(opportunity.deadline)} />
        <Info label="Type" value={humanType(opportunity.type)} />
        <Info label="Pays" value={(opportunity.countries || []).join(", ") || "Non précisé"} />
        <Info label="Secteurs" value={(opportunity.sectors || []).join(", ") || "Non précisé"} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <a className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800" href={opportunity.sourceUrl} target="_blank" rel="noreferrer">Voir source</a>
        <button className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => onDetails(opportunity)}>Détails</button>
      </div>
    </article>
  );
}

function DetailsModal({ opportunity, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="mx-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
          <div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Ouverte</span>
            <h2 className="mt-3 text-2xl font-black text-slate-950">{opportunity.title}</h2>
            <p className="text-sm font-semibold text-emerald-700">{opportunity.organization || opportunity.sourceName}</p>
          </div>
          <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200" onClick={onClose}>Fermer</button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <TextBlock title="Description" value={opportunity.description || opportunity.summary} />
            <TextBlock title="Éligibilité" value={opportunity.eligibility} />
            <TextBlock title="Notes de vérification" value={opportunity.verificationNotes} />
          </div>
          <aside className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <Info label="Deadline" value={formatDate(opportunity.deadline)} />
            <Info label="Montant" value={[opportunity.amount, opportunity.currency].filter(Boolean).join(" ") || "Non précisé"} />
            <Info label="Fiabilité" value={`${opportunity.reliabilityScore || 0}/100`} />
            <Info label="Dernière vérification" value={formatDateTime(opportunity.lastCheckedAt)} />
            <a className="block rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white hover:bg-slate-800" href={opportunity.applicationUrl || opportunity.sourceUrl} target="_blank" rel="noreferrer">Ouvrir le lien officiel</a>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="block text-sm">
      <span className="font-bold text-slate-700">{label}</span>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring-2" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="font-bold text-slate-700">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring-2">
        {options.map(([value, labelText]) => <option key={`${value}-${labelText}`} value={value}>{labelText}</option>)}
      </select>
    </label>
  );
}

function PrimaryButton({ children, disabled, onClick }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{children}</button>;
}

function SecondaryButton({ children, disabled, onClick }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{children}</button>;
}

function Metric({ label, value, small }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className={small ? "text-lg font-black" : "text-3xl font-black"}>{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-300">{label}</p>
    </div>
  );
}

function Notice({ tone, children }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${cls}`}>{children}</div>;
}

function JobBanner({ job, loading, onRefresh }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <div>Job {job.id}: <strong>{job.status}</strong>{job.query ? ` - ${job.query}` : ""}</div>
      <button type="button" disabled={loading} onClick={onRefresh} className="rounded-full bg-sky-900 px-4 py-2 text-xs font-black text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60">Récupérer</button>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
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

function EmptyState() {
  return (
    <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-xl font-black text-slate-950">Aucune opportunité ouverte.</p>
      <p className="mt-2 text-sm text-slate-600">Lance une nouvelle recherche ou élargis les filtres. Les opportunités expirées sont volontairement exclues.</p>
    </div>
  );
}

function SkeletonCards() {
  return Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-72 animate-pulse rounded-3xl bg-slate-100" />);
}

function onlyOpen(items) {
  return (items || []).filter((item) => item.status === "open" && item.deadline && new Date(item.deadline).getTime() >= Date.now());
}

function splitCsv(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanType(type) {
  return Object.fromEntries(TYPES)[type] || type || "Autre";
}

function formatDate(value) {
  if (!value) return "Non précisé";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Non précisé";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d);
}

function formatDateTime(value) {
  if (!value) return "Non précisé";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Non précisé";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
