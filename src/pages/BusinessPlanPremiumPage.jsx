import React, { useEffect, useMemo, useRef, useState } from "react";
import { generationHeaders } from "../utils/generationClient.js";
import BusinessPlanPackOffer from "../components/businessPlanPack/BusinessPlanPackOffer.jsx";
import MobileMoneyPayment from "../components/payments/MobileMoneyPayment.jsx";
import { clearStoredPayment } from "../services/paymentsApi.js";
import { updateGeneratedDocument, upsertGeneratedDocument } from "../services/generatedDocuments.js";

const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";

const AUDIENCES = [
  {
    value: "bank",
    label: "Banque (dossier de crédit)",
    hint: "Ton document sera écrit pour convaincre une banque : prudence, garanties, capacité de remboursement.",
  },
  {
    value: "investor",
    label: "Investisseur (equity)",
    hint: "Ton document sera écrit pour convaincre un investisseur : traction, croissance, avantage concurrentiel.",
  },
  {
    value: "incubator",
    label: "Incubateur (programme)",
    hint: "Ton document sera écrit pour un incubateur : vision, exécution, apprentissage, roadmap.",
  },
  {
    value: "donor",
    label: "Bailleur / Donor",
    hint: "Ton document sera écrit pour un bailleur : impact, résultats, théorie du changement, durabilité.",
  },
];

const DOCTYPES = [
  { value: "startup", label: "Startup / PME" },
  { value: "commerce", label: "Commerce / Négoce / Boutique" },
  { value: "services", label: "Entreprise de services" },
  { value: "agri", label: "Agri / Agro-industrie" },
  { value: "industry", label: "Industrie / Production" },
  { value: "construction", label: "BTP / Construction / Immobilier" },
  { value: "transport", label: "Transport / Logistique" },
  { value: "mining", label: "Mines / Ressources naturelles" },
  { value: "energy", label: "Énergie / Eau / Environnement" },
  { value: "health", label: "Santé / Clinique / Pharma" },
  { value: "education", label: "Éducation / Formation" },
  { value: "tourism", label: "Hôtellerie / Tourisme / Loisirs" },
  { value: "tech", label: "Tech / Plateforme / SaaS" },
  { value: "manufacturing", label: "Manufacture / Transformation" },
  { value: "ngo", label: "ONG / ASBL / Projet social" },
  { value: "cooperative", label: "Coopérative" },
  { value: "informal", label: "Activité informelle structurée" },
  { value: "other", label: "Autre (à préciser)" },
];


const STAGES = [
  { value: "Ideation", label: "Idée (pas encore lancé)", hint: "Tu as une idée claire, mais pas encore de clients." },
  { value: "Prelaunch", label: "Pré-lancement (préparation)", hint: "Tu prépares : local, fournisseurs, équipe, tests." },
  { value: "Launch", label: "Lancement (début d’activité)", hint: "Tu viens de lancer et tu commences à vendre." },
  { value: "Traction", label: "Traction (clients réguliers)", hint: "Tu as des clients et des ventes récurrentes." },
  { value: "Growth", label: "Croissance (accélération)", hint: "Tu augmentes volume, canaux, équipe." },
  { value: "ScaleUp", label: "Scale-up (forte expansion)", hint: "Tu ouvres plusieurs villes/sites et industrialises." },
  { value: "Mature", label: "Mature (stabilité/optimisation)", hint: "Tu optimises marge, process, gouvernance." },
];

const COMPANY_TYPE_PRESETS = [
  "Entreprise individuelle",
  "SARL",
  "SA",
  "Coopérative",
  "ONG / ASBL",
  "Autre",
];

function safeFilename(name) {
  return String(name || "Business_Plan")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
}

function prettyDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clampText(s, max = 6000) {
  const x = String(s || "").trim();
  if (x.length <= max) return x;
  return x.slice(0, max) + "…";
}

function getOutputFormats(output) {
  const value = String(output || "pdf").toLowerCase();
  if (value === "doc" || value === "word") return [{ format: "doc", ext: "doc", label: "Word" }];
  if (value === "both") {
    return [
      { format: "pdf", ext: "pdf", label: "PDF" },
      { format: "doc", ext: "doc", label: "Word" },
    ];
  }
  return [{ format: "pdf", ext: "pdf", label: "PDF" }];
}

function outputLabel(output) {
  const labels = getOutputFormats(output).map((item) => item.label);
  return labels.join(" + ");
}

function withResultFormat(url, format) {
  if (String(url || "").includes("{jobId}")) {
    const joiner = String(url || "").includes("?") ? "&" : "?";
    return `${url}${joiner}format=${encodeURIComponent(format || "pdf")}`;
  }
  try {
    const next = new URL(url, window.location.origin);
    next.searchParams.set("format", format || "pdf");
    return next.toString();
  } catch {
    const joiner = String(url || "").includes("?") ? "&" : "?";
    return `${url}${joiner}format=${encodeURIComponent(format || "pdf")}`;
  }
}

function buildMultiline(label, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return `- ${label} : ${v}\n`;
}

export default function BusinessPlanPremiumPage() {
  const API_BASE = import.meta.env.VITE_BP_API_BASE || DEFAULT_API_BASE;

  const endpointGenerate = useMemo(
    () => `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium`,
    [API_BASE]
  );

  // Endpoint optionnel (non cassant) pour “corriger un brouillon”
  const endpointRewrite = useMemo(
    () => `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium/rewrite`,
    [API_BASE]
  );

  const [mode, setMode] = useState("generate"); // "generate" | "rewrite"

  const [form, setForm] = useState({
    // Identité / cadrage
    lang: "fr",
    docType: "startup",
    audience: "bank",

    companyName: "",
    country: "RDC",
    city: "Kinshasa",

    stage: "Launch",

    // Type d'entreprise (liste OU libre)
    companyTypeMode: "preset", // "preset" | "free"
    companyTypePreset: "SARL",
    companyTypeFree: "",

    // Activité
    sector: "",
    mission: "",
    problem: "",
    solution: "",
    product: "",

    customers: "",
    market: "",
    competition: "",
    differentiation: "",


    strategicPartnerships: "",
    pricing: "",
    channels: "",
    operations: "",
    team: "",
    traction: "",

    risks: "",
    finAssumptions: "",
    fundingAsk: "",

    // Sortie
    output: "pdf",
    lite: false,

    // Mode rewrite
    rewriteNotes: "",
    rewriteTextFallback: "",
  });

  const [draftFile, setDraftFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [successHint, setSuccessHint] = useState("");
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [paymentOrderNumber, setPaymentOrderNumber] = useState("");
  const [paymentResetSignal, setPaymentResetSignal] = useState(0);
  const [paymentOpenSignal, setPaymentOpenSignal] = useState(0);

  // Last generated files (for re-download without regenerating)
  const [lastGenerateFile, setLastGenerateFile] = useState({ url: "", name: "" });
  const [lastRewriteFile, setLastRewriteFile] = useState({ url: "", name: "" });
  const lastGenerateUrlRef = useRef("");
  const lastRewriteUrlRef = useRef("");

  const abortRef = useRef(null);
  const progressTimerRef = useRef(null);

  // Auto-save (localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bp_premium_form_v3");
      if (raw) {
        const saved = JSON.parse(raw);
        setForm((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("bp_premium_form_v3", JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (abortRef.current) abortRef.current.abort();

      // Clean ObjectURLs
      if (lastGenerateUrlRef.current) URL.revokeObjectURL(lastGenerateUrlRef.current);
      if (lastRewriteUrlRef.current) URL.revokeObjectURL(lastRewriteUrlRef.current);
    };
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startFakeProgress(kind = "generate", liteMode = false) {
    // Lite uses fewer backend sections, so the client-side progress should also feel faster.
    const DURATION_MS = liteMode ? 360000 : 840000;
    const CAP = 95;

    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;

    setProgress(0);
    setSuccessHint("");

    const steps =
      kind === "rewrite"
        ? [
            { at: 10, text: "Analyse du brouillon…" },
            { at: 28, text: "Réorganisation & corrections…" },
            { at: 48, text: "Amélioration du style (niveau banque/investisseur)…" },
            { at: 70, text: "Reconstruction des sections manquantes…" },
            { at: 86, text: "Finances (Y1–Y5) & cohérence…" },
            { at: 95, text: "Finalisation & export…" },
          ]
        : liteMode
        ? [
            { at: 10, text: "Mode Lite : cadrage rapide…" },
            { at: 25, text: "Résumé exécutif…" },
            { at: 45, text: "Canvas & SWOT…" },
            { at: 70, text: "Finances essentielles…" },
            { at: 88, text: "Demande de financement…" },
            { at: 95, text: "Finalisation & export…" },
          ]
        : [
{ at: 8, text: "Analyse du contexte…" },
{ at: 20, text: "Executive Summary…" },
{ at: 34, text: "Marché…" },
{ at: 44, text: "Concurrence & différenciation…" },
{ at: 54, text: "Modèle économique…" },
{ at: 62, text: "Partenariats stratégiques…" },
{ at: 72, text: "Go-To-Market…" },
{ at: 82, text: "Canvas / SWOT / KPIs…" },
{ at: 90, text: "Section financière (Y1–Y5)…" },
{ at: 95, text: "Finalisation & export…" },          ];

    let i = 0;
    setStatusText(steps[0].text);

    const startedAt = Date.now();

    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(elapsed / DURATION_MS, 1);

      // smooth ease-out curve
      const eased = 1 - Math.pow(1 - ratio, 3);
      const target = Math.floor(eased * CAP);

      setProgress((p) => {
        const next = Math.min(CAP, Math.max(p, target));
        // advance status text when crossing thresholds
        while (i < steps.length - 1 && next >= steps[i + 1].at) i += 1;
        setStatusText(steps[i].text);
        return next;
      });
    }, 200);
  }

  function stopFakeProgress(finalText) {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;
    setProgress(100);
    setStatusText(finalText || "Terminé.");
    setTimeout(() => setProgress(0), 900);
  }


  function onCancel() {
    if (abortRef.current) abortRef.current.abort();
    setLoading(false);
    setProgress(0);
    setStatusText("");
  }

  function getCompanyTypeValue() {
    if (form.companyTypeMode === "free") return String(form.companyTypeFree || "").trim();
    const p = String(form.companyTypePreset || "").trim();
    if (p === "Autre") return String(form.companyTypeFree || "").trim() || "Autre";
    return p;
  }

  // On “mappe” les champs détaillés vers les champs attendus par ton backend (sans casser).
  function buildPayloadForGenerate() {
    const companyType = getCompanyTypeValue();

    // Produit / service => mélange simple & clair
    const productBlock =
      `${buildMultiline("Mission", form.mission)}` +
      `${buildMultiline("Problème que tu résous", form.problem)}` +
      `${buildMultiline("Solution", form.solution)}` +
      `${buildMultiline("Produit/Service (description)", form.product)}\n` +
      `${buildMultiline("Prix / tarification", form.pricing)}` +
      `${buildMultiline("Canaux de vente", form.channels)}` +
      `${buildMultiline("Opérations (production, livraison, etc.)", form.operations)}` +
      `${buildMultiline("Équipe", form.team)}`;

    const customersBlock =
      `${buildMultiline("Clients principaux", form.customers)}` +
      `${buildMultiline("Marché / zone", form.market)}`;

    const businessModelBlock =
      `${buildMultiline("Modèle économique", form.pricing ? "Revenus via tarification ci-dessus + ventes." : "")}` +
      `${buildMultiline("Canaux", form.channels)}` +
      `${buildMultiline("Partenariats stratégiques", form.strategicPartnerships)}` +
      `${buildMultiline("Opérations", form.operations)}`;

    const tractionBlock =
      `${buildMultiline("Traction / preuves", form.traction)}` +
      `${buildMultiline("Équipe", form.team)}`;

    const competitionBlock =
      `${buildMultiline("Concurrents", form.competition)}` +
      `${buildMultiline("Différenciation / avantage", form.differentiation)}`;

    const risksBlock = `${form.risks || ""}`.trim();

    return {
      lang: form.lang,
      docType: form.docType,
      audience: form.audience,
      companyName: form.companyName,
      country: form.country,
      city: form.city,
      sector: form.sector,
      stage: STAGES.find((s) => s.value === form.stage)?.label || form.stage,

      // On injecte “type d’entreprise” dans finAssumptions (ou traction) de manière non cassante
      product: clampText(productBlock, 6500),
      customers: clampText(customersBlock, 4500),
      businessModel: clampText(businessModelBlock, 4500),
      traction: clampText(
        `${buildMultiline("Type d’entreprise", companyType)}${tractionBlock}`.trim(),
        4500
      ),
      competition: clampText(competitionBlock, 4500),
      risks: clampText(risksBlock, 4500),
      finAssumptions: clampText(form.finAssumptions, 4500),
      fundingAsk: clampText(form.fundingAsk, 4500),

      output: form.output,
      lite: form.lite,
    };
  }

  async function downloadBlob(blob, suggestedName) {
    // Immediate download (keeps previous behavior)
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // NOTE: caller may keep a persistent URL for re-download; this one is for immediate use only.
    window.URL.revokeObjectURL(url);
  }

  function setPersistentDownload(kind, blob, suggestedName) {
    const url = window.URL.createObjectURL(blob);

    if (kind === "rewrite") {
      if (lastRewriteUrlRef.current) URL.revokeObjectURL(lastRewriteUrlRef.current);
      lastRewriteUrlRef.current = url;
      setLastRewriteFile({ url, name: suggestedName });
    } else {
      if (lastGenerateUrlRef.current) URL.revokeObjectURL(lastGenerateUrlRef.current);
      lastGenerateUrlRef.current = url;
      setLastGenerateFile({ url, name: suggestedName });
    }

    // keep current auto-download behavior
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadResultFiles({ resultUrl, formats, baseName, kind, signal }) {
    let lastFileName = "";
    const selectedFormats = formats?.length ? formats : getOutputFormats("pdf");

    for (let index = 0; index < selectedFormats.length; index += 1) {
      const item = selectedFormats[index];
      const fileName = `${baseName}.${item.ext}`;
      const response = await fetch(withResultFormat(resultUrl, item.format), { signal });

      if (!response.ok) {
        let details = "";
        try {
          const json = await response.json();
          details = json?.details || json?.error || JSON.stringify(json);
        } catch {
          details = await response.text();
        }
        throw new Error(details || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      lastFileName = fileName;
      if (index === selectedFormats.length - 1) setPersistentDownload(kind, blob, fileName);
      else await downloadBlob(blob, fileName);
    }

    return lastFileName;
  }


  async function onSubmitGenerate(e) {
    e.preventDefault();
    setError("");
    setSuccessHint("");

    if (!String(form.companyName).trim()) return setError("Le nom de l’entreprise est requis.");
    if (!String(form.sector).trim()) return setError("Le secteur est requis.");
    if (!String(form.solution).trim() && !String(form.product).trim())
      return setError("Décris au moins la solution OU le produit/service.");
    if (paymentRequired && !paymentOrderNumber) {
      return setError("Valide d'abord le paiement Mobile Money avant de lancer la génération.");
    }

    setLoading(true);
    startFakeProgress("generate", form.lite);

    const controller = new AbortController();
    abortRef.current = controller;

    // ✅ Mode JOB (anti-timeout / anti-veille). On garde un timeout large côté client.
    const timeoutId = setTimeout(() => controller.abort(), 1800000); // 30 min

    try {
      const payload = buildPayloadForGenerate();

      // 1) Start JOB
      const startRes = await fetch(`${endpointGenerate}?async=1`, {
        method: "POST",
        headers: generationHeaders({
          "Content-Type": "application/json",
          ...(paymentOrderNumber ? { "X-Payment-Order": paymentOrderNumber } : {}),
        }),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!startRes.ok) {
        let details = "";
        try {
          const j = await startRes.json();
          details = j?.details || j?.error || JSON.stringify(j);
        } catch {
          details = await startRes.text();
        }
        throw new Error(details || `HTTP ${startRes.status}`);
      }

      const started = await startRes.json();
      const jobId = started?.jobId;
      if (!jobId) throw new Error("JOB_ID manquant (backend ?async=1 non actif)." );

      setStatusText("Génération en cours… (mode job)");

      const statusUrl = `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium/jobs/${jobId}`;
      const resultUrl = `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium/jobs/${jobId}/result`;
      const outputFormats = getOutputFormats(form.output);
      const primaryFormat = outputFormats[0];
      const baseFileName = `${safeFilename(form.companyName)}_BusinessPlan_Premium_${prettyDate()}`;
      const fname = `${baseFileName}.${primaryFormat.ext}`;
      const historyResultUrl = withResultFormat(resultUrl, primaryFormat.format);
      upsertGeneratedDocument({
        documentType: "businessplan",
        title: form.companyName || "Business Plan",
        fileName: fname,
        jobId,
        statusUrl,
        resultUrl: historyResultUrl,
        apiBase: API_BASE,
        paymentOrderNumber,
        regeneration: {
          method: "POST",
          url: `${endpointGenerate}?async=1`,
          body: payload,
          statusUrlTemplate: `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium/jobs/{jobId}`,
          resultUrlTemplate: withResultFormat(
            `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium/jobs/{jobId}/result`,
            primaryFormat.format
          ),
        },
      });
      if (paymentOrderNumber) {
        clearStoredPayment("businessplan");
        setPaymentOrderNumber("");
        setPaymentResetSignal((value) => value + 1);
      }

      // 2) Poll status (léger, 4s)
      while (true) {
        const stRes = await fetch(statusUrl, { signal: controller.signal });
        if (!stRes.ok) {
          const t = await stRes.text();
          throw new Error(t || `HTTP ${stRes.status}`);
        }
        const st = await stRes.json();
        updateGeneratedDocument(jobId, { status: st.status, error: st.error || null, doneAt: st.doneAt || null });
        if (st.status === "error") throw new Error(st.error || "Erreur job inconnue.");
        if (st.status === "done") break;
        await new Promise((r) => setTimeout(r, 4000));
      }

      const downloadedName = await downloadResultFiles({
        resultUrl,
        formats: outputFormats,
        baseName: baseFileName,
        kind: "generate",
        signal: controller.signal,
      });
      updateGeneratedDocument(jobId, {
        status: "done",
        fileName: fname,
        resultUrl: historyResultUrl,
        downloadedAt: new Date().toISOString(),
      });

      stopFakeProgress("Téléchargement prêt ✅");
      setSuccessHint(`Ton business plan a été généré en ${outputLabel(form.output)}. Dernier fichier : ${downloadedName}.`);
    } catch (err) {
      const msg =
        err?.name === "AbortError"
          ? "Opération interrompue (timeout local). Réessaie."
          : String(err?.message || err);
      setError(msg);
      setStatusText("Erreur.");
      setProgress(0);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      abortRef.current = null;
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  async function onSubmitRewrite(e) {
    e.preventDefault();
    setError("");
    setSuccessHint("");

    if (!draftFile && !String(form.rewriteTextFallback || "").trim()) {
      setError("Importe un fichier (PDF/DOCX) OU colle le texte de ton brouillon.");
      return;
    }

    // mini infos utiles
    if (!String(form.companyName).trim()) {
      setError("Indique au moins le nom de l’entreprise (même si tu as un brouillon).");
      return;
    }
    if (paymentRequired && !paymentOrderNumber) {
      setError("Valide d'abord le paiement Mobile Money avant de lancer la correction.");
      return;
    }

    setLoading(true);
    startFakeProgress("rewrite");

    const controller = new AbortController();
    abortRef.current = controller;

    // Timeout 15 min
    const timeoutId = setTimeout(() => controller.abort(), 900000);

    try {
      const fd = new FormData();
      fd.append("lang", form.lang);
      fd.append("audience", form.audience);
      fd.append("docType", form.docType);
      fd.append("companyName", form.companyName);
      fd.append("country", form.country);
      fd.append("city", form.city);
      fd.append("sector", form.sector || "");
      fd.append("stage", STAGES.find((s) => s.value === form.stage)?.label || form.stage);
      fd.append("notes", form.rewriteNotes || "");
      fd.append("output", form.output || "pdf");

      if (draftFile) fd.append("file", draftFile);
      if (!draftFile) fd.append("text", form.rewriteTextFallback || "");

      const startRes = await fetch(`${endpointRewrite}?async=1`, {
        method: "POST",
        headers: generationHeaders(paymentOrderNumber ? { "X-Payment-Order": paymentOrderNumber } : {}),
        body: fd,
        signal: controller.signal,
      });

      if (!startRes.ok) {
        let details = "";
        try {
          const j = await startRes.json();
          details = j?.details || j?.error || JSON.stringify(j);
        } catch {
          details = await startRes.text();
        }

        throw new Error(details || `HTTP ${startRes.status}`);
      }

      const started = await startRes.json();
      const jobId = started?.jobId;
      if (!jobId) throw new Error("JOB_ID manquant pour la correction.");

      const outputFormats = getOutputFormats(form.output);
      const primaryFormat = outputFormats[0];
      const baseFileName = `${safeFilename(form.companyName)}_BusinessPlan_CORRIGE_${prettyDate()}`;
      const fname = `${baseFileName}.${primaryFormat.ext}`;
      const statusUrl = `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium/jobs/${jobId}`;
      const resultUrl = `${API_BASE.replace(/\/$/, "")}/generate-business-plan/premium/jobs/${jobId}/result`;
      const historyResultUrl = withResultFormat(resultUrl, primaryFormat.format);
      upsertGeneratedDocument({
        documentType: "businessplan_rewrite",
        title: `${form.companyName || "Business Plan"} - correction`,
        fileName: fname,
        jobId,
        statusUrl,
        resultUrl: historyResultUrl,
        apiBase: API_BASE,
        paymentOrderNumber,
      });
      if (paymentOrderNumber) {
        clearStoredPayment("businessplan");
        setPaymentOrderNumber("");
        setPaymentResetSignal((value) => value + 1);
      }

      setStatusText("Correction en cours... (mode job)");
      while (true) {
        const stRes = await fetch(statusUrl, { signal: controller.signal });
        if (!stRes.ok) {
          const t = await stRes.text();
          throw new Error(t || `HTTP ${stRes.status}`);
        }
        const st = await stRes.json();
        updateGeneratedDocument(jobId, { status: st.status, error: st.error || null, doneAt: st.doneAt || null });
        if (st.status === "error") throw new Error(st.error || "Erreur job inconnue.");
        if (st.status === "done") break;
        await new Promise((r) => setTimeout(r, 4000));
      }

      const downloadedName = await downloadResultFiles({
        resultUrl,
        formats: outputFormats,
        baseName: baseFileName,
        kind: "rewrite",
        signal: controller.signal,
      });
      updateGeneratedDocument(jobId, {
        status: "done",
        fileName: fname,
        resultUrl: historyResultUrl,
        downloadedAt: new Date().toISOString(),
      });

      stopFakeProgress("Téléchargement prêt ✅");
      setSuccessHint(`Ton brouillon a été corrigé en ${outputLabel(form.output)}. Dernier fichier : ${downloadedName}.`);
    } catch (err) {
      const msg =
        err?.name === "AbortError"
          ? "La correction a dépassé le délai (15 min). Réessaie ou colle uniquement le résumé (mode Lite)."
          : String(err?.message || err);
      setError(msg);
      setStatusText("Erreur.");
      setProgress(0);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      abortRef.current = null;
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function fillExample() {
    setForm((prev) => ({
      ...prev,
      companyName: prev.companyName || "KINSHASA MODERN FITNESS",
      country: prev.country || "RDC",
      city: prev.city || "Kinshasa",
      sector: prev.sector || "Fitness & bien-être",
      mission: prev.mission || "Rendre le sport accessible et moderne à Kinshasa.",
      problem: prev.problem || "Manque de salles équipées, coaching fiable, hygiène et suivi.",
      solution:
        prev.solution ||
        "Salle de gym moderne avec coaching, abonnements flexibles, programmes santé, suivi digital.",
      product:
        prev.product ||
        "Salle équipée (musculation/cardio), coaching personnalisé, cours collectifs, nutrition, douches, boutique.",
      customers:
        prev.customers ||
        "Jeunes actifs, cadres, étudiants, femmes (programmes bien-être), entreprises (abonnements B2B).",
      market:
        prev.market ||
        "Kinshasa (Gombe, Ngaliema, Limete…), extension possible vers Matete/Kasa-Vubu selon traction.",
      competition:
        prev.competition ||
        "Salles existantes (souvent peu équipées) + coachings informels. Différenciation : qualité, sécurité, suivi.",
      differentiation:
        prev.differentiation ||
        "Hygiène, équipements modernes, coachs certifiés, suivi, application/WhatsApp de coaching, offres B2B.",
strategicPartnerships:
  prev.strategicPartnerships ||
  "Partenaires : fournisseurs d’équipements, nutritionnistes, entreprises (abonnements), influenceurs fitness, assurances santé, banques/IMF (financement).",
      pricing:
        prev.pricing ||
        "Abonnements mensuels + packs 3/6/12 mois, séances coaching premium, cours collectifs inclus ou add-on.",
      channels:
        prev.channels ||
        "Réseaux sociaux, partenariats entreprises, influenceurs fitness, affichage local, parrainage clients.",
      operations:
        prev.operations ||
        "Local sécurisé, équipements importés, maintenance mensuelle, staff (coach, accueil, ménage), horaires étendus.",
      team:
        prev.team ||
        "Fondateur + manager, 2 coachs, 1 accueil, 1 ménage, partenariats nutritionnistes.",
      traction:
        prev.traction ||
        "Pré-inscriptions via WhatsApp, partenariats entreprises en négociation, test gratuit 7 jours.",
      risks:
        prev.risks ||
        "Coûts d’équipements, instabilité énergie, sécurité. Mitigation : groupe électrogène/solaire, gardiennage, contrats maintenance.",
      finAssumptions:
        prev.finAssumptions ||
        "Hypothèses : croissance abonnés progressive, panier moyen stable, coûts fixes maîtrisés, marge améliorée via coaching premium.",
      fundingAsk:
        prev.fundingAsk ||
        "Financement pour équipements, aménagement, marketing lancement, fonds de roulement (3–6 mois).",
    }));
  }

  function resetForm() {
    if (!confirm("Réinitialiser le formulaire ?")) return;
    localStorage.removeItem("bp_premium_form_v3");
    window.location.reload();
  }

  const audienceHint = AUDIENCES.find((a) => a.value === form.audience)?.hint;
  const guideFields = [
    { label: "nom de l'entreprise", value: form.companyName },
    { label: "secteur", value: form.sector },
    { label: "solution ou produit", value: form.solution || form.product },
    { label: "clients", value: form.customers },
    { label: "prix / revenus", value: form.pricing },
    { label: "besoin de financement", value: form.fundingAsk },
  ];
  const completedGuideFields = guideFields.filter((field) => String(field.value || "").trim()).length;
  const formCompletion = Math.round((completedGuideFields / guideFields.length) * 100);
  const nextGuideField = guideFields.find((field) => !String(field.value || "").trim())?.label;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Rédaction Business Plan (Professionnel)
            </h1>
            <p className="text-slate-300 mt-2">
              Remplis simplement — le système génère un document premium (niveau banque / investisseur).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={fillExample}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-200 hover:bg-slate-900"
              disabled={loading}
              title="Pré-remplir avec un exemple"
            >
              Remplir un exemple
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-200 hover:bg-slate-900"
              disabled={loading}
              title="Réinitialiser"
            >
              Réinitialiser
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="text-sm font-semibold text-emerald-100">Langue du document</div>
            <p className="mt-1 text-xs text-emerald-100/80">
              Français par défaut. Choisissez English pour générer le business plan en anglais.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { value: "fr", label: "Français" },
                { value: "en", label: "English" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateField("lang", option.value)}
                  disabled={loading}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    form.lang === option.value
                      ? "border-emerald-400 bg-emerald-400 text-slate-950"
                      : "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
            <div className="text-sm font-semibold text-sky-100">Niveau de détail</div>
            <p className="mt-1 text-xs text-sky-100/80">
              Lite génère plus vite un dossier court : résumé, canvas, SWOT, finances et demande de financement.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateField("lite", false)}
                disabled={loading}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  !form.lite
                    ? "border-sky-300 bg-sky-300 text-slate-950"
                    : "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900"
                }`}
              >
                Complet
              </button>
              <button
                type="button"
                onClick={() => updateField("lite", true)}
                disabled={loading}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  form.lite
                    ? "border-sky-300 bg-sky-300 text-slate-950"
                    : "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900"
                }`}
              >
                Lite rapide
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="text-sm font-semibold text-amber-100">Format du fichier</div>
            <p className="mt-1 text-xs text-amber-100/80">
              Téléchargez le business plan en PDF, en Word, ou dans les deux formats.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { value: "pdf", label: "PDF" },
                { value: "doc", label: "Word" },
                { value: "both", label: "PDF + Word" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateField("output", option.value)}
                  disabled={loading}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                    form.output === option.value
                      ? "border-amber-300 bg-amber-300 text-slate-950"
                      : "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode switch */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode("generate")}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === "generate"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-slate-800 bg-slate-900/40 hover:bg-slate-900/60"
            }`}
            disabled={loading}
          >
            <div className="font-semibold">1) Générer un Business Plan complet</div>
            <div className="text-sm text-slate-300 mt-1">
              Recommandé si tu n’as pas encore de document.
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("rewrite")}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === "rewrite"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-slate-800 bg-slate-900/40 hover:bg-slate-900/60"
            }`}
            disabled={loading}
          >
            <div className="font-semibold">2) Corriger un brouillon existant</div>
            <div className="text-sm text-slate-300 mt-1">
              Importer ton fichier (PDF/DOCX) et obtenir une version premium.
            </div>
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <div className="font-semibold">Erreur</div>
            <div className="mt-1 text-sm whitespace-pre-wrap">{error}</div>
          </div>
        ) : null}

        {successHint ? (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
            <div className="font-semibold">Succès</div>
            <div className="mt-1 text-sm whitespace-pre-wrap">{successHint}</div>
          </div>
        ) : null}

        {/* MODE 1: GENERATE */}
        {mode === "generate" ? (
          <>
            <form onSubmit={onSubmitGenerate} className="mt-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:p-6 shadow-xl">
                <SectionTitle
                  title="A) Informations simples"
                  subtitle="Commence ici. Même si tu ne sais pas tout, remplis le maximum."
                />

                <FormProgress completion={formCompletion} nextLabel={nextGuideField} />

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Nom de l’entreprise *"
                    value={form.companyName}
                    onChange={(v) => updateField("companyName", v)}
                    disabled={loading}
                    placeholder="Ex: GOMA LUXURY GEMS"
                  />

                <Field
                  label="Secteur (activité) *"
                  value={form.sector}
                  onChange={(v) => updateField("sector", v)}
                  disabled={loading}
                  placeholder="Ex: Joaillerie & objets de luxe"
                />

                <Field
                  label="Pays"
                  value={form.country}
                  onChange={(v) => updateField("country", v)}
                  disabled={loading}
                  placeholder="RDC"
                />

                <Field
                  label="Ville(s) d’activité"
                  value={form.city}
                  onChange={(v) => updateField("city", v)}
                  disabled={loading}
                  placeholder="Ex: Kinshasa, Matadi, Goma..."
                />

                <div>
                  <label className="text-sm text-slate-300">Stade de l’entreprise</label>
                  <select
                    className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
                    value={form.stage}
                    onChange={(e) => updateField("stage", e.target.value)}
                    disabled={loading}
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    {STAGES.find((s) => s.value === form.stage)?.hint || ""}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-slate-300">Type d’entreprise (optionnel)</label>
                  <div className="mt-1 flex flex-col gap-2">
                    <div className="flex gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="radio"
                          name="companyTypeMode"
                          checked={form.companyTypeMode === "preset"}
                          onChange={() => updateField("companyTypeMode", "preset")}
                          disabled={loading}
                        />
                        Choisir dans la liste
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="radio"
                          name="companyTypeMode"
                          checked={form.companyTypeMode === "free"}
                          onChange={() => updateField("companyTypeMode", "free")}
                          disabled={loading}
                        />
                        Saisir moi-même
                      </label>
                    </div>

                    {form.companyTypeMode === "preset" ? (
                      <select
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
                        value={form.companyTypePreset}
                        onChange={(e) => updateField("companyTypePreset", e.target.value)}
                        disabled={loading}
                      >
                        {COMPANY_TYPE_PRESETS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-600"
                        value={form.companyTypeFree}
                        onChange={(e) => updateField("companyTypeFree", e.target.value)}
                        disabled={loading}
                        placeholder="Ex: SARL (en création) / Auto-entrepreneur / Coop..."
                      />
                    )}

                    {form.companyTypeMode === "preset" && form.companyTypePreset === "Autre" ? (
                      <input
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-600"
                        value={form.companyTypeFree}
                        onChange={(e) => updateField("companyTypeFree", e.target.value)}
                        disabled={loading}
                        placeholder="Précise ici (ex: SARL en cours d’immatriculation)"
                      />
                    ) : null}
                  </div>
                </div>

                <Select
                  label="Audience (pour qui ?)"
                  value={form.audience}
                  onChange={(v) => updateField("audience", v)}
                  disabled={loading}
                  options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))}
                  hint={audienceHint}
                />

                <Select
                  label="Type de dossier"
                  value={form.docType}
                  onChange={(v) => updateField("docType", v)}
                  disabled={loading}
                  options={DOCTYPES}
                />
              </div>

              <div className="mt-8">
                <SectionTitle
                  title="B) Ton projet expliqué simplement"
                  subtitle="Ces champs sont formulés pour être faciles à comprendre."
                />
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <Area
                    label="Mission (en 1 phrase)"
                    value={form.mission}
                    onChange={(v) => updateField("mission", v)}
                    disabled={loading}
                    placeholder="Ex: Offrir des bijoux artisanaux haut de gamme à base de pierres du Kivu."
                  />
                  <Area
                    label="Problème que tu veux résoudre"
                    value={form.problem}
                    onChange={(v) => updateField("problem", v)}
                    disabled={loading}
                    placeholder="Ex: Les produits de luxe locaux manquent de standard qualité/export."
                  />
                  <Area
                    label="Solution (ce que tu apportes)"
                    value={form.solution}
                    onChange={(v) => updateField("solution", v)}
                    disabled={loading}
                    placeholder="Ex: Production locale + design moderne + traçabilité + finitions premium."
                  />
                  <Area
                    label="Produit / service (détails) *"
                    value={form.product}
                    onChange={(v) => updateField("product", v)}
                    disabled={loading}
                    placeholder="Décris ce que tu vends, comment c’est fabriqué, et ce qui le rend unique."
                  />
                </div>
              </div>

              <div className="mt-8">
                <SectionTitle title="C) Clients, marché, concurrence" subtitle="Même approximatif, c’est utile." />
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <Area
                    label="Clients (qui achète ?)"
                    value={form.customers}
                    onChange={(v) => updateField("customers", v)}
                    disabled={loading}
                    placeholder="Ex: cadres, diaspora, hôtels, boutiques premium, exportateurs…"
                  />
                  <Area
                    label="Marché / zone"
                    value={form.market}
                    onChange={(v) => updateField("market", v)}
                    disabled={loading}
                    placeholder="Ex: Goma puis Kinshasa, puis export via partenaires."
                  />
                  <Area
                    label="Concurrents"
                    value={form.competition}
                    onChange={(v) => updateField("competition", v)}
                    disabled={loading}
                    placeholder="Qui fait déjà quelque chose de similaire ?"
                  />
                  <Area
                    label="Ton avantage / différenciation"
                    value={form.differentiation}
                    onChange={(v) => updateField("differentiation", v)}
                    disabled={loading}
                    placeholder="Pourquoi toi plutôt qu’un autre ? (qualité, prix, vitesse, réseau, traçabilité, etc.)"
                  />
                </div>
              </div>

              <div className="mt-8">
                <SectionTitle
                  title="D) Comment tu vas gagner de l’argent"
                  subtitle="Le système a besoin de comprendre tes prix, ventes et canaux."
                />
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <Area
                    label="Prix / tarification"
                    value={form.pricing}
                    onChange={(v) => updateField("pricing", v)}
                    disabled={loading}
                    placeholder="Ex: ventes à l’unité + commandes B2B + commissions export."
                  />
                  <Area
                    label="Canaux de vente"
                    value={form.channels}
                    onChange={(v) => updateField("channels", v)}
                    disabled={loading}
                    placeholder="Ex: boutique, partenaires, réseaux sociaux, entreprises, export, etc."
                  />
<Area
  label="Partenariats stratégiques (optionnel)"
  value={form.strategicPartnerships}
  onChange={(v) => updateField("strategicPartnerships", v)}
  disabled={loading}
  placeholder="Ex: fournisseurs clés, distributeurs, supermarchés, institutions, banques/IMF, incubateurs, partenaires techniques…"
/>

                  <Area
                    label="Opérations (production, livraison, équipe…)"
                    value={form.operations}
                    onChange={(v) => updateField("operations", v)}
                    disabled={loading}
                    placeholder="Ex: atelier, fournisseurs, machines, logistique, qualité, sécurité, énergie…"
                  />
                  <Area
                    label="Équipe (qui fait quoi ?)"
                    value={form.team}
                    onChange={(v) => updateField("team", v)}
                    disabled={loading}
                    placeholder="Ex: fondateur + manager atelier + artisan + commercial + comptable…"
                  />
                  <Area
                    label="Traction (preuves / avancées)"
                    value={form.traction}
                    onChange={(v) => updateField("traction", v)}
                    disabled={loading}
                    placeholder="Ex: ventes actuelles, clients pilotes, partenariats, précommandes…"
                  />
                </div>
              </div>

              <div className="mt-8">
                <SectionTitle title="E) Risques & finances" subtitle="Tu peux rester simple, le système complète." />
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <Area
                    label="Risques (et comment tu les réduis)"
                    value={form.risks}
                    onChange={(v) => updateField("risks", v)}
                    disabled={loading}
                    placeholder="Ex: énergie, taux de change, sécurité, import, concurrence… + solutions."
                  />
                  <Area
                    label="Hypothèses financières"
                    value={form.finAssumptions}
                    onChange={(v) => updateField("finAssumptions", v)}
                    disabled={loading}
                    placeholder="Volumes, prix, marge, coûts, croissance… (même estimé)."
                  />
                  <Area
                    label="Besoin de financement"
                    value={form.fundingAsk}
                    onChange={(v) => updateField("fundingAsk", v)}
                    disabled={loading}
                    placeholder="Montant, utilisation des fonds, calendrier, garanties (si banque)."
                  />
                </div>
              </div>

              <details className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <summary className="cursor-pointer text-slate-200 font-semibold">
                  Conseils pour bien remplir (clique)
                </summary>
                <div className="mt-3 text-sm text-slate-300 space-y-2">
                  <p>• Ne cherche pas la perfection : écris simple, le système professionnalise.</p>
                  <p>• Si tu ne sais pas un chiffre, donne une estimation + explique ton raisonnement.</p>
                  <p>• Pour une banque, insiste sur : cashflow, garanties, risques, capacité de remboursement.</p>
                  <p>• Si ça timeout : active Mode Lite et raccourcis les textes.</p>
                </div>
              </details>

              <MobileMoneyPayment
                apiBase={API_BASE}
                documentType="businessplan"
                variant="dark"
                disabled={loading}
                resetSignal={paymentResetSignal}
                openSignal={paymentOpenSignal}
                className="hidden"
                onRequirementChange={setPaymentRequired}
                onPaymentReady={setPaymentOrderNumber}
              />

              <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="space-y-1 text-xs text-slate-400">
                  <div>
                    Prix : <b className="text-emerald-300">3 USD</b>.
                  </div>
                  <div>
                    Génération moyenne : environ <b className="text-slate-200">15 minutes</b> pour obtenir un document professionnel et bancable.
                  </div>
                  <div>
                    Sortie actuelle : <b>{outputLabel(form.output)}</b>.
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <button
                    type={paymentRequired && !paymentOrderNumber ? "button" : "submit"}
                    onClick={paymentRequired && !paymentOrderNumber ? () => setPaymentOpenSignal((value) => value + 1) : undefined}
                    disabled={loading}
                    className="rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {loading ? "Génération…" : paymentRequired && !paymentOrderNumber ? "Payer puis générer le document" : "Générer & Télécharger"}
                  </button>

                  {loading ? (
                    <div className="mt-3 w-[260px] max-w-full">
                      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-[width] duration-200"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-slate-300">
                        {statusText ? `${statusText} ` : ""}{progress ? `${progress}%` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={onCancel}
                        className="mt-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900"
                      >
                        Annuler sur cet écran
                      </button>
                    </div>
                  ) : null}

                  {/* Re-download last generated file (no regeneration) */}
                  {lastGenerateFile?.url && !loading ? (
                    <button
                      type="button"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = lastGenerateFile.url;
                        a.download = lastGenerateFile.name || "business-plan-premium.pdf";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      }}
                      className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
                    >
                      Télécharger
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            </form>

            <BusinessPlanPackOffer compact variant="dark" className="mt-6" />
          </>
        ) : null}

        {/* MODE 2: REWRITE */}
        {mode === "rewrite" ? (
          <form onSubmit={onSubmitRewrite} className="mt-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:p-6 shadow-xl">
              <SectionTitle
                title="Corriger un brouillon existant"
                subtitle="Importe ton PDF/DOCX. Le système corrige, complète et te renvoie une version premium."
              />

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Nom de l’entreprise *"
                  value={form.companyName}
                  onChange={(v) => updateField("companyName", v)}
                  disabled={loading}
                  placeholder="Ex: KINSHASA MODERN SHOES"
                />
                <Field
                  label="Secteur (optionnel mais utile)"
                  value={form.sector}
                  onChange={(v) => updateField("sector", v)}
                  disabled={loading}
                  placeholder="Ex: Cordonnerie moderne"
                />
                <Field
                  label="Ville(s)"
                  value={form.city}
                  onChange={(v) => updateField("city", v)}
                  disabled={loading}
                  placeholder="Kinshasa"
                />
                <div>
                  <label className="text-sm text-slate-300">Stade</label>
                  <select
                    className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
                    value={form.stage}
                    onChange={(e) => updateField("stage", e.target.value)}
                    disabled={loading}
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    {STAGES.find((s) => s.value === form.stage)?.hint || ""}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="font-semibold text-slate-200">1) Importer un fichier</div>
                <p className="mt-1 text-sm text-slate-400">
                  Formats acceptés : PDF ou DOCX. (Si l’endpoint backend n’est pas activé, tu verras un message clair.)
                </p>

                <div className="mt-3 flex flex-col gap-2">
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setDraftFile(e.target.files?.[0] || null)}
                    disabled={loading}
                    className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-slate-100 hover:file:bg-slate-700"
                  />
                  {draftFile ? (
                    <div className="text-xs text-slate-300">
                      Fichier sélectionné : <span className="font-mono">{draftFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      Aucun fichier sélectionné.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="font-semibold text-slate-200">2) Ou coller le texte du brouillon</div>
                <p className="mt-1 text-sm text-slate-400">
                  Si tu n’arrives pas à uploader, copie/colle le contenu ici (même partiel).
                </p>
                <textarea
                  className="mt-2 min-h-[160px] w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-600"
                  value={form.rewriteTextFallback}
                  onChange={(e) => updateField("rewriteTextFallback", e.target.value)}
                  disabled={loading}
                  placeholder="Colle ici le texte de ton business plan (même incomplet)."
                />
                <div className="mt-1 text-xs text-slate-500">
                  {String(form.rewriteTextFallback || "").length} caractères
                </div>
              </div>

              <div className="mt-4">
                <Area
                  label="Notes (ce que tu veux améliorer)"
                  value={form.rewriteNotes}
                  onChange={(v) => updateField("rewriteNotes", v)}
                  disabled={loading}
                  placeholder="Ex: adapter pour banque, corriger finances, ajouter SWOT, rendre plus professionnel, etc."
                />
              </div>

              <MobileMoneyPayment
                apiBase={API_BASE}
                documentType="businessplan"
                variant="dark"
                disabled={loading}
                resetSignal={paymentResetSignal}
                openSignal={paymentOpenSignal}
                className="hidden"
                onRequirementChange={setPaymentRequired}
                onPaymentReady={setPaymentOrderNumber}
              />

              <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="space-y-1 text-xs text-slate-400">
                  <div>
                    Prix : <b className="text-emerald-300">3 USD</b>.
                  </div>
                  <div>
                    Correction moyenne : environ <b className="text-slate-200">15 minutes</b> pour obtenir un document professionnel et bancable.
                  </div>
                  <div>
                    Sortie : <b>{outputLabel(form.output)}</b>.
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <button
                    type={paymentRequired && !paymentOrderNumber ? "button" : "submit"}
                    onClick={paymentRequired && !paymentOrderNumber ? () => setPaymentOpenSignal((value) => value + 1) : undefined}
                    disabled={loading}
                    className="rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {loading ? "Correction…" : paymentRequired && !paymentOrderNumber ? "Payer puis corriger le document" : "Corriger & Télécharger"}
                  </button>

                  {loading ? (
                    <div className="mt-3 w-[260px] max-w-full">
                      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-[width] duration-200"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-slate-300">
                        {statusText ? `${statusText} ` : ""}{progress ? `${progress}%` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={onCancel}
                        className="mt-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900"
                      >
                        Annuler sur cet écran
                      </button>
                    </div>
                  ) : null}

                  {/* Re-download last corrected file (no regeneration) */}
                  {lastRewriteFile?.url && !loading ? (
                    <button
                      type="button"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = lastRewriteFile.url;
                        a.download = lastRewriteFile.name || "business-plan-corrige.pdf";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      }}
                      className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
                    >
                      Télécharger
                    </button>
                  ) : null}
                </div>
              </div>

              <details className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <summary className="cursor-pointer text-slate-200 font-semibold">
                  Important (clique) — comment ça marche
                </summary>
                <div className="mt-3 text-sm text-slate-300 space-y-2">
                  <p>• Le système réécrit ton document en format premium (banque/investisseur/incubateur).</p>
                  <p>• Il corrige la structure, comble les sections manquantes, et harmonise le style.</p>
                  <p>• Si le backend /premium/rewrite n’est pas encore installé : je te donne le handler Express + extraction PDF/DOCX prêt à coller.</p>
                </div>
              </details>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

/* -----------------------
   UI helpers
----------------------- */

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <div className="text-lg font-semibold text-slate-100">{title}</div>
      {subtitle ? <div className="text-sm text-slate-400 mt-1">{subtitle}</div> : null}
    </div>
  );
}

function FormProgress({ completion, nextLabel }) {
  const value = Math.max(0, Math.min(100, Number(completion) || 0));
  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Saisie progressive</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Remplis d'abord les champs essentiels. Le reste améliore la qualité, mais tu peux avancer étape par étape.
          </p>
        </div>
        <div className="text-sm font-bold text-emerald-300">{value}% prêt</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${value}%` }} />
      </div>
      {nextLabel ? (
        <p className="mt-2 text-xs text-slate-400">
          Prochaine information utile : <span className="font-semibold text-slate-200">{nextLabel}</span>.
        </p>
      ) : (
        <p className="mt-2 text-xs font-semibold text-emerald-300">Les informations clés sont remplies.</p>
      )}
    </div>
  );
}

function Select({ label, value, onChange, disabled, options, hint }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      <select
        className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Field({ label, value, onChange, disabled, placeholder }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      <input
        className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-600"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}

function Area({ label, value, onChange, disabled, placeholder }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      <textarea
        className="mt-1 min-h-[110px] w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-600"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}
