import React, { useEffect, useMemo, useState } from "react";
import MobileMoneyPayment from "../components/payments/MobileMoneyPayment.jsx";
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
import { BUSINESS_PLAN_PACK_ITEMS, BUSINESS_PLAN_PACK_SUMMARY, FREE_BUSINESS_PLAN_SAMPLES } from "../data/businessPlanPackCatalog.js";

const API_BASE = String(import.meta.env.VITE_BP_API_BASE || import.meta.env.VITE_API_BASE || "https://businessplan-v9yy.onrender.com").replace(/\/$/, "");

const CATEGORIES = [
  { id: "all", label: "Toutes", types: [], query: "opportunités entrepreneurs ONG bourses appels d'offres Afrique RDC" },
  { id: "entrepreneurs", label: "Entrepreneurs", types: ["accelerator", "competition", "grant"], query: "startup entrepreneurs PME incubateur accélérateur concours Afrique RDC" },
  { id: "ngo", label: "ONG", types: ["ngo_funding", "call_for_projects", "grant"], query: "financements ONG appels à projets Afrique francophone RDC" },
  { id: "scholarships", label: "Bourses", types: ["scholarship", "fellowship"], query: "bourses fellowship formation étudiants Afrique RDC" },
  { id: "tenders", label: "Appels d'offres", types: ["tender"], query: "appels d'offres marchés procurement tender RDC Afrique" },
];

const TYPES = [
  ["", "Tous"],
  ["grant", "Subvention"],
  ["ngo_funding", "Financement ONG"],
  ["call_for_projects", "Appel à projets"],
  ["tender", "Appel d'offres"],
  ["scholarship", "Bourse"],
  ["competition", "Concours"],
  ["accelerator", "Accélérateur"],
  ["fellowship", "Fellowship"],
];

const SECTORS = [
  ["", "Tous"],
  ["entrepreneurship", "Entrepreneuriat"],
  ["education", "Éducation"],
  ["health", "Santé"],
  ["climate", "Climat"],
  ["agriculture", "Agriculture"],
  ["digital", "Numérique"],
  ["women", "Femmes"],
  ["youth", "Jeunesse"],
  ["procurement", "Marchés"],
];

const DEFAULT_FILTERS = {
  q: "",
  country: "RDC",
  sector: "",
  type: "",
};

const PACK_CATEGORIES = ["Tous", ...Array.from(new Set(BUSINESS_PLAN_PACK_ITEMS.map((item) => item.category))).sort()];

export default function GrantsManagementPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [opportunities, setOpportunities] = useState([]);
  const [patrol, setPatrol] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [packOrder, setPackOrder] = useState("");
  const [packOpenSignal, setPackOpenSignal] = useState(0);
  const [packDownloading, setPackDownloading] = useState(false);
  const [sampleDownloading, setSampleDownloading] = useState("");
  const [packSearch, setPackSearch] = useState("");
  const [packCategory, setPackCategory] = useState("Tous");
  const [showAllPackItems, setShowAllPackItems] = useState(false);

  const category = CATEGORIES.find((item) => item.id === activeCategory) || CATEGORIES[0];
  const currentRows = useMemo(() => sortByDeadline(currentOnly(opportunities)), [opportunities]);
  const packItems = useMemo(() => filterPackItems(packSearch, packCategory), [packSearch, packCategory]);
  const visiblePackItems = showAllPackItems ? packItems : packItems.slice(0, 18);

  useEffect(() => {
    void refreshPatrolStatus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const rows = await loadDirectory({ silent: false }).catch((err) => {
        if (!cancelled) setError(err?.message || "Chargement impossible.");
        return null;
      });
      if (!cancelled && rows) setOpportunities(rows);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, filters.q, filters.country, filters.sector, filters.type]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      await refreshPatrolStatus();
      const rows = await loadDirectory({ silent: true }).catch(() => null);
      if (rows) setOpportunities(rows);
    }, 120_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, filters.q, filters.country, filters.sector, filters.type]);

  async function refreshPatrolStatus() {
    try {
      const data = await getGrantPatrolStatus();
      setPatrol(data);
    } catch {
      // Patrol status is informational only.
    }
  }

  async function loadDirectory({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const base = {
        q: filters.q,
        country: filters.country,
        sector: filters.sector,
        status: "open",
        limit: 80,
      };
      const requestedTypes = filters.type ? [filters.type] : category.types;
      let rows = [];

      if (requestedTypes.length) {
        const batches = await Promise.all(
          requestedTypes.map((type) => listGrantOpportunities({ ...base, type }).catch(() => ({ rows: [] })))
        );
        rows = batches.flatMap((batch) => batch.rows || []);
      } else {
        const data = await listGrantOpportunities(base);
        rows = data.rows || [];
      }

      const next = dedupe(currentOnly(rows));
      if (!silent) {
        setMessage(next.length ? `${next.length} opportunité(s) active(s) disponibles.` : "Aucune opportunité active pour ces critères.");
      }
      return next;
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function runSmartSearch() {
    const q = [filters.q, category.query, filters.country].filter(Boolean).join(" ");
    if (!q.trim()) return;

    setSearching(true);
    setError("");
    setMessage("Recherche intelligente en cours dans l'annuaire...");
    try {
      const data = await semanticSearchGrants(q, {
        country: filters.country,
        sector: filters.sector,
        type: filters.type,
        limit: 40,
      });
      const rows = dedupe(currentOnly(data.rows || []));
      setOpportunities(rows);
      setMessage(`${rows.length} résultat(s) intelligent(s), expirés exclus.`);
    } catch (err) {
      setError(err?.message || "Recherche intelligente indisponible.");
    } finally {
      setSearching(false);
    }
  }

  async function enrichOnline() {
    const q = [filters.q, category.query, filters.country].filter(Boolean).join(" ");
    if (!q.trim()) return;

    setSearching(true);
    setError("");
    setMessage("L'agent DroitGPT cherche en ligne, vérifie les sources et indexe les opportunités ouvertes.");
    try {
      const started = await searchGrants({
        query: q,
        country: filters.country,
        region: "Africa",
        sectors: filters.sector ? [filters.sector] : [],
        types: filters.type ? [filters.type] : category.types,
        language: "fr",
        maxResults: 12,
        candidateLimit: 60,
      });
      const result = await waitForGrantJob(started.jobId);
      const rows = dedupe(currentOnly(result.opportunities || result.result?.results || []));
      setOpportunities(rows.length ? rows : await loadDirectory({ silent: true }));
      setMessage(rows.length ? `${rows.length} opportunité(s) en ligne vérifiée(s) et indexée(s).` : "Recherche terminée. L'annuaire reste affiché avec les résultats disponibles.");
      await refreshPatrolStatus();
    } catch (err) {
      setError(err?.message || "Recherche en ligne impossible.");
    } finally {
      setSearching(false);
    }
  }

  async function waitForGrantJob(jobId) {
    if (!jobId) throw new Error("Job de recherche introuvable.");
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const data = await getGrantJob(jobId);
      const job = data.job;
      if (job?.status === "done") return getGrantJobResult(jobId);
      if (job?.status === "error") throw new Error(job.error || "Recherche en erreur.");
      await sleep(3000);
    }
    throw new Error("Recherche encore en cours côté serveur. Les résultats apparaîtront automatiquement après indexation.");
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
      const data = await getGrantAdvice(opp.id, { country: filters.country, sector: filters.sector });
      setAdvice(data.advice);
    } catch (err) {
      setAdvice({ fitSummary: err?.message || "Conseils indisponibles.", firstActions: [], documentsToPrepare: [], risks: [] });
    } finally {
      setAdviceLoading(false);
    }
  }

  async function downloadPack() {
    if (!packOrder) {
      setPackOpenSignal((value) => value + 1);
      return;
    }

    setPackDownloading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/business-plan-pack/download`, {
        headers: { "X-Payment-Order": packOrder },
      });
      if (!response.ok) throw new Error(await readDownloadError(response));

      await downloadBlob(response, "DroitGPT-Pack-248-Business-Plans.zip");
    } catch (err) {
      setError(err?.message || "Téléchargement impossible.");
    } finally {
      setPackDownloading(false);
    }
  }

  async function downloadSample(sample) {
    if (!sample?.id) return;
    setSampleDownloading(sample.id);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/business-plan-pack/samples/${encodeURIComponent(sample.id)}/download`);
      if (!response.ok) throw new Error(await readDownloadError(response));
      await downloadBlob(response, sample.downloadName || `${sample.id}.docx`);
    } catch (err) {
      setError(err?.message || "Téléchargement du modèle gratuit impossible.");
    } finally {
      setSampleDownloading("");
    }
  }

  return (
    <div className="space-y-6 text-slate-950">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="bg-slate-950 p-6 text-white sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">DroitGPT</p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">Opportunités</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Annuaire intelligent pour entrepreneurs, ONG, étudiants et entreprises : financements, appels à projets,
              appels d'offres, bourses, concours, incubateurs et programmes internationaux.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric value={currentRows.length} label="actives" />
              <Metric value={patrol?.enabled ? "Auto" : "Manuel"} label="mise à jour" />
              <Metric value={nextDeadline(currentRows)} label="prochaine deadline" small />
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-400">
              {patrol?.enabled
                ? `Les sources sont patrouillees automatiquement toutes les ${patrol.intervalMinutes || 360} minutes.`
                : "La page se rafraîchit automatiquement avec les opportunités déjà indexées."}
            </p>
          </div>

          <BusinessPlanPackOffer
            packOrder={packOrder}
            packOpenSignal={packOpenSignal}
            setPackOrder={setPackOrder}
            downloading={packDownloading}
            sampleDownloading={sampleDownloading}
            onBuy={() => setPackOpenSignal((value) => value + 1)}
            onDownload={downloadPack}
            onSampleDownload={downloadSample}
          />
        </div>
      </section>

      {error ? <Notice tone="red">{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <CatalogPanel
          packSearch={packSearch}
          setPackSearch={setPackSearch}
          packCategory={packCategory}
          setPackCategory={setPackCategory}
          items={packItems}
          visibleItems={visiblePackItems}
          showAll={showAllPackItems}
          setShowAll={setShowAllPackItems}
        />

        <OpportunitiesPanel
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          filters={filters}
          setFilters={setFilters}
          rows={currentRows}
          loading={loading || searching}
          onSmartSearch={runSmartSearch}
          onEnrich={enrichOnline}
          onDetails={openDetails}
        />
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

function BusinessPlanPackOffer({ packOrder, packOpenSignal, setPackOrder, downloading, sampleDownloading, onBuy, onDownload, onSampleDownload }) {
  return (
    <div className="relative bg-[linear-gradient(135deg,#ecfdf5,#fff7ed)] p-6 sm:p-8">
      <div className="absolute right-6 top-6 rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white shadow-lg">Promo 20 USD</div>
      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-800">Offre entrepreneur</p>
      <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight text-slate-950">
        Pack de {BUSINESS_PLAN_PACK_SUMMARY.total} plans d'affaires prêts à adapter
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-700">
        Un lot complet pour gagner du temps : business plans, modèles Word, PDF et pitch decks PowerPoint couvrant
        agriculture, mines, commerce, digital, ONG, énergie, immobilier et services.
      </p>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniStat label="Word" value={BUSINESS_PLAN_PACK_SUMMARY.docx} />
        <MiniStat label="PowerPoint" value={BUSINESS_PLAN_PACK_SUMMARY.pptx} />
        <MiniStat label="PDF" value={BUSINESS_PLAN_PACK_SUMMARY.pdf} />
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={packOrder ? onDownload : onBuy}
          disabled={downloading}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {downloading ? "Téléchargement..." : packOrder ? "Télécharger le pack" : "Acheter le pack maintenant"}
        </button>
        <a href="#catalogue-pack" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-800 hover:bg-slate-50">
          Voir les plans inclus
        </a>
      </div>
      <div className="mt-4">
        <MobileMoneyPayment
          apiBase={API_BASE}
          documentType="businessplan_pack"
          openSignal={packOpenSignal}
          launcherTitle="Paiement du pack business plans"
          launcherHint="Paiement unique. Après confirmation, le téléchargement ZIP se débloque."
          paidMessage="Paiement confirmé. Vous pouvez télécharger le pack."
          onPaymentReady={setPackOrder}
        />
      </div>
      <div className="mt-5 rounded-3xl border border-emerald-200 bg-white/80 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Aperçu gratuit</p>
            <h3 className="text-lg font-black text-slate-950">Téléchargez 3 modèles avant d'acheter le pack</h3>
          </div>
          <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Gratuit</span>
        </div>
        <div className="mt-3 grid gap-2">
          {FREE_BUSINESS_PLAN_SAMPLES.map((sample) => (
            <div key={sample.id} className="rounded-2xl border border-slate-100 bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black leading-5 text-slate-900">{sample.title}</p>
                  <p className="mt-1 text-xs font-bold text-emerald-700">{sample.sector} · {sample.format}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSampleDownload(sample)}
                  disabled={sampleDownloading === sample.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {sampleDownloading === sample.id ? "Téléchargement..." : "Télécharger gratuit"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatalogPanel({ packSearch, setPackSearch, packCategory, setPackCategory, items, visibleItems, showAll, setShowAll }) {
  return (
    <section id="catalogue-pack" className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Catalogue du pack</p>
      <h2 className="mt-1 text-2xl font-black">Plans inclus dans l'offre</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {items.length} document(s) correspondent a votre filtre. Le téléchargement final est livre en ZIP.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <input
          value={packSearch}
          onChange={(e) => setPackSearch(e.target.value)}
          placeholder="Chercher un business plan..."
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={packCategory}
          onChange={(e) => setPackCategory(e.target.value)}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {PACK_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>
      <div className="mt-4 max-h-[640px] space-y-2 overflow-y-auto pr-1">
        {visibleItems.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-black leading-5 text-slate-900">{item.title}</p>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">{item.format}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-emerald-700">{item.category}</p>
          </div>
        ))}
      </div>
      {items.length > 18 ? (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
          {showAll ? "Reduire la liste" : `Afficher tous les ${items.length} documents`}
        </button>
      ) : null}
    </section>
  );
}

function OpportunitiesPanel({ activeCategory, setActiveCategory, filters, setFilters, rows, loading, onSmartSearch, onEnrich, onDetails }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Annuaire automatique</p>
          <h2 className="mt-1 text-2xl font-black">Opportunités à jour</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Les opportunités expirées sont filtrees. Chaque résultat doit avoir une source verifiable.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">{rows.length} active(s)</div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveCategory(category.id)}
            className={`rounded-full px-4 py-2 text-sm font-black transition ${activeCategory === category.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_120px_150px_170px]">
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Rechercher : financement ONG, startup, bourse, appel d'offres..."
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          value={filters.country}
          onChange={(e) => setFilters({ ...filters, country: e.target.value })}
          placeholder="Pays"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select value={filters.sector} onChange={(e) => setFilters({ ...filters, sector: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
          {SECTORS.map(([value, label]) => <option key={value || label} value={value}>{label}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
          {TYPES.map(([value, label]) => <option key={value || label} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onSmartSearch} disabled={loading} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
          Recherche intelligente
        </button>
        <button type="button" onClick={onEnrich} disabled={loading} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-60">
          Trouver de nouvelles opportunités
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {loading && !rows.length ? <LoadingCard /> : null}
        {!loading && !rows.length ? <EmptyOpportunities onEnrich={onEnrich} /> : null}
        {rows.map((opp) => <OpportunityCard key={opp.id || opp.sourceUrl} opportunity={opp} onDetails={onDetails} />)}
      </div>
    </section>
  );
}

function OpportunityCard({ opportunity, onDetails }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={opportunity.status} />
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{humanType(opportunity.type)}</span>
        <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{Number(opportunity.reliabilityScore || 0)}/100</span>
      </div>
      <h3 className="mt-4 line-clamp-3 text-lg font-black leading-snug">{opportunity.title}</h3>
      <p className="mt-2 text-sm font-bold text-emerald-700">{opportunity.organization || opportunity.sourceName || "Organisme a vérifier"}</p>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{opportunity.summary || opportunity.description || "Résumé indisponible. Consultez la source officielle."}</p>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <Info label="Deadline" value={formatDate(opportunity.deadline)} />
        <Info label="Pays" value={(opportunity.countries || []).join(", ") || "Non précisé"} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">Voir source</a>
        <button type="button" onClick={() => onDetails(opportunity)} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Details</button>
      </div>
    </article>
  );
}

function DetailsModal({ opportunity, advice, adviceLoading, onAdvice, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="mx-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap gap-2"><StatusBadge status={opportunity.status} /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{humanType(opportunity.type)}</span></div>
            <h2 className="mt-3 text-2xl font-black leading-tight">{opportunity.title}</h2>
            <p className="mt-1 text-sm font-bold text-emerald-700">{opportunity.organization || opportunity.sourceName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Fermer</button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
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
            <Info label="Dernière vérification" value={formatDateTime(opportunity.lastCheckedAt)} />
            <a className="block rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white hover:bg-slate-800" href={opportunity.applicationUrl || opportunity.sourceUrl} target="_blank" rel="noreferrer">Ouvrir le lien officiel</a>
            <button type="button" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100" onClick={onAdvice} disabled={adviceLoading}>{adviceLoading ? "Préparation..." : "Conseils pour postuler"}</button>
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
    </section>
  );
}

function AdviceList({ title, items }) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) return null;
  return <div className="mt-3"><p className="text-xs font-black uppercase tracking-wide text-emerald-800">{title}</p><ul className="mt-2 space-y-1 text-sm text-emerald-950">{rows.map((item, idx) => <li key={`${title}-${idx}`}>- {String(item)}</li>)}</ul></div>;
}

function Metric({ value, label, small }) {
  return <div className="rounded-3xl border border-white/10 bg-white/10 p-4"><p className={small ? "text-lg font-black" : "text-3xl font-black"}>{value}</p><p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-300">{label}</p></div>;
}

function MiniStat({ value, label }) {
  return <div className="rounded-2xl bg-white/75 p-3 ring-1 ring-slate-200"><p className="text-2xl font-black text-slate-950">{value}</p><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p></div>;
}

function Info({ label, value }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || "Non précisé"}</p></div>;
}

function TextBlock({ title, value }) {
  return <section><h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{value || "Information non confirmée dans la source."}</p></section>;
}

function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  if (s === "open") return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 ring-1 ring-emerald-200">Ouverte</span>;
  if (s === "unknown") return <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-800 ring-1 ring-sky-200">A vérifier</span>;
  return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">Revue</span>;
}

function Notice({ tone, children }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${cls}`}>{children}</div>;
}

function LoadingCard() {
  return <div className="col-span-full rounded-3xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500">Chargement automatique des opportunités...</div>;
}

function EmptyOpportunities({ onEnrich }) {
  return <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p className="text-lg font-black">Aucune opportunité active dans cette sélection.</p><p className="mt-2 text-sm text-slate-600">Lancez une recherche en ligne pour enrichir l'annuaire.</p><button type="button" onClick={onEnrich} className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">Trouver de nouvelles opportunités</button></div>;
}

function filterPackItems(query, category) {
  const q = String(query || "").trim().toLowerCase();
  return BUSINESS_PLAN_PACK_ITEMS.filter((item) => {
    const categoryOk = category === "Tous" || item.category === category;
    const queryOk = !q || `${item.title} ${item.category} ${item.format}`.toLowerCase().includes(q);
    return categoryOk && queryOk;
  });
}

function currentOnly(items) {
  return (items || []).filter(isCurrent);
}

function isCurrent(item) {
  if (!item || ["expired", "hidden"].includes(String(item.status || "").toLowerCase())) return false;
  if (!item.deadline) return true;
  const deadline = new Date(item.deadline);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() >= Date.now();
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = item.id || item.sourceUrl || `${item.title}-${item.organization}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return sortByDeadline(out);
}

function sortByDeadline(items) {
  return [...(items || [])].sort((a, b) => dateSort(a.deadline) - dateSort(b.deadline));
}

function dateSort(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function nextDeadline(items) {
  const item = sortByDeadline(items).find((opp) => opp.deadline);
  return item?.deadline ? formatDate(item.deadline) : "-";
}

function formatDate(value) {
  if (!value) return "Non précisée";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatDateTime(value) {
  if (!value) return "Non précisée";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
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
  };
  return labels[type] || "Opportunité";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDownloadError(response) {
  const text = await response.text().catch(() => "");
  try {
    const json = text ? JSON.parse(text) : null;
    return json?.details || json?.error || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

async function downloadBlob(response, fileName) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}



