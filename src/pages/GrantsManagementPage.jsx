import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";

const TYPES = [
  { value: "ngo", label: "Appels a projets ONG", hint: "Subventions, bailleurs, associations, ASBL" },
  { value: "entrepreneur", label: "Opportunites entrepreneuriales", hint: "Entrepreneurs, PME, startups, incubateurs, accelerateurs" },
  { value: "scholarship", label: "Bourses", hint: "Bourses, fellowships, formations" },
];

const TARGETS = [
  { value: "ong", label: "ONG / ASBL" },
  { value: "entrepreneurs", label: "Entrepreneurs / PME / startups" },
  { value: "students", label: "Etudiants" },
];

const DOMAINS = [
  "education",
  "sante",
  "agriculture",
  "climat",
  "droits",
  "femmes",
  "jeunes",
  "numerique",
];

const COUNTRIES = [
  ["RDC", "Congo / RDC"],
  ["Africa", "Afrique"],
  ["Congo", "Congo"],
  ["Rwanda", "Rwanda"],
  ["Burundi", "Burundi"],
  ["Cameroon", "Cameroun"],
  ["Senegal", "Senegal"],
  ["Cote d'Ivoire", "Cote d'Ivoire"],
  ["Kenya", "Kenya"],
  ["Nigeria", "Nigeria"],
];

const SOURCE_OPTIONS = [
  ["", "Toutes les sources"],
  ["grants.gov", "Grants.gov"],
  ["eu", "Union europeenne"],
  ["worldbank", "Banque mondiale"],
  ["ungm", "UNGM / ONU"],
  ["undp", "PNUD / UNDP"],
  ["opportunities-for-youth", "Opportunities for Youth"],
  ["vc4a", "VC4A"],
  ["scholarshipset", "ScholarshipSet"],
  ["foundations", "Fondations"],
  ["embassies", "Ambassades"],
  ["scholarships", "Portails bourses"],
  ["entrepreneurship", "Opportunites entrepreneuriales"],
  ["ngo-portals", "Portails ONG"],
  ["drc-local", "Sources RDC/Congo"],
  ["linkedin", "LinkedIn"],
];

const VALIDITY_OPTIONS = [
  ["", "Toutes"],
  ["drc", "Valable RDC/Congo/Afrique"],
  ["deadline", "Avec deadline"],
  ["high", "Score eleve"],
  ["search_link", "A verifier manuellement"],
];

const STATUSES = [
  { value: "a_analyser", label: "A analyser" },
  { value: "candidat", label: "Candidat" },
  { value: "rejete", label: "Rejete" },
  { value: "soumis", label: "Soumis" },
  { value: "archive", label: "Archive" },
];

const TYPE_SOURCES = {
  ngo: ["grants.gov", "undp", "eu", "worldbank", "ungm", "foundations", "embassies", "ngo-portals", "drc-local", "opportunities-for-youth"],
  entrepreneur: ["vc4a", "entrepreneurship", "opportunities-for-youth", "foundations", "worldbank", "eu", "linkedin", "drc-local"],
  scholarship: ["scholarshipset", "scholarships", "opportunities-for-youth", "embassies", "foundations", "linkedin", "drc-local"],
};

const PROFILE_FIELDS = [
  ["name", "Nom de l'organisation"],
  ["legalStatus", "Statut legal"],
  ["country", "Pays"],
  ["city", "Ville"],
  ["contactEmail", "Email contact"],
  ["mission", "Mission"],
  ["sectors", "Secteurs"],
  ["targetGroups", "Groupes cibles"],
  ["geographicFocus", "Zone d'intervention"],
  ["pastProjects", "Projets passes / references"],
  ["team", "Equipe"],
  ["partners", "Partenaires"],
  ["annualBudget", "Budget annuel"],
  ["monitoringEvaluation", "Suivi-evaluation"],
  ["impactEvidence", "Preuves d'impact"],
  ["documentsReady", "Documents disponibles"],
];

export default function GrantsManagementPage() {
  const API_BASE = import.meta.env.VITE_BP_API_BASE || DEFAULT_API_BASE;
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
    limit: 40,
  });

  const [filters, setFilters] = useState({ q: "", source: "", userStatus: "", validity: "", favorite: false });
  const [opportunities, setOpportunities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState({});
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState(null);
  const [watch, setWatch] = useState({ intervalValue: 24, intervalUnit: "hours", email: true, emailTo: "" });

  const sources = TYPE_SOURCES[search.opportunityType] || TYPE_SOURCES.ngo;
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
      if (v) params.set(k, v === true ? "1" : v);
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
    setMessage("Indexation multi-sources en cours...");
    try {
      const payload = {
        ...search,
        sector: search.domain,
        keywords: queryPreview,
        sources,
        save: true,
      };
      const json = await api("/discover", { method: "POST", body: JSON.stringify(payload) });
      const discovered = json.opportunities || [];
      setOpportunities(discovered);
      try {
        const params = new URLSearchParams();
        params.set("limit", "150");
        const saved = await api(`/opportunities?${params.toString()}`);
        if (saved.rows?.length) setOpportunities(saved.rows);
      } catch {
        // Keep live discovery results visible even if the persistence read is unavailable.
      }
      setView("pipeline");
      setMessage(`${json.total || discovered.length || 0} opportunites trouvees. ${json.db?.inserted || 0} nouvelles, ${json.db?.updated || 0} mises a jour.`);
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
          name: `${labelFor(TYPES, search.opportunityType)} - ${search.domain} - ${search.country}`,
          intervalHours,
          query: { ...search, sector: search.domain, keywords: queryPreview, sources, save: true },
          alerts: { email: watch.email, emailTo: watch.emailTo },
        }),
      });
      setMessage(`Veille planifiee. Prochaine execution: ${new Date(json.watch.nextRunAt).toLocaleString()}`);
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
      setMessage("Page detail scannee et enrichie.");
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
      setMessage("Profil sauvegarde.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function autofill() {
    if (!selected) return setError("Selectionne une opportunite.");
    const qs = questions.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    if (!qs.length) return setError("Ajoute les questions du formulaire ou scanne la page detail.");
    setLoading(true);
    setError("");
    setAnswers(null);
    try {
      const json = await api(`/opportunities/${encodeURIComponent(selected.id)}/autofill`, {
        method: "POST",
        body: JSON.stringify({ questions: qs, profile }),
      });
      setAnswers(json.result);
      setMessage("Reponses IA generees.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const topStats = {
    total: opportunities.length,
    candidates: opportunities.filter((o) => o.user?.status === "candidat").length,
    favorites: opportunities.filter((o) => o.user?.favorite).length,
  };

  const displayedOpportunities = opportunities.filter((opp) => {
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
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-slate-950 p-6 text-white md:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Grants intelligence v2 - filtres pro</p>
            <h1 className="mt-3 text-3xl font-bold">Opportunites financees pour la RDC, triees et exploitables</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Selectionne le type d'opportunite, la cible et le domaine. Le systeme indexe plusieurs sources, priorise Congo/RDC, dedoublonne les resultats et prepare la candidature.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 self-end">
            <Metric label="Indexees" value={topStats.total} />
            <Metric label="Candidates" value={topStats.candidates} />
            <Metric label="Favoris" value={topStats.favorites} />
          </div>
        </div>
      </section>

      {error ? <Notice tone="red">{error}</Notice> : null}
      {message ? <Notice tone="green">{message}</Notice> : null}

      <div className="flex flex-wrap gap-2">
        {[
          ["discover", "Decouvrir"],
          ["pipeline", "Pipeline"],
          ["profile", "Profil"],
          ["application", "Candidature IA"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${view === key ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "discover" ? (
        <Panel title="Recherche guidee">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <SectionLabel>Filtres principaux</SectionLabel>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <Select
                    label="Type d'opportunite"
                    value={search.opportunityType}
                    onChange={(v) => setTypedSearch({ opportunityType: v })}
                    options={TYPES.map((x) => [x.value, x.label])}
                  />
                  <Select
                    label="Beneficiaire cible"
                    value={search.target}
                    onChange={(v) => setTypedSearch({ target: v })}
                    options={TARGETS.map((x) => [x.value, x.label])}
                  />
                  <Select
                    label="Domaine"
                    value={search.domain}
                    onChange={(v) => setTypedSearch({ domain: v })}
                    options={DOMAINS.map((x) => [x, titleCase(x)])}
                  />
                  <Select
                    label="Pays / zone prioritaire"
                    value={search.country}
                    onChange={(v) => setTypedSearch({ country: v })}
                    options={COUNTRIES}
                  />
                </div>
              </div>

              <Field
                label="Precision optionnelle"
                value={search.keywords}
                onChange={(v) => setTypedSearch({ keywords: v })}
                placeholder="Ex: filles rurales, innovation agricole, climate adaptation..."
              />

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={search.prioritizeDrc} onChange={(e) => setTypedSearch({ prioritizeDrc: e.target.checked })} />
                Prioriser fortement les opportunites valables pour Congo / RDC / Afrique
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <SectionLabel>Requete qui sera indexee</SectionLabel>
              <p className="mt-2 rounded-xl bg-white p-3 text-sm text-slate-700 ring-1 ring-slate-200">{queryPreview}</p>
              <SectionLabel className="mt-4">Sources utilisees</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {sources.map((s) => <span key={s} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{s}</span>)}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Field label="Intervalle" value={watch.intervalValue} onChange={(v) => setWatch({ ...watch, intervalValue: v })} />
                <Select label="Unite" value={watch.intervalUnit} onChange={(v) => setWatch({ ...watch, intervalUnit: v })} options={[["hours", "Heures"], ["days", "Jours"]]} />
              </div>
              <Field label="Email alerte" value={watch.emailTo} onChange={(v) => setWatch({ ...watch, emailTo: v })} />
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={watch.email} onChange={(e) => setWatch({ ...watch, email: e.target.checked })} />
                Envoyer les nouvelles opportunites par email
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <PrimaryButton disabled={loading} onClick={runSearch}>Indexer maintenant</PrimaryButton>
            <SecondaryButton disabled={loading} onClick={createWatch}>Planifier la veille</SecondaryButton>
          </div>
        </Panel>
      ) : null}

      {view === "pipeline" ? (
        <Panel title="Pipeline exploitable">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <SectionLabel>Filtres du pipeline</SectionLabel>
            <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Field label="Mot-cle" value={filters.q} onChange={(v) => setFilters({ ...filters, q: v })} placeholder="titre, bailleur..." />
              <Select label="Source" value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} options={SOURCE_OPTIONS} />
              <Select label="Statut dossier" value={filters.userStatus} onChange={(v) => setFilters({ ...filters, userStatus: v })} options={[["", "Tous"], ...STATUSES.map((s) => [s.value, s.label])]} />
              <Select label="Validite" value={filters.validity} onChange={(v) => setFilters({ ...filters, validity: v })} options={VALIDITY_OPTIONS} />
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={filters.favorite} onChange={(e) => setFilters({ ...filters, favorite: e.target.checked })} />
                Favoris
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
        <Panel title="Profil organisation / entreprise">
          <div className="grid gap-4 md:grid-cols-2">
            {PROFILE_FIELDS.map(([key, label]) =>
              ["mission", "targetGroups", "pastProjects", "team", "partners", "monitoringEvaluation", "impactEvidence", "documentsReady"].includes(key) ? (
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
        <Panel title="Remplissage IA des questions">
          {selected ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-base font-semibold text-slate-900">{selected.title}</div>
              <div className="mt-1 text-sm text-slate-600">{selected.donor} - {selected.source}</div>
            </div>
          ) : (
            <Notice tone="amber">Selectionne une opportunite dans le pipeline.</Notice>
          )}
          <Area
            label="Questions du formulaire (une question par ligne)"
            value={questions}
            onChange={setQuestions}
            placeholder={"Quel est l'objectif du projet ?\nQuelle est l'experience de votre organisation ?\nQuel budget demandez-vous ?"}
          />
          <PrimaryButton disabled={loading || !selected} onClick={autofill}>Generer les reponses</PrimaryButton>
          {answers ? <AnswersBlock answers={answers} /> : null}
        </Panel>
      ) : null}
    </div>
  );
}

function buildQueryPreview(search) {
  const typeWords = {
    ngo: "grant call for proposals appel a projets subvention ONG ASBL",
    entrepreneur: "entrepreneur PME startup business accelerator incubator seed grant financement entreprise",
    scholarship: "scholarship bourse fellowship students training",
  };
  return [
    search.keywords,
    search.domain,
    typeWords[search.opportunityType],
    search.country,
    search.prioritizeDrc ? "DRC RDC Congo Africa" : "",
  ].filter(Boolean).join(" ");
}

function OpportunityCard({ opp, onFavorite, onStatus, onEnrich, onApply }) {
  const score = Number(opp.match?.score || 0);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${score >= 75 ? "bg-emerald-100 text-emerald-800" : score >= 55 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{score}/100</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{opp.source}</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{opp.closeDate || opp.enrichment?.deadline || "Deadline a verifier"}</span>
          </div>
          <h3 className="mt-3 text-base font-bold text-slate-950">{opp.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{opp.donor}</p>
          <p className="mt-2 line-clamp-2 text-sm text-slate-500">{opp.description || opp.enrichment?.summaryText || "Description a verifier sur la source."}</p>
          {opp.match?.reasons?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {opp.match.reasons.slice(0, 3).map((r) => <span key={r} className="rounded-full bg-slate-50 px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">{r}</span>)}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-[250px] flex-col gap-2">
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={opp.user?.status || "a_analyser"} onChange={(e) => onStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800" onClick={onFavorite}>{opp.user?.favorite ? "Retirer favori" : "Mettre en favori"}</button>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800" onClick={onEnrich}>Scanner la page detail</button>
          <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white" onClick={onApply}>Preparer candidature</button>
          {opp.url ? <a className="text-center text-sm text-blue-700 underline" href={opp.url} target="_blank" rel="noreferrer">Source officielle</a> : null}
        </div>
      </div>
    </article>
  );
}

function AnswersBlock({ answers }) {
  return (
    <div className="space-y-4">
      {(answers.answers || []).map((a) => (
        <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="font-semibold text-slate-900">{a.question}</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{a.answer}</p>
          <div className="mt-2 text-xs text-slate-500">Confiance: {a.confidence} {a.needsUserReview ? "- revue humaine requise" : ""}</div>
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
    <div className="rounded-2xl bg-white/10 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-300">{label}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ tone, children }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-2xl border p-4 text-sm ${cls}`}>{children}</div>;
}

function EmptyState() {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Aucune opportunite. Lance une indexation depuis l'onglet Decouvrir.</div>;
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Area({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea className="mt-1 min-h-[110px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function SectionLabel({ children, className = "" }) {
  return <div className={`text-xs font-bold uppercase tracking-wide text-slate-500 ${className}`}>{children}</div>;
}

function PrimaryButton(props) {
  return <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" {...props} />;
}

function SecondaryButton(props) {
  return <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60" {...props} />;
}

function titleCase(s) {
  return String(s || "").slice(0, 1).toUpperCase() + String(s || "").slice(1);
}

function labelFor(list, value) {
  return list.find((x) => x.value === value)?.label || value;
}
