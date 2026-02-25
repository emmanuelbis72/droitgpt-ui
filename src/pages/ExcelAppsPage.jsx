import React, { useEffect, useMemo, useRef, useState } from "react";

// Ultra Pro v2 – Excel progiciel generator (async jobs + 15 min progress bar)

const API_BASE = import.meta?.env?.VITE_BP_API_BASE || ""; // optional

const TEMPLATES = [
  {
    id: "cash_management",
    title: "Gestion Caisse & Dépenses",
    subtitle: "Entrées, sorties, catégories, dashboard",
    defaults: { appName: "Gestion Caisse & Dépenses" },
  },
  {
    id: "school_management",
    title: "Gestion d'École",
    subtitle: "Élèves, frais, notes, tableau de bord",
    defaults: { appName: "Gestion École", schoolName: "", year: "2025-2026" },
  },
  {
    id: "inventory_sales",
    title: "Stock & Ventes",
    subtitle: "Produits, mouvements de stock, KPIs",
    defaults: { appName: "Stock & Ventes" },
  },
  {
    id: "hr_payroll",
    title: "RH & Salaires",
    subtitle: "Employés, paie, synthèse",
    defaults: { appName: "RH & Salaires" },
  },
  {
    id: "ngo_budget_me",
    title: "Projet ONG – Budget & S&E",
    subtitle: "Activités, budget, indicateurs, dashboard",
    defaults: { appName: "Projet ONG – Budget & S&E" },
  },
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function ExcelAppsPage() {
  const [templateId, setTemplateId] = useState("cash_management");
  const tpl = useMemo(() => TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0], [templateId]);

  const [appName, setAppName] = useState(tpl.defaults.appName);
  const [schoolName, setSchoolName] = useState("");
  const [year, setYear] = useState("2025-2026");

  const [status, setStatus] = useState("idle"); // idle|running|done|error
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState(null);

  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // 15 minutes progress bar
  const TOTAL_MS = 15 * 60 * 1000;

  const startRef = useRef(0);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    // template switch: reset defaults
    setAppName(tpl.defaults.appName || "Progiciel Excel");
    setError(null);
    setStatus("idle");
    setJobId(null);
  }, [tpl.id]);

  function stopAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    timerRef.current = null;
    pollRef.current = null;
  }

  async function start() {
    setError(null);
    setStatus("running");
    setProgress(0);
    setElapsed(0);

    startRef.current = Date.now();
    stopAll();

    timerRef.current = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      setProgress(clamp((e / TOTAL_MS) * 100, 0, 99));
    }, 250);

    const ctx = {
      type: tpl.id,
      appName: appName?.trim() || tpl.defaults.appName,
    };
    if (tpl.id === "school_management") {
      if (schoolName?.trim()) ctx.schoolName = schoolName.trim();
      if (year?.trim()) ctx.year = year.trim();
    }

    try {
      const r = await fetch(`${API_BASE}/generate-excel-app?async=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "fr", ctx }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || j?.error || "REQUEST_FAILED");
      const id = j.jobId;
      setJobId(id);

      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`${API_BASE}/generate-excel-app/jobs/${id}`);
          const pj = await pr.json();
          if (!pr.ok) throw new Error(pj?.error || "POLL_FAILED");

          if (pj.status === "done") {
            stopAll();
            setProgress(100);
            setStatus("done");

            // Save history (simple)
            const hist = JSON.parse(localStorage.getItem("excel_jobs") || "[]");
            const item = { id, type: tpl.id, appName: ctx.appName, at: Date.now() };
            localStorage.setItem("excel_jobs", JSON.stringify([item, ...hist].slice(0, 30)));
          }
          if (pj.status === "error") {
            stopAll();
            setStatus("error");
            setError(pj.error || "GENERATION_FAILED");
          }
        } catch (e) {
          stopAll();
          setStatus("error");
          setError(String(e?.message || e));
        }
      }, 1500);
    } catch (e) {
      stopAll();
      setStatus("error");
      setError(String(e?.message || e));
    }
  }

  function download() {
    if (!jobId) return;
    window.open(`${API_BASE}/generate-excel-app/jobs/${jobId}/result`, "_blank");
  }

  const remaining = Math.max(0, TOTAL_MS - elapsed);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Progiciels Excel – Ultra Pro v2</h1>
          <p className="mt-2 text-slate-300">
            Génération de fichiers Excel prêts à l’emploi (formulaires, validations, tableaux, KPIs). Pas de macros.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="text-sm font-semibold text-slate-200">Choisir un modèle</div>
            <div className="mt-3 grid gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    t.id === tpl.id
                      ? "border-slate-200 bg-slate-800/70"
                      : "border-slate-800 bg-slate-900/30 hover:bg-slate-900/70"
                  }`}
                >
                  <div className="font-bold">{t.title}</div>
                  <div className="text-sm text-slate-300">{t.subtitle}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="text-sm font-semibold text-slate-200">Paramètres</div>

            <label className="mt-4 block text-sm text-slate-300">Nom du progiciel</label>
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none"
              placeholder="Ex: Gestion École – Sainte Marie"
            />

            {tpl.id === "school_management" && (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-slate-300">Nom de l'école</label>
                  <input
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none"
                    placeholder="Ex: Sainte Marie"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300">Année</label>
                  <input
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none"
                    placeholder="2025-2026"
                  />
                </div>
              </div>
            )}

            <button
              onClick={start}
              disabled={status === "running"}
              className="mt-5 w-full rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-950 disabled:opacity-50"
            >
              {status === "running" ? "Génération en cours…" : "Générer le fichier Excel"}
            </button>

            {status !== "idle" && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>{status === "running" ? "Préparation…" : status === "done" ? "Terminé" : "Erreur"}</span>
                  <span>{status === "running" ? `reste ~ ${fmtMs(remaining)}` : ""}</span>
                </div>
                <div className="mt-2 h-3 w-full rounded-full bg-slate-800">
                  <div
                    className="h-3 rounded-full bg-slate-200 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {status === "done" && (
              <button
                onClick={download}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 font-bold text-slate-100"
              >
                Télécharger (.xlsx)
              </button>
            )}

            {status === "error" && (
              <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-5 text-xs text-slate-400">
              Astuce: sur Render (1 CPU / 2GB), la génération se fait "une après l'autre" si le serveur est très sollicité.
              La version multi-instance se fait en activant un stockage de jobs (Redis) côté backend.
            </div>
          </div>
        </div>

        <HistoryBlock apiBase={API_BASE} />
      </div>
    </div>
  );
}

function HistoryBlock({ apiBase }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem("excel_jobs") || "[]"));
    } catch {
      setItems([]);
    }
  }, []);

  if (!items.length) return null;

  return (
    <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Historique (30 derniers)</div>
        <button
          className="text-xs text-slate-300 underline"
          onClick={() => {
            localStorage.removeItem("excel_jobs");
            setItems([]);
          }}
        >
          Effacer
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
            <div>
              <div className="font-bold">{it.appName}</div>
              <div className="text-xs text-slate-400">{new Date(it.at).toLocaleString()}</div>
            </div>
            <button
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-950"
              onClick={() => window.open(`${apiBase}/generate-excel-app/jobs/${it.id}/result`, "_blank")}
            >
              Télécharger
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
