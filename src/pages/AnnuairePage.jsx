import React, { useEffect, useMemo, useState } from "react";

const TAB_DEFINITIONS = [
  { id: "all", label: "Tous les contacts" },
  { id: "mines", label: "Mines" },
  { id: "investors", label: "Fonds et investisseurs" },
  { id: "fec", label: "Entreprises FEC" },
  { id: "emails", label: "Contacts avec email" },
];

const PAGE_SIZE = 120;

function lower(value) {
  return String(value || "").toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function hasInvestorSignal(record) {
  const haystack = [
    record.subCategory,
    record.sector,
    record.operation,
    record.notes,
    record.raw,
  ]
    .map(lower)
    .join(" ");

  return [
    "investisseur",
    "investment",
    "finance",
    "financement",
    "dfi",
    "fund",
    "fonds",
    "critical mineral",
    "infrastructure",
  ].some((term) => haystack.includes(term));
}

function recordMatchesTab(record, tab) {
  if (tab === "mines") return record.category === "mines";
  if (tab === "investors") return record.category === "mines" && hasInvestorSignal(record);
  if (tab === "fec") return record.category === "fec";
  if (tab === "emails") return (record.emails || []).length > 0;
  return true;
}

function compactText(parts) {
  return parts.map((item) => String(item || "").trim()).filter(Boolean).join(" · ");
}

function csvValue(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value || "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv(records) {
  const header = [
    "Nom",
    "Categorie",
    "Sous-categorie",
    "Secteur",
    "Province",
    "Ville",
    "Operation",
    "Adresse",
    "Activite",
    "Contact",
    "Emails",
    "Telephones",
    "Sites",
    "Source",
    "Document",
    "Page",
    "Notes",
  ];

  const rows = records.map((record) => [
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
    record.emails,
    record.phones,
    record.websites,
    record.sourceUrl || record.source,
    record.sourceDocument,
    record.page,
    record.notes,
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `annuaire-droitgpt-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [onlyPhone, setOnlyPhone] = useState(false);
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
    const mines = records.filter((record) => record.category === "mines");
    return {
      total: records.length,
      fec: records.filter((record) => record.category === "fec").length,
      mines: mines.length,
      investors: mines.filter(hasInvestorSignal).length,
      emails: records.filter((record) => (record.emails || []).length > 0).length,
      phones: records.filter((record) => (record.phones || []).length > 0).length,
    };
  }, [records]);

  const filterOptions = useMemo(() => {
    return {
      sectors: unique(records.map((record) => record.sector)),
      locations: unique(records.flatMap((record) => [record.province, record.city]).filter(Boolean)),
      sources: unique(records.map((record) => record.source || record.sourceDocument)),
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = lower(query);
    return records.filter((record) => {
      if (!recordMatchesTab(record, activeTab)) return false;
      if (sector && record.sector !== sector) return false;
      if (source && (record.source || record.sourceDocument) !== source) return false;
      if (location && record.province !== location && record.city !== location) return false;
      if (onlyPhone && !(record.phones || []).length) return false;

      if (!q) return true;
      const haystack = [
        record.name,
        record.sector,
        record.province,
        record.city,
        record.operation,
        record.address,
        record.activity,
        record.contactPerson,
        record.notes,
        record.raw,
        ...(record.emails || []),
        ...(record.phones || []),
        ...(record.websites || []),
      ]
        .map(lower)
        .join(" ");
      return haystack.includes(q);
    });
  }, [activeTab, location, onlyPhone, query, records, sector, source]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, location, onlyPhone, query, sector, source]);

  const visibleRecords = filteredRecords.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-[#f6f0e4] text-slate-950">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-[radial-gradient(circle_at_18%_12%,rgba(234,179,8,0.22),transparent_28%),linear-gradient(135deg,#06171f,#102a43_58%,#3f2412)] p-6 text-white sm:p-9 lg:p-10">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">Annuaire stratégique</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
              Contacts business, FEC, mines et investisseurs pour la RDC.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200">
              Un espace de prospection pour retrouver rapidement les entreprises, décideurs, opérateurs miniers,
              fonds et investisseurs utiles aux projets commerciaux en République démocratique du Congo.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <StatCard label="Contacts" value={stats.total} />
              <StatCard label="Mines" value={stats.mines} />
              <StatCard label="Emails" value={stats.emails} />
            </div>
          </div>

          <div className="p-6 sm:p-9 lg:p-10">
            <div className="rounded-[1.7rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Recherche rapide</p>
              <label className="mt-4 block">
                <span className="sr-only">Rechercher dans l'annuaire</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-slate-900"
                  placeholder="Rechercher une entreprise, un secteur, une ville, un email..."
                />
              </label>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Données extraites de l'annuaire fourni, enrichies avec une liste stratégique de contacts miniers publics.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportCsv(filteredRecords)}
                  disabled={!filteredRecords.length}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Exporter CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveTab("all");
                    setSector("");
                    setLocation("");
                    setSource("");
                    setOnlyPhone(false);
                  }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TAB_DEFINITIONS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "shrink-0 rounded-full px-4 py-2 text-xs font-black transition",
                activeTab === tab.id
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <SelectField label="Secteur" value={sector} onChange={setSector} options={filterOptions.sectors} />
          <SelectField label="Ville / province" value={location} onChange={setLocation} options={filterOptions.locations} />
          <SelectField label="Source" value={source} onChange={setSource} options={filterOptions.sources} />
          <label className="flex min-h-[70px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={onlyPhone}
              onChange={(event) => setOnlyPhone(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Afficher uniquement les contacts avec téléphone
          </label>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Entreprises FEC" value={stats.fec} />
        <Metric label="Investisseurs miniers" value={stats.investors} />
        <Metric label="Téléphones" value={stats.phones} />
        <Metric label="Résultats filtrés" value={filteredRecords.length} />
      </section>

      {loading && (
        <div className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600 shadow-sm">
          Chargement de l'annuaire...
        </div>
      )}

      {!loading && error && (
        <div className="mt-5 rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {!loading && !error && !filteredRecords.length && (
        <div className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-black">Aucun contact trouvé</h2>
          <p className="mt-2 text-sm text-slate-500">Modifiez la recherche ou retirez certains filtres.</p>
        </div>
      )}

      {!loading && !error && !!filteredRecords.length && (
        <section className="mt-5 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Résultats</p>
              <h2 className="text-2xl font-black">
                {filteredRecords.length.toLocaleString("fr-FR")} contact(s) trouvé(s)
              </h2>
            </div>
            <p className="text-xs font-bold text-slate-500">
              Affichage : {visibleRecords.length.toLocaleString("fr-FR")} sur {filteredRecords.length.toLocaleString("fr-FR")}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {visibleRecords.map((record) => (
              <DirectoryCard key={record.id} record={record} />
            ))}
          </div>

          {visibleCount < filteredRecords.length && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
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

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
      <div className="text-2xl font-black">{Number(value || 0).toLocaleString("fr-FR")}</div>
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-200">{label}</div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-black text-slate-950">{Number(value || 0).toLocaleString("fr-FR")}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-slate-900"
      >
        <option value="">Tous</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DirectoryCard({ record }) {
  const isMine = record.category === "mines";
  const sourceText = compactText([record.sourceDocument, record.page ? `page ${record.page}` : "", record.source]);
  const profile = compactText([record.operation, record.activity, record.address, record.notes]);

  return (
    <article className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={isMine ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700"}>
          {isMine ? "Mines" : "FEC"}
        </span>
        {hasInvestorSignal(record) && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
            Investisseur / financement
          </span>
        )}
        {record.sector && (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-800">
            {record.sector}
          </span>
        )}
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
        <div className="mt-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Liens</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {record.websites.map((site) => (
              <a
                key={site}
                href={site.startsWith("http") ? site : `https://${site}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                Site / source
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 text-xs font-semibold leading-5 text-slate-500">
        Source : {record.sourceUrl ? (
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-slate-900">
            {record.sourceUrl}
          </a>
        ) : (
          sourceText || "document fourni"
        )}
      </div>
    </article>
  );
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
              <a key={item} href={href} className="block break-all text-sm font-bold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-slate-950">
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
