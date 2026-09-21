import React, { useMemo, useState } from "react";
import ExistingPaymentRecovery from "../payments/ExistingPaymentRecovery.jsx";
import MobileMoneyPayment from "../payments/MobileMoneyPayment.jsx";
import {
  BUSINESS_PLAN_PACK_ITEMS,
  BUSINESS_PLAN_PACK_SUMMARY,
  FREE_BUSINESS_PLAN_SAMPLES,
} from "../../data/businessPlanPackCatalog.js";

const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";
const API_BASE = String(import.meta.env.VITE_BP_API_BASE || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
const PACK_CATEGORIES = ["Tous", ...Array.from(new Set(BUSINESS_PLAN_PACK_ITEMS.map((item) => item.category))).sort()];

export default function BusinessPlanPackOffer({ compact = false, variant = "light", className = "", eyebrow = "Offre entrepreneur" }) {
  const [packOrder, setPackOrder] = useState("");
  const [packOpenSignal, setPackOpenSignal] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [sampleDownloading, setSampleDownloading] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");

  const businessPlans = BUSINESS_PLAN_PACK_SUMMARY.businessPlans || (BUSINESS_PLAN_PACK_SUMMARY.docx || 0) + (BUSINESS_PLAN_PACK_SUMMARY.pdf || 0);
  const pitchDecks = BUSINESS_PLAN_PACK_SUMMARY.pitchDecks || BUSINESS_PLAN_PACK_SUMMARY.pptx || 0;
  const totalFiles = BUSINESS_PLAN_PACK_SUMMARY.totalFiles || BUSINESS_PLAN_PACK_SUMMARY.total || BUSINESS_PLAN_PACK_ITEMS.length;

  const filteredItems = useMemo(() => filterPackItems(query, category), [query, category]);
  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, compact ? 8 : 18);
  const isDark = variant === "dark";

  async function downloadPack() {
    if (!packOrder) {
      setPackOpenSignal((value) => value + 1);
      return;
    }

    setDownloading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/business-plan-pack/download`, {
        headers: { "X-Payment-Order": packOrder },
      });
      if (!response.ok) throw new Error(await readDownloadError(response));
      await downloadBlob(response, "DroitGPT-Pack-Plans-Affaires-et-Pitch-Decks.zip");
    } catch (err) {
      setError(err?.message || "Téléchargement impossible.");
    } finally {
      setDownloading(false);
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

  const shell = isDark
    ? "border-white/10 bg-slate-950/70 text-white"
    : "border-slate-200 bg-white text-slate-950";
  const panel = isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white/85";
  const muted = isDark ? "text-slate-300" : "text-slate-600";

  return (
    <section className={`overflow-hidden rounded-[2rem] border shadow-sm ${shell} ${className}`}>
      <div className="relative bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_30%),linear-gradient(135deg,#022c22,#0f172a_55%,#431407)] p-6 text-white sm:p-8">
        <div className="absolute right-5 top-5 rounded-full bg-rose-500 px-4 py-2 text-sm font-black text-white shadow-lg">
          Promo 20 USD
        </div>
        {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">{eyebrow}</p> : null}
        <h2 className="mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
          Pack de {businessPlans} plans d'affaires + {pitchDecks} pitch decks
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200">
          Un lot prêt à adapter pour lancer, financer ou présenter un projet : plans d'affaires structurés et pitch decks
          pour banque, investisseur, incubateur ou partenaire.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <PackStat value={businessPlans} label="Plans d'affaires" />
          <PackStat value={pitchDecks} label="Pitch decks" />
          <PackStat value={totalFiles} label="Fichiers inclus" />
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={downloadPack}
            disabled={downloading}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-400 disabled:opacity-60"
          >
            {downloading ? "Téléchargement..." : packOrder ? "Télécharger le pack" : "Acheter le pack à 20 USD"}
          </button>
          {!compact ? (
            <a href="#catalogue-pack" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-center text-sm font-black text-white hover:bg-white/15">
              Voir le contenu du pack
            </a>
          ) : null}
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">{error}</div> : null}
      </div>

      <div className={`space-y-5 p-5 sm:p-6 ${isDark ? "bg-slate-950" : "bg-[linear-gradient(135deg,#ecfdf5,#fff7ed)]"}`}>
        <MobileMoneyPayment
          apiBase={API_BASE}
          documentType="businessplan_pack"
          variant={isDark ? "dark" : "light"}
          openSignal={packOpenSignal}
          launcherTitle="Paiement du pack"
          launcherHint="Paiement unique. Après confirmation, le téléchargement se débloque automatiquement."
          paidMessage="Paiement confirmé. Vous pouvez télécharger le pack."
          onPaymentReady={setPackOrder}
        />

        <ExistingPaymentRecovery
          apiBase={API_BASE}
          documentType="businessplan_pack"
          variant={isDark ? "dark" : "light"}
          currentOrderNumber={packOrder}
          onPaymentReady={setPackOrder}
        />

        <div className={`rounded-3xl border p-4 ${panel}`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500">Aperçu gratuit</p>
              <h3 className="text-lg font-black">3 modèles téléchargeables avant achat</h3>
            </div>
            <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Gratuit</span>
          </div>
          <div className="mt-3 grid gap-2">
            {FREE_BUSINESS_PLAN_SAMPLES.map((sample) => (
              <div key={sample.id} className={`rounded-2xl border p-3 ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-white"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black leading-5">{sample.title}</p>
                    <p className={`mt-1 text-xs font-bold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{sample.sector}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadSample(sample)}
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

        {!compact ? (
          <div id="catalogue-pack" className={`rounded-3xl border p-4 ${panel}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500">Catalogue</p>
                <h3 className="text-xl font-black">Plans d'affaires et pitch decks inclus</h3>
                <p className={`mt-1 text-sm ${muted}`}>{filteredItems.length} document(s) dans cette sélection.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_220px] lg:w-[520px]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Chercher un secteur ou un projet..."
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {PACK_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 grid max-h-[520px] gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
              {visibleItems.map((item) => (
                <div key={item.id} className={`rounded-2xl border p-3 ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-white"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-black leading-5">{item.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${item.format === "PPTX" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {item.format === "PPTX" ? "Pitch deck" : "Plan"}
                    </span>
                  </div>
                  <p className={`mt-1 text-xs font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{item.category}</p>
                </div>
              ))}
            </div>
            {filteredItems.length > visibleItems.length || showAll ? (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className={`mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-black ${isDark ? "border-white/10 text-slate-100 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {showAll ? "Réduire la liste" : `Afficher tous les ${filteredItems.length} documents`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PackStat({ value, label }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <p className="text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-300">{label}</p>
    </div>
  );
}

function filterPackItems(query, category) {
  const q = String(query || "").trim().toLowerCase();
  return BUSINESS_PLAN_PACK_ITEMS.filter((item) => {
    const categoryOk = category === "Tous" || item.category === category;
    const kind = item.format === "PPTX" ? "pitch deck presentation" : "plan affaires business plan";
    const queryOk = !q || `${item.title} ${item.category} ${kind}`.toLowerCase().includes(q);
    return categoryOk && queryOk;
  });
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
