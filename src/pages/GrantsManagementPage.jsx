import React, { useEffect, useMemo, useState } from "react";
import BusinessPlanPackOffer from "../components/businessPlanPack/BusinessPlanPackOffer.jsx";
import { listGrantOpportunities } from "../services/grantsApi.js";
import {
  STATIC_OPPORTUNITIES,
  STATIC_OPPORTUNITIES_LAST_UPDATED,
  STATIC_OPPORTUNITY_CATEGORIES,
} from "../data/staticOpportunities.js";

const DEFAULT_FILTERS = {
  q: "",
  category: "all",
  status: "all",
};

const STATUS_OPTIONS = [
  { id: "all", label: "Tous les statuts" },
  { id: "open", label: "Ouvert" },
  { id: "continuous", label: "Continu" },
  { id: "review", label: "A vérifier" },
];

export default function GrantsManagementPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selected, setSelected] = useState(null);
  const [liveRows, setLiveRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listGrantOpportunities({ status: "open", limit: 100 })
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        setLiveRows(rows.map(normalizeIndexedOpportunity).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setLiveRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    return dedupeOpportunities([...liveRows, ...STATIC_OPPORTUNITIES])
      .filter(isCurrentOpportunity)
      .filter((item) => filters.category === "all" || item.category === filters.category)
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .filter((item) => matchesQuery(item, filters.q))
      .sort(sortByDeadline);
  }, [filters, liveRows]);

  const openCount = rows.filter((item) => item.status === "open").length;
  const continuousCount = rows.filter((item) => item.status === "continuous").length;
  const next = rows.find((item) => item.deadline);

  return (
    <div className="space-y-6 text-slate-950">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.26),transparent_30%),linear-gradient(135deg,#020617,#0f172a_55%,#064e3b)] p-6 text-white sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">DroitGPT</p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">Opportunités</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Annuaire simple pour trouver des opportunités utiles aux entrepreneurs et entreprises en RDC :
              financements, concours, accélérateurs, fonds d'investissement, incubateurs, appels d'offres et offres d'emploi. Les annonces expirées sont masquées automatiquement.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric value={openCount} label="ouvertes" />
              <Metric value={continuousCount} label="sources continues" />
              <Metric value={next?.deadline ? formatDate(next.deadline) : "-"} label="prochaine deadline" small />
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-400">
              Dernière revue manuelle : {formatDate(STATIC_OPPORTUNITIES_LAST_UPDATED)}. Les opportunités indexées par le backend s'ajoutent automatiquement quand elles sont disponibles.
            </p>
          </div>

          <BusinessPlanPackOffer />
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Annuaire RDC</p>
            <h2 className="mt-1 text-2xl font-black">Opportunités à consulter maintenant</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Liste claire et contrôlée, enrichie automatiquement par les opportunités backend déjà indexées. Les sources continues servent de points de veille; les opportunités datées disparaissent automatiquement après leur deadline.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">{rows.length} résultat(s)</div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_180px]">
          <input
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Rechercher : startup, santé, construction, agriculture, appel d'offres, fonds..."
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <select
            value={filters.category}
            onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {STATIC_OPPORTUNITY_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.id} value={status.id}>{status.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {STATIC_OPPORTUNITY_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, category: category.id }))}
              className={`rounded-full px-4 py-2 text-sm font-black transition ${filters.category === category.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {!rows.length ? <EmptyState onReset={() => setFilters(DEFAULT_FILTERS)} /> : null}
          {rows.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} onDetails={() => setSelected(opportunity)} />
          ))}
        </div>
      </section>

      {selected ? <DetailsModal opportunity={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function OpportunityCard({ opportunity, onDetails }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={opportunity.status} />
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{opportunity.type}</span>
        <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{categoryLabel(opportunity.category)}</span>
      </div>
      <h3 className="mt-4 line-clamp-3 text-lg font-black leading-snug">{opportunity.title}</h3>
      <p className="mt-2 text-sm font-bold text-emerald-700">{opportunity.organization}</p>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{opportunity.summary}</p>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <Info label="Deadline" value={opportunity.deadlineText || formatDate(opportunity.deadline)} />
        <Info label="Pays" value={(opportunity.countries || []).join(", ")} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(opportunity.sectors || []).slice(0, 4).map((sector) => (
          <span key={sector} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-100">{sector}</span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">
          Voir source
        </a>
        <button type="button" onClick={onDetails} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
          Voir détails
        </button>
      </div>
    </article>
  );
}

function DetailsModal({ opportunity, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="mx-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={opportunity.status} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{opportunity.type}</span>
            </div>
            <h2 className="mt-3 text-2xl font-black leading-tight">{opportunity.title}</h2>
            <p className="mt-1 text-sm font-bold text-emerald-700">{opportunity.organization}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">
            Fermer
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <TextBlock title="Résumé" value={opportunity.summary} />
            <TextBlock title="Éligibilité" value={opportunity.eligibility} />
            <TextBlock title="Notes de vérification" value={opportunity.verificationNotes} />
          </div>
          <aside className="space-y-3 rounded-3xl bg-slate-50 p-4">
            <Info label="Statut" value={statusLabel(opportunity.status)} />
            <Info label="Deadline" value={opportunity.deadlineText || formatDate(opportunity.deadline)} />
            <Info label="Montant" value={opportunity.amount || "Non précisé"} />
            <Info label="Pays" value={(opportunity.countries || []).join(", ")} />
            <Info label="Secteurs" value={(opportunity.sectors || []).join(", ")} />
            <a className="block rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white hover:bg-slate-800" href={opportunity.sourceUrl} target="_blank" rel="noreferrer">
              Ouvrir la source officielle
            </a>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label, small }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <p className={small ? "text-lg font-black" : "text-3xl font-black"}>{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-300">{label}</p>
    </div>
  );
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
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{value || "Information non précisée."}</p>
    </section>
  );
}

function EmptyState({ onReset }) {
  return (
    <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-lg font-black">Aucune opportunité active dans cette sélection.</p>
      <p className="mt-2 text-sm text-slate-600">Réinitialisez les filtres ou ajoutez une nouvelle entrée dans l'annuaire statique.</p>
      <button type="button" onClick={onReset} className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
        Réinitialiser
      </button>
    </div>
  );
}

function StatusBadge({ status }) {
  const label = statusLabel(status);
  const tone = {
    open: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    continuous: "bg-sky-100 text-sky-800 ring-sky-200",
    review: "bg-amber-100 text-amber-800 ring-amber-200",
  }[status] || "bg-slate-100 text-slate-700 ring-slate-200";

  return <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${tone}`}>{label}</span>;
}

function statusLabel(status) {
  if (status === "open") return "Ouvert";
  if (status === "continuous") return "Continu";
  if (status === "review") return "A vérifier";
  return "A vérifier";
}

function categoryLabel(category) {
  if (category === "funds") return "Fonds";
  if (category === "jobs") return "Offre d'emploi";
  if (category === "tenders") return "Appel d'offres";
  if (category === "entrepreneurs") return "Entrepreneurs";
  return "Opportunité";
}

function normalizeIndexedOpportunity(item) {
  if (!item?.sourceUrl && !item?.source_url) return null;
  const type = String(item.type || item.opportunityType || "").toLowerCase();
  const category =
    type.includes("tender") || type.includes("appel d") || type.includes("procurement")
      ? "tenders"
      : type.includes("job") || type.includes("emploi")
      ? "jobs"
      : type.includes("fund") || type.includes("investment") || type.includes("investissement") || type.includes("incubator")
      ? "funds"
      : "entrepreneurs";

  return {
    id: item.id || `live-${btoa(String(item.sourceUrl || item.source_url)).slice(0, 18)}`,
    category,
    status: normalizeStatus(item.status),
    title: item.title || "Opportunité",
    organization: item.organization || item.sourceName || item.source_name || "Organisation à confirmer",
    type: item.type || "Opportunité indexée",
    deadline: item.deadline || null,
    deadlineText: item.deadlineText || item.deadline_text || "",
    countries: Array.isArray(item.countries) ? item.countries : [],
    sectors: Array.isArray(item.sectors) ? item.sectors : [],
    summary: item.summary || item.description || "",
    eligibility: item.eligibility || "",
    amount: item.amount || "",
    sourceName: item.sourceName || item.source_name || "",
    sourceUrl: item.sourceUrl || item.source_url,
    verificationNotes: item.verificationNotes || item.verification_notes || "Résultat indexé automatiquement par le backend DroitGPT; vérifier la source avant candidature.",
  };
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "open") return "open";
  if (value === "expired" || value === "hidden") return value;
  if (value === "unknown" || value === "draft_review" || value === "review") return "review";
  return "review";
}

function dedupeOpportunities(items) {
  const seen = new Set();
  const rows = [];
  for (const item of items) {
    const key = String(item?.sourceUrl || item?.id || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  return rows;
}

function matchesQuery(item, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const text = [
    item.title,
    item.organization,
    item.type,
    item.summary,
    item.eligibility,
    item.amount,
    item.sourceName,
    ...(item.countries || []),
    ...(item.sectors || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes(q);
}

function isCurrentOpportunity(item) {
  if (!item || item.status === "expired" || item.status === "hidden") return false;
  if (!item.deadline) return true;
  const date = new Date(item.deadline);
  return !Number.isNaN(date.getTime()) && date.getTime() >= Date.now();
}

function sortByDeadline(a, b) {
  return deadlineSortValue(a.deadline) - deadlineSortValue(b.deadline);
}

function deadlineSortValue(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function formatDate(value) {
  if (!value) return "Non précisée";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return String(value);
  }
}
