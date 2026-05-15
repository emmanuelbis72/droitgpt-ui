import React, { useEffect, useMemo, useState } from "react";
import { BP_API_BASE } from "../config/api.js";

const TYPES = [
  { value: "ngo", label: "Appels à projets", hint: "ONG, ASBL, associations, programmes publics" },
  { value: "entrepreneur", label: "Financement entrepreneurial", hint: "PME, startups, incubateurs, accélérateurs" },
  { value: "scholarship", label: "Bourses et fellowships", hint: "Études, formations, recherche, leadership" },
];

const TARGETS = [
  { value: "ong", label: "ONG / ASBL" },
  { value: "entrepreneurs", label: "Entrepreneurs / PME / startups" },
  { value: "students", label: "Étudiants / chercheurs" },
];

const DOMAINS = [
  ["education", "Éducation"],
  ["sante", "Santé"],
  ["agriculture", "Agriculture"],
  ["climat", "Climat / environnement"],
  ["droits", "Droits humains / gouvernance"],
  ["femmes", "Femmes / genre"],
  ["jeunes", "Jeunesse"],
  ["numerique", "Numérique / innovation"],
];

const COUNTRIES = [
  ["RDC", "RDC / Congo-Kinshasa"],
  ["Africa", "Afrique"],
  ["Congo", "Congo"],
  ["Rwanda", "Rwanda"],
  ["Burundi", "Burundi"],
  ["Cameroon", "Cameroun"],
  ["Senegal", "Sénégal"],
  ["Cote d'Ivoire", "Côte d'Ivoire"],
  ["Kenya", "Kenya"],
  ["Nigeria", "Nigeria"],
];

const SOURCE_OPTIONS = [
  ["", "Toutes les sources"],
  ["grants.gov", "Grants.gov"],
  ["eu", "Union européenne"],
  ["worldbank", "Banque mondiale"],
  ["ungm", "UNGM / ONU"],
  ["undp", "PNUD / UNDP"],
  ["opportunities-for-youth", "Opportunities for Youth"],
  ["vc4a", "VC4A"],
  ["scholarshipset", "ScholarshipSet"],
  ["foundations", "Fondations"],
  ["embassies", "Ambassades"],
  ["scholarships", "Portails bourses"],
  ["entrepreneurship", "Entrepreneuriat"],
  ["ngo-portals", "Portails ONG"],
  ["drc-local", "Sources RDC/Congo"],
  ["linkedin", "LinkedIn"],
  ["import-externe", "Import externe"],
];

const VALIDITY_OPTIONS = [
  ["", "Toutes"],
  ["drc", "Valable RDC / Congo / Afrique"],
  ["deadline", "Avec date limite"],
  ["high", "Score élevé"],
  ["search_link", "À vérifier manuellement"],
];

const STATUSES = [
  { value: "a_analyser", label: "À analyser" },
  { value: "candidat", label: "Candidat" },
  { value: "soumis", label: "Soumis" },
  { value: "rejete", label: "Rejeté" },
  { value: "archive", label: "Archivé" },
];

const TYPE_SOURCES = {
  ngo: ["grants.gov", "undp", "eu", "worldbank", "ungm", "foundations", "embassies", "ngo-portals", "drc-local", "opportunities-for-youth"],
  entrepreneur: ["vc4a", "entrepreneurship", "opportunities-for-youth", "foundations", "worldbank", "eu", "linkedin", "drc-local"],
  scholarship: ["scholarshipset", "scholarships", "opportunities-for-youth", "embassies", "foundations", "linkedin", "drc-local"],
};

const PROFILE_FIELDS = [
  ["name", "Nom de l'organisation"],
  ["legalStatus", "Statut légal"],
  ["country", "Pays"],
  ["city", "Ville"],
  ["contactEmail", "Email de contact"],
  ["mission", "Mission"],
  ["sectors", "Secteurs d'intervention"],
  ["targetGroups", "Groupes cibles"],
  ["geographicFocus", "Zone d'intervention"],
  ["pastProjects", "Références / projets passés"],
  ["team", "Équipe"],
  ["partners", "Partenaires"],
  ["annualBudget", "Budget annuel"],
  ["monitoringEvaluation", "Suivi-évaluation"],
  ["impactEvidence", "Preuves d'impact"],
  ["documentsReady", "Documents disponibles"],
];

const LONG_PROFILE_FIELDS = new Set([
  "mission",
  "targetGroups",
  "pastProjects",
  "team",
  "partners",
  "monitoringEvaluation",
  "impactEvidence",
  "documentsReady",
]);

const IMPORT_EXAMPLE = `Titre | Bailleur | Date limite | URL | Description
Fonds innovation sociale RDC | Fondation Exemple | 2026-07-15 | https://example.org/call | Appel pour ONG locales
https://www.undp.org/fr/drcongo/appels-a-projets
Programme entrepreneuriat féminin | Ambassade X | 2026-08-01 | https://example.org/program`;

export default function GrantsManagementPage() {
  const API_BASE = BP_API_BASE || "https://businessplan-v9yy.onrender.com";
  const grantsApi = useMemo(() => `${API_BASE.replace(/\/$/, "")}/generate-grants-management`, [API_BASE]);

  const [view, setView] = useState("discover");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState({
    opportunityType: "ngo",
    target: "ong",
    domain: "education",
    country: "RDC",
    keywords: "",
    prioritizeDrc: true,
    onlyActive: true,
    includeUndated: true,
    includeSearchLinks: false,
    limit: 40,
  });

  const [customSources, setCustomSources] = useState("");
  const [importForm, setImportForm] = useState({
    source: "import-externe",
    donor: "",
    text: IMPORT_EXAMPLE,
  });
  const [filters, setFilters] = useState({
    q: "",
    source: "",
    opportunityType: "",
    userStatus: "",
    validity: "",
    favorite: false,
    onlyActive: true,
    includeSearchLinks: false,
  });
  const [opportunities, setOpportunities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState({});
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState(null);
  const [watch, setWatch] = useState({ intervalValue: 24, intervalUnit: "hours", email: true, emailTo: "" });

  const sources = TYPE_SOURCES[search.opportunityType] || TYPE_SOURCES.ngo;
  const customSiteRows = parseCustomSites(customSources);
  const queryPreview = buildQueryPreview(search);

  async function api(path, options = {}) {
    const res = await fetch(`${grantsApi}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.details || json.error || `HTTP ${res.status}`);
    return json;
  }

  async function loadOpportunities(nextFilters = filters) {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([k, v]) => {
      if (typeof v === "boolean") {
        if (v) params.set(k, "1");
        else if (k === "onlyActive") params.set(k, "0");
        return;
      }
      if (v) params.set(k, v);
    });
    params.set("limit", "150");
    const json = await api(`/opportunities?${params.toString()}`);
    setOpportunities(json.rows || []);
  }

  async function loadProfile() {
    const json = await api("/profile");
    setProfile(json.profile || {});
  }

  useEffect(() => {
    loadOpportunities().catch((e) => setError(e.message));
    loadProfile().catch(() => {});
  }, []);

  function setTypedSearch(patch) {
    setSearch((prev) => {
      const next = { ...prev, ...patch };
      if (patch.opportunityType === "scholarship") next.target = "students";
      if (patch.opportunityType === "entrepreneur") next.target = "entrepreneurs";
      if (patch.opportunityType === "ngo") next.target = "ong";
      return next;
    });
  }

  async function runSearch() {
    setLoading(true);
    setError("");
    setMessage("Recherche multi-sources en cours...");
    try {
      const payload = {
        ...search,
        sector: search.domain,
        keywords: queryPreview,
        sources,
        customSites: customSiteRows,
        save: true,
      };
      const json = await api("/discover", { method: "POST", body: JSON.stringify(payload) });
      const discovered = json.opportunities || [];
      setOpportunities(discovered);
      await loadOpportunities({ ...filters, source: "", userStatus: "", validity: "", favorite: false });
      setView("pipeline");
      setMessage(`${json.total || discovered.length || 0} opportunité(s) trouvée(s). ${json.db?.inserted || 0} nouvelle(s), ${json.db?.updated || 0} mise(s) à jour.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function importOpportunities() {
    setLoading(true);
    setError("");
    setMessage("Import des opportunités externes...");
    try {
      const json = await api("/opportunities/import", {
        method: "POST",
        body: JSON.stringify(importForm),
      });
      await loadOpportunities({ ...filters, source: "", userStatus: "", validity: "", favorite: false });
      setView("pipeline");
      setMessage(`${json.total} opportunité(s) traitée(s). ${json.inserted} ajoutée(s), ${json.updated} mise(s) à jour.${json.issues?.length ? ` ${json.issues.length} alerte(s) à vérifier.` : ""}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createWatch() {
    setLoading(true);
    setError("");
    try {
      const interval = Math.max(1, Number(watch.intervalValue || 24));
      const intervalHours = watch.intervalUnit === "days" ? interval * 24 : interval;
      const json = await api("/watch", {
        method: "POST",
        body: JSON.stringify({
          name: `${labelFor(TYPES, search.opportunityType)} - ${labelForPairs(DOMAINS, search.domain)} - ${search.country}`,
          intervalHours,
          query: { ...search, sector: search.domain, keywords: queryPreview, sources, customSites: customSiteRows, save: true },
          alerts: { email: watch.email, emailTo: watch.emailTo },
        }),
      });
      setMessage(`Veille planifiée. Prochaine exécution: ${new Date(json.watch.nextRunAt).toLocaleString()}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateOpportunity(id, patch) {
    await api(`/opportunities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    await loadOpportunities();
  }

  async function enrichOpportunity(opp) {
    setLoading(true);
    setError("");
    try {
      const json = await api(`/opportunities/${encodeURIComponent(opp.id)}/enrich`, { method: "POST", body: "{}" });
      setSelected(json.opportunity);
      setQuestions((json.enrichment?.formQuestions || []).join("\n"));
      await loadOpportunities();
      setMessage("Page source scannée et informations enrichies.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    setLoading(true);
    setError("");
    try {
      const json = await api("/profile", { method: "PUT", body: JSON.stringify(profile) });
      setProfile(json.profile || {});
      setMessage("Profil sauvegardé.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function autofill() {
    if (!selected) return setError("Sélectionne une opportunité dans le pipeline.");
    const qs = questions.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    if (!qs.length) return setError("Ajoute les questions du formulaire ou scanne la page source.");
    setLoading(true);
    setError("");
    setAnswers(null);
    try {
      const json = await api(`/opportunities/${encodeURIComponent(selected.id)}/autofill`, {
        method: "POST",
        body: JSON.stringify({ questions: qs, profile, lang: "fr" }),
      });
      setAnswers(json.result);
      setMessage("Réponses de candidature générées.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const topStats = {
    total: opportunities.length,
    candidates: opportunities.filter((o) => o.user?.status === "candidat").length,
    submitted: opportunities.filter((o) => o.user?.status === "soumis").length,
    favorites: opportunities.filter((o) => o.user?.favorite).length,
  };

  const displayedOpportunities = opportunities.filter((opp) => {
    if (filters.opportunityType && opp.opportunityType !== filters.opportunityType) return false;
    if (!filters.includeSearchLinks && opp.status === "search_link") return false;
    if (filters.onlyActive && opp.freshness && opp.freshness.active === false) return false;
    if (filters.validity === "drc") {
      const hay = [opp.title, opp.description, opp.eligibility, opp.enrichment?.summaryText, ...(opp.match?.reasons || [])]
        .join(" ")
        .toLowerCase();
      if (!/(drc|rdc|congo|africa|afrique)/i.test(hay)) return false;
    }
    if (filters.validity === "deadline" && !(opp.closeDate || opp.enrichment?.deadline)) return false;
    if (filters.validity === "high" && Number(opp.match?.score || 0) < 70) return false;
    if (filters.validity === "search_link" && opp.status !== "search_link") return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-950 px-5 py-6 text-white sm:px-7">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">DroitGPT Subventions</p>
              <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-tight sm:text-4xl">
                Trouver, qualifier et préparer des opportunités de financement
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Un espace de travail en français pour rechercher des appels, importer des opportunités trouvées ailleurs, suivre le pipeline et préparer une candidature solide.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
              <Metric label="Indexées" value={topStats.total} />
              <Metric label="Candidates" value={topStats.candidates} />
              <Metric label="Soumises" value={topStats.submitted} />
              <Metric label="Favoris" value={topStats.favorites} />
            </div>
          </div>
        </div>
        <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700 md:grid-cols-4">
          <Step number="1" label="Rechercher ou importer" />
          <Step number="2" label="Qualifier les opportunités" />
          <Step number="3" label="Préparer le dossier" />
          <Step number="4" label="Suivre jusqu'à soumission" />
        </div>
      </section>

      {error ? <Notice tone="red">{error}</Notice> : null}
      {message ? <Notice tone="green">{message}</Notice> : null}

      <div className="flex flex-wrap gap-2">
        {[
          ["discover", "Découvrir"],
          ["import", "Importer"],
          ["pipeline", "Pipeline"],
          ["profile", "Profil"],
          ["application", "Candidature IA"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === key ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "discover" ? (
        <Panel title="Recherche guidée multi-sources" eyebrow="Découverte automatique">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Type d'opportunité"
                  value={search.opportunityType}
                  onChange={(v) => setTypedSearch({ opportunityType: v })}
                  options={TYPES.map((x) => [x.value, x.label])}
                />
                <Select
                  label="Bénéficiaire cible"
                  value={search.target}
                  onChange={(v) => setTypedSearch({ target: v })}
                  options={TARGETS.map((x) => [x.value, x.label])}
                />
                <Select
                  label="Domaine prioritaire"
                  value={search.domain}
                  onChange={(v) => setTypedSearch({ domain: v })}
                  options={DOMAINS}
                />
                <Select
                  label="Pays / zone"
                  value={search.country}
                  onChange={(v) => setTypedSearch({ country: v })}
                  options={COUNTRIES}
                />
              </div>

              <Field
                label="Mots-clés complémentaires"
                value={search.keywords}
                onChange={(v) => setTypedSearch({ keywords: v })}
                placeholder="Ex: filles rurales, adaptation climatique, innovation agricole"
              />

              <Area
                label="Plateformes externes à scanner"
                value={customSources}
                onChange={setCustomSources}
                placeholder={"Nom du portail | https://example.org/search?q={q}\nBailleur local | https://example.org/appels"}
                helper="Optionnel. Une ligne par plateforme. Utilise {q} dans l'URL quand le site accepte une recherche."
              />

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={search.prioritizeDrc} onChange={(e) => setTypedSearch({ prioritizeDrc: e.target.checked })} />
                Prioriser les opportunités valables pour RDC, Congo ou Afrique.
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={search.onlyActive} onChange={(e) => setTypedSearch({ onlyActive: e.target.checked })} />
                  Actives uniquement
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={search.includeUndated} onChange={(e) => setTypedSearch({ includeUndated: e.target.checked })} />
                  Garder sans date confirmée
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={search.includeSearchLinks} onChange={(e) => setTypedSearch({ includeSearchLinks: e.target.checked })} />
                  Inclure liens à vérifier
                </label>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <InfoBlock title="Requête utilisée" text={queryPreview} />
              <div>
                <SectionLabel>Sources automatiques</SectionLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sources.map((s) => <Chip key={s}>{s}</Chip>)}
                </div>
              </div>
              <div>
                <SectionLabel>Sources ajoutées</SectionLabel>
                <p className="mt-2 text-sm text-slate-600">{customSiteRows.length ? `${customSiteRows.length} plateforme(s) personnalisée(s).` : "Aucune plateforme personnalisée."}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Intervalle" value={watch.intervalValue} onChange={(v) => setWatch({ ...watch, intervalValue: v })} />
                <Select label="Unité" value={watch.intervalUnit} onChange={(v) => setWatch({ ...watch, intervalUnit: v })} options={[["hours", "Heures"], ["days", "Jours"]]} />
              </div>
              <Field label="Email d'alerte" value={watch.emailTo} onChange={(v) => setWatch({ ...watch, emailTo: v })} placeholder="contact@organisation.org" />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={watch.email} onChange={(e) => setWatch({ ...watch, email: e.target.checked })} />
                Envoyer les nouvelles opportunités par email.
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <PrimaryButton disabled={loading} onClick={runSearch}>{loading ? "Recherche..." : "Lancer la recherche"}</PrimaryButton>
            <SecondaryButton disabled={loading} onClick={createWatch}>Planifier une veille</SecondaryButton>
          </div>
        </Panel>
      ) : null}

      {view === "import" ? (
        <Panel title="Importer depuis d'autres plateformes" eyebrow="CSV, JSON, liens ou texte copié">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <Field
                label="Nom de la plateforme"
                value={importForm.source}
                onChange={(v) => setImportForm({ ...importForm, source: v || "import-externe" })}
                placeholder="Ex: reliefweb, fundsforngos, linkedin"
              />
              <Field
                label="Bailleur par défaut"
                value={importForm.donor}
                onChange={(v) => setImportForm({ ...importForm, donor: v })}
                placeholder="Ex: Union européenne, PNUD, Ambassade..."
              />
              <Notice tone="blue">
                Tu peux coller un tableau CSV, un JSON exporté, une liste de liens, ou des lignes au format
                <strong> Titre | Bailleur | Date limite | URL | Description</strong>.
              </Notice>
            </div>
            <Area
              label="Opportunités à importer"
              value={importForm.text}
              onChange={(v) => setImportForm({ ...importForm, text: v })}
              rows={13}
              placeholder={IMPORT_EXAMPLE}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <PrimaryButton disabled={loading} onClick={importOpportunities}>{loading ? "Import..." : "Importer dans le pipeline"}</PrimaryButton>
            <SecondaryButton onClick={() => setImportForm({ source: "import-externe", donor: "", text: "" })}>Vider le formulaire</SecondaryButton>
          </div>
        </Panel>
      ) : null}

      {view === "pipeline" ? (
        <Panel title="Pipeline des opportunités" eyebrow="Qualification et suivi">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <SectionLabel>Filtres</SectionLabel>
            <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-8">
              <Field label="Recherche" value={filters.q} onChange={(v) => setFilters({ ...filters, q: v })} placeholder="titre, bailleur..." />
              <Select label="Source" value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} options={SOURCE_OPTIONS} />
              <Select label="Catégorie" value={filters.opportunityType} onChange={(v) => setFilters({ ...filters, opportunityType: v })} options={[["", "Toutes"], ...TYPES.map((t) => [t.value, t.label])]} />
              <Select label="Statut dossier" value={filters.userStatus} onChange={(v) => setFilters({ ...filters, userStatus: v })} options={[["", "Tous"], ...STATUSES.map((s) => [s.value, s.label])]} />
              <Select label="Validité" value={filters.validity} onChange={(v) => setFilters({ ...filters, validity: v })} options={VALIDITY_OPTIONS} />
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={filters.favorite} onChange={(e) => setFilters({ ...filters, favorite: e.target.checked })} />
                Favoris
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={filters.onlyActive} onChange={(e) => setFilters({ ...filters, onlyActive: e.target.checked })} />
                Actives
              </label>
              <div className="flex items-end">
                <SecondaryButton onClick={() => loadOpportunities()}>Appliquer</SecondaryButton>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {displayedOpportunities.length ? displayedOpportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                onFavorite={() => updateOpportunity(opp.id, { favorite: !opp.user?.favorite })}
                onStatus={(status) => updateOpportunity(opp.id, { status })}
                onEnrich={() => enrichOpportunity(opp)}
                onApply={() => {
                  setSelected(opp);
                  setQuestions((opp.enrichment?.formQuestions || []).join("\n"));
                  setAnswers(null);
                  setView("application");
                }}
              />
            )) : <EmptyState />}
          </div>
        </Panel>
      ) : null}

      {view === "profile" ? (
        <Panel title="Profil organisationnel" eyebrow="Informations réutilisées pour les candidatures">
          <div className="grid gap-4 md:grid-cols-2">
            {PROFILE_FIELDS.map(([key, label]) =>
              LONG_PROFILE_FIELDS.has(key) ? (
                <Area key={key} label={label} value={profile[key] || ""} onChange={(v) => setProfile({ ...profile, [key]: v })} />
              ) : (
                <Field key={key} label={label} value={profile[key] || ""} onChange={(v) => setProfile({ ...profile, [key]: v })} />
              )
            )}
          </div>
          <PrimaryButton disabled={loading} onClick={saveProfile}>Sauvegarder le profil</PrimaryButton>
        </Panel>
      ) : null}

      {view === "application" ? (
        <Panel title="Assistant de candidature" eyebrow="Réponses structurées à partir du profil">
          {selected ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-base font-semibold text-slate-900">{selected.title}</div>
              <div className="mt-1 text-sm text-slate-600">{selected.donor || "Bailleur à confirmer"} · {selected.source || "source inconnue"}</div>
            </div>
          ) : (
            <Notice tone="amber">Sélectionne une opportunité dans le pipeline pour préparer la candidature.</Notice>
          )}
          <Area
            label="Questions du formulaire"
            value={questions}
            onChange={setQuestions}
            rows={8}
            placeholder={"Quel est l'objectif du projet ?\nQuelle est l'expérience de votre organisation ?\nQuel budget demandez-vous ?"}
            helper="Une question par ligne. Tu peux scanner la page source pour récupérer automatiquement des questions quand elles sont visibles."
          />
          <PrimaryButton disabled={loading || !selected} onClick={autofill}>Générer les réponses</PrimaryButton>
          {answers ? <AnswersBlock answers={answers} /> : null}
        </Panel>
      ) : null}
    </div>
  );
}

function buildQueryPreview(search) {
  const typeWords = {
    ngo: "grant call for proposals appel à projets subvention ONG ASBL",
    entrepreneur: "entrepreneur PME startup accélérateur incubateur seed grant financement entreprise",
    scholarship: "scholarship bourse fellowship étudiants formation recherche",
  };
  return [
    search.keywords,
    labelForPairs(DOMAINS, search.domain),
    typeWords[search.opportunityType],
    search.country,
    search.prioritizeDrc ? "DRC RDC Congo Africa Afrique" : "",
  ].filter(Boolean).join(" ");
}

function parseCustomSites(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const [namePart, urlPart] = line.includes("|") ? line.split("|").map((x) => x.trim()) : [`Plateforme ${idx + 1}`, line];
      return {
        name: namePart || `Plateforme ${idx + 1}`,
        donor: namePart || "Source externe",
        url: urlPart || "",
      };
    })
    .filter((site) => /^https?:\/\//i.test(site.url));
}

function OpportunityCard({ opp, onFavorite, onStatus, onEnrich, onApply }) {
  const score = Number(opp.match?.score || 0);
  const deadline = opp.closeDate || opp.enrichment?.deadline || "Date limite à vérifier";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${score >= 75 ? "bg-emerald-100 text-emerald-800" : score >= 55 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{score}/100</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{opp.categoryLabel || opportunityTypeLabel(opp.opportunityType)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{opp.source || "source"}</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{deadline}</span>
          </div>
          <h3 className="mt-3 text-base font-bold leading-snug text-slate-950">{opp.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{opp.donor || "Bailleur à confirmer"}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{clip(opp.description || opp.enrichment?.summaryText || "Description à vérifier sur la source officielle.", 260)}</p>
          {opp.match?.reasons?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {opp.match.reasons.slice(0, 3).map((r) => <span key={r} className="rounded-full bg-slate-50 px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">{r}</span>)}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={opp.user?.status || "a_analyser"} onChange={(e) => onStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <SecondaryButton onClick={onFavorite}>{opp.user?.favorite ? "Retirer des favoris" : "Mettre en favori"}</SecondaryButton>
          <SecondaryButton onClick={onEnrich}>Scanner la source</SecondaryButton>
          <PrimaryButton onClick={onApply}>Préparer la candidature</PrimaryButton>
          {opp.url ? <a className="rounded-xl px-3 py-2 text-center text-sm font-semibold text-blue-700 underline" href={opp.url} target="_blank" rel="noreferrer">Ouvrir la source officielle</a> : null}
        </div>
      </div>
    </article>
  );
}

function AnswersBlock({ answers }) {
  return (
    <div className="space-y-4">
      {(answers.answers || []).map((a) => (
        <div key={a.id || a.question} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="font-semibold text-slate-900">{a.question}</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{a.answer}</p>
          <div className="mt-2 text-xs text-slate-500">Confiance: {a.confidence || "moyenne"} {a.needsUserReview ? "· revue humaine requise" : ""}</div>
        </div>
      ))}
      {answers.missingProfileFields?.length ? (
        <Notice tone="amber">
          <div className="font-semibold">Informations manquantes</div>
          <ul className="mt-2 list-disc pl-5">
            {answers.missingProfileFields.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-white/10 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-300">{label}</div>
    </div>
  );
}

function Step({ number, label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{number}</span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        {eyebrow ? <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">{eyebrow}</div> : null}
        <h2 className="mt-1 text-lg font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Notice({ tone, children }) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-2xl border p-4 text-sm leading-6 ${cls}`}>{children}</div>;
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      Aucune opportunité dans ce filtre. Lance une recherche ou importe des résultats depuis une plateforme externe.
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Area({ label, value, onChange, placeholder, helper, rows = 5 }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {helper ? <span className="mt-1 block text-xs leading-5 text-slate-500">{helper}</span> : null}
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function InfoBlock({ title, text }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <p className="mt-2 rounded-xl bg-white p-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-200">{text}</p>
    </div>
  );
}

function Chip({ children }) {
  return <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{children}</span>;
}

function SectionLabel({ children }) {
  return <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{children}</div>;
}

function PrimaryButton(props) {
  return <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60" {...props} />;
}

function SecondaryButton(props) {
  return <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60" {...props} />;
}

function labelFor(list, value) {
  return list.find((x) => x.value === value)?.label || value;
}

function labelForPairs(list, value) {
  return list.find(([v]) => v === value)?.[1] || value;
}

function opportunityTypeLabel(type) {
  if (type === "scholarship") return "Bourses";
  if (type === "entrepreneur") return "Entrepreneurs";
  return "ONG / appels à projets";
}

function clip(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
