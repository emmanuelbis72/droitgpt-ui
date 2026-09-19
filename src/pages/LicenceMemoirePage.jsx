import React, { useEffect, useMemo, useRef, useState } from "react";
import { generationHeaders } from "../utils/generationClient.js";
import ExistingPaymentRecovery from "../components/payments/ExistingPaymentRecovery.jsx";
import MobileMoneyPayment from "../components/payments/MobileMoneyPayment.jsx";
import { clearStoredPayment } from "../services/paymentsApi.js";
import { updateGeneratedDocument, upsertGeneratedDocument } from "../services/generatedDocuments.js";

const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";
const API_BASE = import.meta.env.VITE_ACADEMIC_API_BASE || import.meta.env.VITE_BP_API_BASE || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;
const METHODS = [
  { value: "doctrinale", label: "Doctrinale (analyse textes & doctrine)" },
  { value: "comparative", label: "Comparative (RDC vs autres)" },
  { value: "jurisprudence", label: "Analyse de jurisprudence" },
  { value: "case_study", label: "Étude de cas" },
];

const INPUT =
  "w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10";

async function readResponseError(res) {
  try {
    const ct = (res?.headers?.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const j = await res.json();
      return j?.details || j?.error || JSON.stringify(j);
    }
    return (await res.text()) || "";
  } catch (e) {
    return String(e?.message || e);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function LicenceMemoirePage() {
  
  function formatTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(Math.floor(s % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
  }
const [mode, setMode] = useState("standard"); // standard | droit_congolais
  const [lang, setLang] = useState("fr");
  const citationStyle = "footnotes"; // ✅ fixed: footnotes by default

  const [form, setForm] = useState({
    topic: "",
    university: "",
    faculty: "",
    department: "",
    academicYear: "",
    problemStatement: "",
    objectives: "",
    methodology: "doctrinale",
    plan: "",
    lengthPagesTarget: 70,
    studentName: "",
    supervisorName: "",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [progressElapsed, setProgressElapsed] = useState(0);
// 0..100
  const progressTimerRef = useRef(null);
  const [error, setError] = useState("");
  const [sourcesUsed, setSourcesUsed] = useState([]);
  const [lastPdfUrl, setLastPdfUrl] = useState("");
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [paymentOrderNumber, setPaymentOrderNumber] = useState("");
  const [paymentResetSignal, setPaymentResetSignal] = useState(0);
  const [paymentOpenSignal, setPaymentOpenSignal] = useState(0);

  const lastPdfUrlRef = useRef("");
  const revokeLastPdfUrl = () => {
    const u = lastPdfUrlRef.current || lastPdfUrl;
    if (u) URL.revokeObjectURL(u);
    lastPdfUrlRef.current = "";
    setLastPdfUrl("");
  };

  useEffect(() => {
    return () => {
      if (lastPdfUrlRef.current) URL.revokeObjectURL(lastPdfUrlRef.current);
    };
  }, []);
useEffect(() => {
    if (!isGenerating) {
      // stop timer
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }

    // Progress estimate: keep the UI informative while the server job continues.
    setProgress(0);
    setProgressElapsed(0);
    const totalSec = 900;
    let elapsed = 0;

    progressTimerRef.current = setInterval(() => {
      elapsed += 1;
      // keep it believable: cap at 99% until finished
      const pct = Math.min(99, Math.floor((elapsed / totalSec) * 100));
      setProgress(pct);
      
      setProgressElapsed(elapsed);
if (elapsed >= totalSec) {
        // keep running at 99% until backend finishes
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, 1000);

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [isGenerating]);


  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  useEffect(() => {
    if (mode === "droit_congolais") {
      setForm((p) => ({ ...p, faculty: "Droit" }));
    }
  }, [mode]);


  async function generateMemoire() {
    setError("");
    setSourcesUsed([]);
    revokeLastPdfUrl();
    if (paymentRequired && !paymentOrderNumber) {
      setError("Valide d'abord le paiement Mobile Money avant de lancer la génération.");
      return;
    }
    setIsGenerating(true);

    try {
      const payload = {
        mode,
        language: lang,
        // ✅ footnotes always on (no UI field)
        citationStyle: "footnotes",
        ...form,
        // ✅ fixed: always 70 pages
        lengthPagesTarget: 70,
        // ✅ standard mode: no methodology field sent
        methodology: mode === "standard" ? undefined : form.methodology,
        // ✅ droit congolais: faculty implicit
        faculty: mode === "droit_congolais" ? "Droit" : form.faculty,
      };

const apiBase = API_BASE.replace(/\/$/, "");
const endpoint = `${apiBase}/generate-academic/licence-memoire`;
console.log("[Memoire] POST", `${endpoint}?async=1`);

// ✅ Timeout local large; le backend continue en job si le navigateur se met en veille.
const controller = new AbortController();
const timeoutMs = Number(import.meta.env.VITE_ACADEMIC_TIMEOUT_MS || 45 * 60 * 1000);
const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

let r;
let jobId = "";
let fileName = "";
try {
  const startRes = await fetch(`${endpoint}?async=1`, {
    method: "POST",
    headers: generationHeaders({
      "Content-Type": "application/json",
      ...(paymentOrderNumber ? { "X-Payment-Order": paymentOrderNumber } : {}),
    }),
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  if (!startRes.ok) {
    const txt = await readResponseError(startRes);
    throw new Error(txt || `Erreur serveur (${startRes.status})`);
  }

  const started = await startRes.json();
  jobId = started?.jobId;
  if (!jobId) throw new Error("JOB_ID manquant (backend ?async=1 non actif).");

  const statusUrl = `${apiBase}/generate-academic/licence-memoire/jobs/${encodeURIComponent(jobId)}`;
  const resultUrl = `${apiBase}/generate-academic/licence-memoire/jobs/${encodeURIComponent(jobId)}/result`;
  fileName = `memoire_licence_${(form.topic || "droit").slice(0, 40).replace(/\s+/g, "_")}.pdf`;
  upsertGeneratedDocument({
    documentType: "memoire",
    title: form.topic || "Mémoire de licence",
    fileName,
    jobId,
    statusUrl,
    resultUrl,
    apiBase: apiBase,
    paymentOrderNumber,
    regeneration: {
      method: "POST",
      url: `${endpoint}?async=1`,
      body: payload,
      statusUrlTemplate: `${apiBase}/generate-academic/licence-memoire/jobs/{jobId}`,
      resultUrlTemplate: `${apiBase}/generate-academic/licence-memoire/jobs/{jobId}/result`,
    },
  });
  if (paymentOrderNumber) {
    clearStoredPayment("memoire");
    setPaymentOrderNumber("");
    setPaymentResetSignal((value) => value + 1);
  }

  while (true) {
    const statusRes = await fetch(statusUrl, {
      headers: generationHeaders(),
      signal: controller.signal,
    });
    if (!statusRes.ok) {
      const txt = await readResponseError(statusRes);
      throw new Error(txt || `Erreur statut job (${statusRes.status})`);
    }

    const st = await statusRes.json();
    updateGeneratedDocument(jobId, { status: st.status, error: st.error || null, doneAt: st.doneAt || null });
    if (st.status === "error") throw new Error(st.error || "Erreur job inconnue.");
    if (st.status === "done") break;
    await wait(4000);
  }

  r = await fetch(resultUrl, {
    headers: generationHeaders(),
    signal: controller.signal,
  });
} finally {
  window.clearTimeout(timeoutId);
}

if (!r.ok) {
  const txt = await readResponseError(r);
  throw new Error(txt || `Erreur serveur (${r.status})`);
}

const ct = (r.headers.get("content-type") || "").toLowerCase();
if (!ct.includes("application/pdf")) {
  const txt = await readResponseError(r);
  throw new Error(txt || `Réponse inattendue (Content-Type: ${ct || "inconnu"})`);
}

      const hdr = r.headers.get("x-sources-used");
      if (hdr) {
        try {
          const parsed = JSON.parse(hdr);
          if (Array.isArray(parsed)) setSourcesUsed(parsed);
        } catch (_) {}
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      lastPdfUrlRef.current = url;
      setLastPdfUrl(url);
      setProgress(100);

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      updateGeneratedDocument(jobId, { status: "done", downloadedAt: new Date().toISOString() });
} catch (e) {
  const msg = String(e?.name === "AbortError"
    ? "La génération a dépassé le temps limite. Réessaye (ou augmente le timeout côté frontend)."
    : (e?.message || e));
  setError(msg);
} finally {
      setIsGenerating(false);
    }
  }

  const modeDesc = useMemo(() => {
    if (mode === "droit_congolais") {
      return "Droit congolais (avec sources). Les sources utilisées seront listées ci-dessous.";
    }
    return "Standard.";
  }, [mode]);

  const guideFields = [
    { label: "sujet du mémoire", value: form.topic },
    { label: "université", value: form.university },
    { label: "année académique", value: form.academicYear },
    { label: "problématique", value: form.problemStatement },
    { label: "objectifs", value: form.objectives },
  ];
  const completedGuideFields = guideFields.filter((field) => String(field.value || "").trim()).length;
  const formCompletion = Math.round((completedGuideFields / guideFields.length) * 100);
  const nextGuideField = guideFields.find((field) => !String(field.value || "").trim())?.label;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-6 border-b border-white/10 bg-slate-950/70">
          <div className="text-[11px] uppercase tracking-[0.25em] text-slate-300 font-bold">Académique • Licence</div>
          <h1 className="text-2xl font-semibold mt-1">Mémoire de fin de cycle</h1>
          <p className="mt-1 text-sm text-slate-300">
            Rédigez un mémoire complet. Activez l’option spéciale Droit congolais pour intégrer vos sources Qdrant.
          </p>
        </div>

        <div className="px-6 py-6 bg-slate-950/60 space-y-6">
          <MobileMoneyPayment
            apiBase={API_BASE}
            documentType="memoire"
            variant="dark"
            disabled={isGenerating}
            resetSignal={paymentResetSignal}
            openSignal={paymentOpenSignal}
            className="hidden"
            onRequirementChange={setPaymentRequired}
            onPaymentReady={setPaymentOrderNumber}
          />

          <ExistingPaymentRecovery
            apiBase={API_BASE}
            documentType="memoire"
            variant="dark"
            visible={paymentRequired}
            disabled={isGenerating}
            currentOrderNumber={paymentOrderNumber}
            resetSignal={paymentResetSignal}
            onPaymentReady={setPaymentOrderNumber}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <QuickSetting title="Langue du document" hint="Français par défaut. Choisissez English si vous voulez recevoir le mémoire en anglais.">
              <ChoiceButton active={lang === "fr"} disabled={isGenerating} onClick={() => setLang("fr")}>
                Français
              </ChoiceButton>
              <ChoiceButton active={lang === "en"} disabled={isGenerating} onClick={() => setLang("en")}>
                English
              </ChoiceButton>
            </QuickSetting>

            <QuickSetting title="Format académique" hint="Le document est généré en PDF stable, avec une structure complète de mémoire de licence.">
              <div className="rounded-xl border border-emerald-400/60 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                PDF stable
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm font-semibold text-slate-300">
                Environ 70 pages
              </div>
            </QuickSetting>
          </div>

          <FormProgress completion={formCompletion} nextLabel={nextGuideField} />

          {/* Mode toggle */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Mode de rédaction</div>
                <div className="text-xs text-slate-300 mt-1">{modeDesc}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("standard")}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                    mode === "standard"
                      ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setMode("droit_congolais")}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                    mode === "droit_congolais"
                      ? "border-fuchsia-400/70 bg-fuchsia-500/10 text-fuchsia-200"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Droit congolais
                </button>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Sujet / Titre">
              <input name="topic" value={form.topic} onChange={onChange} className={INPUT} placeholder="Ex: La responsabilité civile du transporteur en droit congolais..." />
            </Field>
            <Field label="Année académique">
              <input name="academicYear" value={form.academicYear} onChange={onChange} className={INPUT} placeholder="2025-2026" />
            </Field>

            <Field label="Université">
              <input name="university" value={form.university} onChange={onChange} className={INPUT} placeholder="Ex: Université de..." />
            </Field>
            {mode !== "droit_congolais" && (
              <Field label="Faculté">
                <input name="faculty" value={form.faculty} onChange={onChange} className={INPUT} placeholder="Ex: Droit" />
              </Field>
            )}
<Field label="Département (optionnel)">
              <input name="department" value={form.department} onChange={onChange} className={INPUT} placeholder="Ex: Droit privé" />
            </Field>
            {mode !== "standard" && (
              <Field label="Méthodologie">
                <select name="methodology" value={form.methodology} onChange={onChange} className={INPUT}>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
<Field label="Étudiant (optionnel)">
              <input name="studentName" value={form.studentName} onChange={onChange} className={INPUT} placeholder="Nom de l’étudiant" />
            </Field>
            <Field label="Encadreur (optionnel)">
              <input name="supervisorName" value={form.supervisorName} onChange={onChange} className={INPUT} placeholder="Nom du directeur" />
            </Field>
          </div>

          <Field label="Problématique">
            <textarea name="problemStatement" value={form.problemStatement} onChange={onChange} className={`${INPUT} min-h-[110px]`} placeholder="Décris la problématique et l’enjeu du mémoire..." />
          </Field>

          <Field label="Objectifs (général + spécifiques)">
            <textarea name="objectives" value={form.objectives} onChange={onChange} className={`${INPUT} min-h-[90px]`} placeholder="Objectif général + 3-5 objectifs spécifiques..." />
          </Field>

          <Field label="Plan (optionnel : colle ton plan si tu l’as)">
            <textarea name="plan" value={form.plan} onChange={onChange} className={`${INPUT} min-h-[90px]`} placeholder="INTRO... Chapitre 1... Chapitre 2... Conclusion..." />
          </Field>

          {/* Actions */}

          {/* Progress bar */}
          {isGenerating && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-300">Génération du mémoire (~15 minutes)</div>
              <div className="mt-1 text-[11px] text-slate-400">
                Temps restant estimé : {formatTime(Math.max(0, 900 - progressElapsed))} / 15:00
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-emerald-400/80" style={{ width: `${progress}%`, transition: "width 1s linear" }} />
              </div>
              <div className="mt-2 text-[11px] text-slate-300">{progress}%</div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs leading-5 text-slate-300">
              <div>
                Prix : <b className="text-emerald-300">3 USD</b>.
              </div>
              <div>
                Génération moyenne : environ <b className="text-slate-100">15 minutes</b> pour obtenir un mémoire professionnel et structuré.
              </div>
              <div>
                Langue actuelle : <b className="text-slate-100">{lang === "en" ? "English" : "Français"}</b>.
              </div>
            </div>

            <button
              type="button"
              onClick={paymentRequired && !paymentOrderNumber ? () => setPaymentOpenSignal((value) => value + 1) : generateMemoire}
              disabled={isGenerating}
              className="rounded-2xl px-5 py-3 font-semibold border border-white/10 bg-white/10 hover:bg-white/15 transition disabled:opacity-60"
            >
              {isGenerating ? "Génération en cours…" : paymentRequired && !paymentOrderNumber ? "Payer puis générer le mémoire" : "Générer & Télécharger"}
            </button>

            {lastPdfUrl && (
              <button
                type="button"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = lastPdfUrl;
                  a.download = `memoire_licence_${(form.topic || "droit").slice(0, 40).replace(/\s+/g, "_")}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }}
                className="rounded-2xl px-5 py-3 font-semibold border border-white/10 bg-slate-900/70 hover:bg-slate-900 transition"
              >
                Télécharger à nouveau
              </button>
            )}

            {error && (
              <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 text-rose-100 px-4 py-3 text-sm">{error}</div>
            )}
          </div>

          {/* Sources used (visible only in Congo law mode) */}
          {mode === "droit_congolais" && (
            <div className="rounded-2xl border border-fuchsia-400/20 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Sources utilisées</div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-200">Qdrant</span>
              </div>

              {sourcesUsed?.length ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-200">
                  {sourcesUsed.slice(0, 12).map((s, idx) => (
                    <li key={idx} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="font-medium">{s.title || s.source || "Source"}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {s.type ? `${s.type} • ` : ""}
                        {s.year || ""}
                        {s.author ? ` • ${s.author}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 text-sm text-slate-300">
                  Aucune source listée pour le moment. Lance une génération en mode Droit congolais.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-slate-950/80 text-[11px] text-slate-400 flex items-center justify-center">
          © {new Date().getFullYear()} DroitGPT • Mémoire Licence
        </div>
      </div>
    </div>
  );
}

function QuickSetting({ title, hint, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-400">{hint}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function ChoiceButton({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        active
          ? "border-emerald-400 bg-emerald-400 text-slate-950"
          : "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-white/10"
      } disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

function FormProgress({ completion, nextLabel }) {
  const value = Math.max(0, Math.min(100, Number(completion) || 0));
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Saisie progressive</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Remplissez d'abord les informations essentielles. Le plan et les détails optionnels peuvent être ajoutés ensuite.
          </p>
        </div>
        <div className="text-sm font-bold text-emerald-300">{value}% prêt</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${value}%` }} />
      </div>
      {nextLabel ? (
        <p className="mt-2 text-xs text-slate-400">
          Prochaine information utile : <span className="font-semibold text-slate-100">{nextLabel}</span>.
        </p>
      ) : (
        <p className="mt-2 text-xs font-semibold text-emerald-300">Les informations clés sont remplies.</p>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-300 mb-2">{label}</div>
      {children}
    </label>
  );
}
