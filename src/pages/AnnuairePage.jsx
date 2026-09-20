import React, { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 96;

const TAB_DEFINITIONS = [
  { id: "all", label: "Tous", hint: "Base complète" },
  { id: "priority", label: "Prospection", hint: "Contacts exploitables" },
  { id: "mines", label: "Mines", hint: "Opérateurs et services" },
  { id: "finance", label: "Finance", hint: "Banques, fonds, assurances" },
  { id: "arsp", label: "ARSP", hint: "Sociétés enregistrées" },
  { id: "health", label: "Santé", hint: "Médecins et structures" },
  { id: "public", label: "Annuaires publics", hint: "Sources web" },
  { id: "fec", label: "FEC", hint: "Entreprises FEC" },
  { id: "emails", label: "Emails", hint: "Contact direct" },
];

const CONTACT_FILTERS = [
  { value: "", label: "Tous les contacts" },
  { value: "email", label: "Avec email" },
  { value: "phone", label: "Avec téléphone" },
  { value: "complete", label: "Email + téléphone" },
  { value: "website", label: "Avec site web" },
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Pertinence" },
  { value: "quality", label: "Qualité contact" },
  { value: "name", label: "Nom A-Z" },
  { value: "source", label: "Source" },
];

const PRIORITY_SECTOR_TERMS = [
  "mines",
  "finance",
  "banque",
  "btp",
  "construction",
  "industrie",
  "transport",
  "logistique",
  "agriculture",
  "services aux entreprises",
  "télécommunication",
  "immobilier",
];

const SECTOR_GROUPS = [
  {
    id: "mines",
    label: "Mines et ressources",
    terms: ["mine", "minier", "mines", "carriere", "cobalt", "cuivre", "lithium", "mineral", "ressource"],
  },
  {
    id: "agriculture",
    label: "Agriculture et elevage",
    terms: ["agric", "agro", "elevage", "peche", "foret", "palmier", "manioc", "semence", "veterinaire"],
  },
  {
    id: "btp",
    label: "BTP et construction",
    terms: ["btp", "construction", "batiment", "genie civil", "travaux publics", "immobilier"],
  },
  {
    id: "commerce",
    label: "Commerce et distribution",
    terms: ["commerce", "trading", "distribution", "vente", "import", "export", "negoce", "magasin"],
  },
  {
    id: "finance",
    label: "Finance, banques et assurances",
    terms: ["banque", "finance", "assurance", "microfinance", "credit", "leasing", "fonds", "invest"],
  },
  {
    id: "sante",
    label: "Sante et medecine",
    terms: ["sante", "medecine", "pharma", "clinique", "hospital", "hopital", "laboratoire medical"],
  },
  {
    id: "transport",
    label: "Transport et logistique",
    terms: ["transport", "logistique", "messagerie", "aviation", "douane", "commissionnaire", "transit"],
  },
  {
    id: "industrie",
    label: "Industrie et production",
    terms: ["industrie", "production", "manufact", "usine", "transformation", "plastique", "emballage"],
  },
  {
    id: "it",
    label: "Informatique et telecoms",
    terms: ["informatique", "telecom", "internet", "digital", "logiciel", "bureautique", "technologie"],
  },
  {
    id: "services",
    label: "Services aux entreprises",
    terms: ["service", "consult", "conseil", "audit", "maintenance", "nettoyage", "securite", "gardiennage"],
  },
  {
    id: "energie",
    label: "Energie et hydrocarbures",
    terms: ["energie", "hydrocarbure", "petrole", "oil", "gaz", "electric", "solaire", "carburant"],
  },
  {
    id: "horeca",
    label: "Hotellerie, restauration et tourisme",
    terms: ["hotel", "restaurant", "tourisme", "voyage", "cafe", "traiteur"],
  },
  {
    id: "education",
    label: "Education et formation",
    terms: ["enseignement", "education", "formation", "ecole", "universite", "institut"],
  },
  {
    id: "juridique",
    label: "Droit, justice et conseil juridique",
    terms: ["droit", "justice", "juridique", "avocat", "notaire"],
  },
];

function lower(value) {
  return String(value || "").toLowerCase();
}

function normalizeText(value) {
  return lower(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function compactText(parts) {
  return parts.map((item) => String(item || "").trim()).filter(Boolean).join(" · ");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("fr-FR");
}

function recordText(record) {
  return [
    record.name,
    record.category,
    record.subCategory,
    record.sector,
    record.province,
    record.city,
    record.operation,
    record.address,
    record.activity,
    record.contactPerson,
    record.notes,
    record.raw,
    record.source,
    record.sourceDocument,
    ...(record.emails || []),
    ...(record.phones || []),
    ...(record.websites || []),
  ]
    .map(normalizeText)
    .join(" ");
}

function sectorHaystack(record) {
  return normalizeText([
    record.sector,
    record.activity,
    record.operation,
    record.subCategory,
    record.category,
    record.name,
    record.notes,
    record.raw,
  ].join(" "));
}

function sectorGroupForRecord(record) {
  const haystack = sectorHaystack(record);
  const match = SECTOR_GROUPS.find((group) =>
    group.terms.some((term) => haystack.includes(normalizeText(term)))
  );
  if (match) return match.label;
  if (record.sector) return "Autres secteurs";
  return "Non classe";
}

function recordMatchesSector(record, selectedSector) {
  if (!selectedSector) return true;
  const groupLabel = sectorGroupForRecord(record);
  return groupLabel === selectedSector || normalizeText(record.sector) === normalizeText(selectedSector);
}

function isMine(record) {
  return record.category === "mines" || /mine|carri[eè]re|cobalt|cuivre|lithium|mineral|ressource/i.test(recordText(record));
}

function isFinance(record) {
  return /banque|finance|assurance|fonds|invest|capital|cr[eé]dit|leasing|microfinance/i.test(recordText(record));
}

function isPublicDirectory(record) {
  return (
    lower(record.source).includes("moncongo") ||
    lower(record.source).includes("arsp") ||
    record.category === "annuaire_public" ||
    record.category === "arsp"
  );
}

function hasInvestorSignal(record) {
  return /investisseur|investment|financement|dfi|fund|fonds|capital|banque|infrastructure|venture|accelerator|private equity/i.test(
    recordText(record)
  );
}

function recordQuality(record) {
  let score = 20;
  if ((record.emails || []).length) score += 30;
  if ((record.phones || []).length) score += 28;
  if ((record.websites || []).length || record.sourceUrl) score += 12;
  if (record.address) score += 6;
  if (record.contactPerson) score += 4;
  return Math.min(score, 100);
}

function recordMatchesTab(record, tab) {
  if (tab === "priority") return recordQuality(record) >= 58 || hasInvestorSignal(record) || isMine(record);
  if (tab === "mines") return isMine(record);
  if (tab === "finance") return isFinance(record) || hasInvestorSignal(record);
  if (tab === "arsp") return record.category === "arsp";
  if (tab === "health") return record.category === "sante";
  if (tab === "public") return isPublicDirectory(record);
  if (tab === "fec") return record.category === "fec";
  if (tab === "emails") return (record.emails || []).length > 0;
  return true;
}

function matchesContactFilter(record, filter) {
  if (filter === "email") return (record.emails || []).length > 0;
  if (filter === "phone") return (record.phones || []).length > 0;
  if (filter === "complete") return (record.emails || []).length > 0 && (record.phones || []).length > 0;
  if (filter === "website") return (record.websites || []).length > 0 || !!record.sourceUrl;
  return true;
}

function matchScore(record, query) {
  const q = normalizeText(query).trim();
  const quality = recordQuality(record);
  if (!q) return quality;

  let score = quality;
  if (normalizeText(record.name).includes(q)) score += 80;
  if (normalizeText(record.sector).includes(q)) score += 45;
  if (normalizeText(record.subCategory).includes(q)) score += 35;
  if (normalizeText(record.city).includes(q) || normalizeText(record.province).includes(q)) score += 25;
  if ((record.emails || []).some((email) => normalizeText(email).includes(q))) score += 20;
  if ((record.phones || []).some((phone) => normalizeText(phone).includes(q))) score += 20;
  if (recordText(record).includes(q)) score += 10;
  return score;
}

function resetFilters(setters) {
  setters.setQuery("");
  setters.setActiveTab("all");
  setters.setSector("");
  setters.setLocation("");
  setters.setSource("");
  setters.setContactFilter("");
  setters.setSortMode("relevance");
}

export default function AnnuairePage() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [sortMode, setSortMode] = useState("relevance");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const module = await import("../data/annuaireStrategique.json");
        const data = module.default || module;
        if (mounted) setPayload(data);
      } catch (err) {
        if (mounted) setError(err?.message || "Impossible de charger l'annuaire.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const records = payload?.records || [];

  const stats = useMemo(() => {
    return {
      total: records.length,
      fec: records.filter((record) => record.category === "fec").length,
      mines: records.filter(isMine).length,
      finance: records.filter(isFinance).length,
      arsp: records.filter((record) => record.category === "arsp").length,
      health: records.filter((record) => record.category === "sante").length,
      publicDirectory: records.filter(isPublicDirectory).length,
      emails: records.filter((record) => (record.emails || []).length > 0).length,
      phones: records.filter((record) => (record.phones || []).length > 0).length,
      complete: records.filter((record) => (record.emails || []).length > 0 && (record.phones || []).length > 0).length,
    };
  }, [records]);

  const filterOptions = useMemo(() => {
    return {
      sectors: unique(records.map(sectorGroupForRecord)),
      locations: unique(records.flatMap((record) => [record.province, record.city]).filter(Boolean)),
      sources: unique(records.map((record) => record.source || record.sourceDocument)),
    };
  }, [records]);

  const sectorChips = useMemo(() => {
    const counts = new Map();
    for (const record of records) {
      const label = sectorGroupForRecord(record);
      if (!label) continue;
      const searchable = normalizeText(label);
      if (!PRIORITY_SECTOR_TERMS.some((term) => searchable.includes(term))) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = normalizeText(query).trim();
    const result = records
      .filter((record) => {
        if (!recordMatchesTab(record, activeTab)) return false;
        if (!recordMatchesSector(record, sector)) return false;
        if (source && (record.source || record.sourceDocument) !== source) return false;
        if (location && record.province !== location && record.city !== location) return false;
        if (!matchesContactFilter(record, contactFilter)) return false;
        if (!q) return true;
        return recordText(record).includes(q);
      })
      .map((record) => ({ record, score: matchScore(record, q) }));

    result.sort((a, b) => {
      if (sortMode === "name") return String(a.record.name || "").localeCompare(String(b.record.name || ""));
      if (sortMode === "source") {
        return String(a.record.source || a.record.sourceDocument || "").localeCompare(
          String(b.record.source || b.record.sourceDocument || "")
        );
      }
      if (sortMode === "quality") return recordQuality(b.record) - recordQuality(a.record);
      return b.score - a.score || recordQuality(b.record) - recordQuality(a.record);
    });

    return result.map((item) => item.record);
  }, [activeTab, contactFilter, location, query, records, sector, sortMode, source]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, contactFilter, location, query, sector, sortMode, source]);

  const visibleRecords = filteredRecords.slice(0, visibleCount);
  const activeFilters = [activeTab !== "all", sector, location, source, contactFilter, query].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#f4efe2] px-3 py-4 text-slate-950 sm:px-5 lg:px-8">
      <section className="relative overflow-hidden rounded-[2.4rem] bg-[#071414] p-6 text-white shadow-xl sm:p-9 lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(45,212,191,0.28),transparent_28%),radial-gradient(circle_at_84%_10%,rgba(245,158,11,0.22),transparent_24%),linear-gradient(135deg,#071414,#0c2d2c_46%,#301f10)]" />
        <div className="relative max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.34em] text-amber-200">Annuaire stratégique</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            Contacts business, FEC, mines et investisseurs pour la RDC.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
            Un espace court et opérationnel pour identifier rapidement des entreprises, décideurs, prestataires,
            opérateurs miniers, banques, fonds et partenaires utiles aux projets commerciaux en République démocratique du Congo.
          </p>
        </div>

        <div className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroMetric label="Contacts indexés" value={stats.total} />
          <HeroMetric label="Emails disponibles" value={stats.emails} />
          <HeroMetric label="Téléphones" value={stats.phones} />
          <HeroMetric label="ARSP + sources web" value={stats.publicDirectory} />
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-5 max-w-7xl rounded-[2rem] border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:p-5 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Recherche rapide</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-[1.4rem] border border-slate-200 bg-slate-50 px-5 py-4 text-base font-bold outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
              placeholder="Entreprise, secteur, ville, téléphone, email, banque, mine, BTP..."
            />
          </label>

          <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800">Résultats filtrés</p>
            <div className="mt-1 text-3xl font-black text-emerald-950">{formatNumber(filteredRecords.length)}</div>
            <p className="mt-1 text-xs font-bold text-emerald-800/75">
              {activeFilters ? `${activeFilters} filtre(s) actif(s)` : "Base complète disponible"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {TAB_DEFINITIONS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "shrink-0 rounded-2xl px-4 py-3 text-left transition",
                activeTab === tab.id
                  ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className="block text-sm font-black">{tab.label}</span>
              <span className={activeTab === tab.id ? "mt-0.5 block text-[11px] font-bold text-slate-300" : "mt-0.5 block text-[11px] font-bold text-slate-400"}>
                {tab.hint}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SelectField label="Secteur" value={sector} onChange={setSector} options={filterOptions.sectors} />
          <SelectField label="Ville / province" value={location} onChange={setLocation} options={filterOptions.locations} />
          <SelectField label="Source" value={source} onChange={setSource} options={filterOptions.sources} />
          <SelectField label="Qualité contact" value={contactFilter} onChange={setContactFilter} options={CONTACT_FILTERS} asObjects />
          <SelectField label="Tri" value={sortMode} onChange={setSortMode} options={SORT_OPTIONS} asObjects />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sectorChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setSector(chip.label)}
              className={[
                "rounded-full border px-3 py-2 text-xs font-black transition",
                sector === chip.label
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white",
              ].join(" ")}
            >
              {chip.label} <span className="opacity-70">{formatNumber(chip.count)}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              resetFilters({ setQuery, setActiveTab, setSector, setLocation, setSource, setContactFilter, setSortMode })
            }
            className="ml-auto rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
          >
            Réinitialiser
          </button>
        </div>
      </section>

      <section className="mx-auto mt-5 grid max-w-7xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Entreprises FEC" value={stats.fec} tone="slate" />
        <Metric label="Mines et ressources" value={stats.mines} tone="amber" />
        <Metric label="Finance / investisseurs" value={stats.finance} tone="emerald" />
        <Metric label="ARSP enregistrées" value={stats.arsp} tone="sky" />
      </section>

      {loading && (
        <div className="mx-auto mt-5 max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600 shadow-sm">
          Chargement de l'annuaire...
        </div>
      )}

      {!loading && error && (
        <div className="mx-auto mt-5 max-w-7xl rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {!loading && !error && !filteredRecords.length && (
        <div className="mx-auto mt-5 max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-black">Aucun contact trouvé</h2>
          <p className="mt-2 text-sm text-slate-500">Modifiez la recherche ou retirez certains filtres.</p>
        </div>
      )}

      {!loading && !error && !!filteredRecords.length && (
        <section className="mx-auto mt-6 max-w-7xl space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Résultats</p>
              <h2 className="text-2xl font-black">
                {formatNumber(filteredRecords.length)} contact(s) exploitable(s)
              </h2>
            </div>
            <p className="text-xs font-bold text-slate-500">
              Affichage : {formatNumber(visibleRecords.length)} sur {formatNumber(filteredRecords.length)}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {visibleRecords.map((record) => (
              <DirectoryCard key={record.id} record={record} />
            ))}
          </div>

          {visibleCount < filteredRecords.length && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800"
              >
                Afficher plus de contacts
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function HeroMetric({ label, value }) {
  return (
    <div className="rounded-[1.35rem] border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
      <div className="text-3xl font-black">{formatNumber(value)}</div>
      <div className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-200">{label}</div>
    </div>
  );
}

function Metric({ label, value, tone }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
  };
  return (
    <div className={`rounded-[1.4rem] border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="text-2xl font-black">{formatNumber(value)}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] opacity-65">{label}</div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, asObjects = false }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
      >
        {!asObjects && <option value="">Tous</option>}
        {(options || []).map((option) => {
          const optValue = asObjects ? option.value : option;
          const optLabel = asObjects ? option.label : option;
          return (
            <option key={optValue || "all"} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function DirectoryCard({ record }) {
  const quality = recordQuality(record);
  const sourceText = compactText([record.sourceDocument, record.page ? `page ${record.page}` : "", record.source]);
  const profile = compactText([record.operation, record.activity, record.address, record.notes]);
  const categoryLabel = getCategoryLabel(record);

  return (
    <article className="group overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10">
      <div className="h-1.5 bg-gradient-to-r from-emerald-700 via-amber-500 to-slate-900" />
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isMine(record) ? "amber" : isPublicDirectory(record) ? "emerald" : "slate"}>{categoryLabel}</Badge>
          {hasInvestorSignal(record) && <Badge tone="sky">Financement</Badge>}
          {record.sector && <Badge tone="soft">{record.sector}</Badge>}
          <span className="ml-auto rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
            {quality}/100
          </span>
        </div>

        <h3 className="mt-3 text-xl font-black leading-tight text-slate-950">{record.name || "Contact sans nom"}</h3>
        <p className="mt-2 text-sm font-bold text-slate-500">
          {compactText([record.city, record.province]) || "Localisation à vérifier"}
        </p>

        {profile && <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-700">{profile}</p>}

        {record.contactPerson && (
          <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            Contact : {record.contactPerson}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ContactList label="Emails" items={record.emails} type="email" />
          <ContactList label="Téléphones" items={record.phones} type="phone" />
        </div>

        {!!(record.websites || []).length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {record.websites.slice(0, 3).map((site) => (
              <a
                key={site}
                href={site.startsWith("http") ? site : `https://${site}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                Site web
              </a>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs font-semibold leading-5 text-slate-500">
          <span>Source : {sourceText || "document fourni"}</span>
          {record.sourceUrl && (
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-slate-100 px-3 py-1.5 font-black text-slate-700 hover:bg-slate-200"
            >
              Voir source
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function Badge({ children, tone }) {
  const tones = {
    amber: "bg-amber-100 text-amber-900",
    emerald: "bg-emerald-100 text-emerald-900",
    sky: "bg-sky-100 text-sky-900",
    slate: "bg-slate-100 text-slate-700",
    soft: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${tones[tone] || tones.slate}`}>{children}</span>;
}

function getCategoryLabel(record) {
  if (isMine(record)) return "Mines";
  if (record.category === "arsp") return "ARSP";
  if (record.category === "sante") return "Santé";
  if (record.category === "fec") return "FEC";
  if (isPublicDirectory(record)) return "Annuaire public";
  if (isFinance(record)) return "Finance";
  return "Business";
}

function ContactList({ label, items = [], type }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      {items.length ? (
        <div className="mt-2 space-y-1">
          {items.slice(0, 4).map((item) => {
            const href = type === "email" ? `mailto:${item}` : `tel:${item}`;
            return (
              <a
                key={item}
                href={href}
                className="block break-all text-sm font-bold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
              >
                {item}
              </a>
            );
          })}
          {items.length > 4 && <p className="text-xs font-bold text-slate-500">+ {items.length - 4} autre(s)</p>}
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-slate-400">Non renseigné</p>
      )}
    </div>
  );
}
