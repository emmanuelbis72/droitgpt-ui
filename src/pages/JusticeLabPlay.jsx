import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createNewRun,
  scoreRun,
  mergeAudienceWithTemplates,
  setAudienceScene as setAudienceSceneOnRun,
  applyAudienceDecision,
  initTrialV1,
  TRIAL_V1_STAGES,
  getCurrentTrialStage,
  setCurrentTrialStage,
  attachStageAudienceScene,
  appendStagePV,
  initProceduralCalendar,
  addCalendarEvent,
  markCalendarEventDone,
  applyAutoIncidents,
  buildJudgmentDraft,
  buildAppealDraft,
} from "../justiceLab/engine.js";

import {
  addRun,
  updateGlobalStats,
  readRuns,
  upsertAndSetActive,
  patchActiveRun,
  ensureActiveRunValid,
  setActiveRunId,
} from "../justiceLab/storage.js";

const API_BASE = (
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_URL ||
  "https://droitgpt-indexer.onrender.com"
).replace(/\/$/, "");

const PROCEDURE_CHOICES = [
  { id: "A", title: "Mesures conservatoires / garanties + audience rapide", hint: "Équilibrée" },
  { id: "B", title: "Renvoi / instruction complémentaire (dossier incomplet)", hint: "Prudent si pièces insuffisantes" },
  { id: "C", title: "Décision immédiate sur base des éléments disponibles", hint: "Risque si garanties faibles" },
];

const ROLES = [
  { id: "Juge", label: "👨🏽‍⚖️ Juge", desc: "Tranche les objections, dirige l’audience, décide." },
  { id: "Procureur", label: "🟥 Procureur", desc: "Soutient l’accusation / l’ordre public, propose réquisitions." },
  { id: "Avocat", label: "🟦 Avocat", desc: "Défense / intérêts privés, exceptions & nullités." },
];

// ✅ cache local dossiers dynamiques (v2 + fallback v1)
const CASE_CACHE_KEY_V2 = "justicelab_caseCache_v2";
const CASE_CACHE_KEY_V1 = "justicelab_caseCache_v1";

function lsAvailable() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__t";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function loadCaseCacheByKey(key) {
  if (!lsAvailable()) return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function loadCaseCache() {
  // merge v2 + v1 (v2 prioritaire)
  const v2 = loadCaseCacheByKey(CASE_CACHE_KEY_V2);
  const v1 = loadCaseCacheByKey(CASE_CACHE_KEY_V1);
  return { ...(v1 || {}), ...(v2 || {}) };
}

function saveCaseToCache(caseData) {
  if (!lsAvailable()) return;
  try {
    if (!caseData?.caseId) return;
    const cache = loadCaseCacheByKey(CASE_CACHE_KEY_V2);
    cache[caseData.caseId] = caseData;
    localStorage.setItem(CASE_CACHE_KEY_V2, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function getAuthToken() {
  // ✅ IMPORTANT : compat ton token réel
  const candidates = [
    "droitgpt_access_token",
    "token",
    "authToken",
    "accessToken",
    "droitgpt_token",
  ];
  for (const k of candidates) {
    const v = localStorage.getItem(k);
    if (v && v.trim().length > 10) return v.trim();
  }
  return null;
}

function toFlagsFromAi(ai) {
  const flags = [];
  const critical = Array.isArray(ai?.criticalErrors) ? ai.criticalErrors : [];
  const warnings = Array.isArray(ai?.warnings) ? ai.warnings : [];
  for (const c of critical)
    flags.push({
      level: "critical",
      label: c?.label || "Erreur critique",
      detail: c?.detail || "",
    });
  for (const w of warnings)
    flags.push({ level: "warn", label: w?.label || "Avertissement", detail: w?.detail || "" });
  return flags;
}

function toDebriefFromAi(ai) {
  const strengths = Array.isArray(ai?.strengths) ? ai.strengths : [];
  const feedback = Array.isArray(ai?.feedback) ? ai.feedback : [];
  const appealRisk = ai?.appealRisk ? `📌 Risque d’annulation en appel (simulation) : ${ai.appealRisk}.` : null;

  const out = [];
  for (const s of strengths.slice(0, 5)) out.push(`✅ ${s}`);
  for (const f of feedback.slice(0, 7)) out.push(`⚙️ ${f}`);
  if (appealRisk) out.push(appealRisk);

  return out.length ? out : ["⚠️ Débrief indisponible."];
}

async function postJSON(url, body) {
  const token = getAuthToken();
  if (!token) throw new Error("AUTH_TOKEN_MISSING");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP_${resp.status}:${text.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getJSON(url) {
  const token = getAuthToken();
  if (!token) throw new Error("AUTH_TOKEN_MISSING");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP_${resp.status}:${text.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ======= helpers live feedback =======
function nowIso() {
  return new Date().toISOString();
}
function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function setDiff(nextArr, prevArr) {
  const next = new Set(Array.isArray(nextArr) ? nextArr : []);
  const prev = new Set(Array.isArray(prevArr) ? prevArr : []);
  const added = [];
  for (const x of next) if (!prev.has(x)) added.push(x);
  return added;
}

function bestChoiceForRole(obj, role) {
  if (obj?.bestChoiceByRole?.[role]) return obj.bestChoiceByRole[role];

  const t = `${obj?.title || ""} ${obj?.statement || ""}`.toLowerCase();
  if (role === "Juge") return "Demander précision";
  if (role === "Procureur") {
    if (t.includes("null") || t.includes("irr") || t.includes("vice") || t.includes("tardiv") || t.includes("recev"))
      return "Rejeter";
    return "Rejeter";
  }
  if (t.includes("null") || t.includes("irr") || t.includes("vice") || t.includes("defense") || t.includes("contradic"))
    return "Accueillir";
  if (t.includes("tardiv") || t.includes("recev")) return "Rejeter";
  return "Accueillir";
}

// ✅ récupère un caseData : cache local (v2/v1) → runs (fallback)
function resolveCaseData(decodedCaseId) {
  const cache = loadCaseCache();
  if (cache?.[decodedCaseId]) return cache[decodedCaseId];

  try {
    const runs = readRuns();
    const r = (runs || []).find((x) => x?.caseMeta?.caseId === decodedCaseId);
    if (r?.caseMeta?.caseData) return r.caseMeta.caseData;
  } catch {
    // ignore
  }

  return null;
}

function normalizePartyValue(v) {
  if (!v) return { title: "-", sub: "" };
  if (typeof v === "string") return { title: v, sub: "" };
  if (typeof v === "object") {
    const title = v.nom || v.name || v.label || "-";
    const sub = v.statut || v.role || v.desc || "";
    return { title, sub };
  }
  return { title: String(v), sub: "" };
}

/** ========== ✅ Audit helper compatible engine ========== */
function pushAuditLocal(runObj, evt) {
  const next = { ...(runObj || {}) };
  next.state = next.state || {};
  next.state.auditLog = Array.isArray(next.state.auditLog) ? next.state.auditLog : [];
  next.state.auditLog.unshift({
    id: `log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    ts: nowIso(),
    ...evt,
  });
  next.state.auditLog = next.state.auditLog.slice(0, 250);
  return next;
}

/** ========== ✅ Chrono helpers ========== */
function msToClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function computeChronoElapsedMs(ch) {
  if (!ch) return 0;
  const elapsedBase = Number(ch.elapsedMs || 0);
  if (!ch.running) return elapsedBase;

  const startedAt = ch.startedAt ? new Date(ch.startedAt).getTime() : Date.now();
  const lastStartAt = ch.lastStartAt ? new Date(ch.lastStartAt).getTime() : startedAt;
  const delta = Date.now() - lastStartAt;
  return elapsedBase + Math.max(0, delta);
}

function PedagogyPanel({ caseData, compact = false }) {
  const p = caseData?.pedagogy;
  if (!p) return null;

  const objectifs = Array.isArray(p.objectifs) ? p.objectifs : [];
  const erreurs = Array.isArray(p.erreursFrequentes) ? p.erreursFrequentes : [];
  const checklist = Array.isArray(p.checklistAudience) ? p.checklistAudience : [];

  return (
    <div className={`rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 ${compact ? "" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-violet-300/80">Didacticiel</div>
          <div className="mt-1 text-sm font-semibold text-violet-100">
            Objectifs pédagogiques • Niveau: {p.level || caseData?.niveau || "—"}
          </div>
        </div>
        <div className="text-[11px] text-slate-300">{caseData?.meta?.city ? `Ville: ${caseData.meta.city}` : ""}</div>
      </div>

      <div className={`mt-3 grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-xs text-slate-200 font-semibold">🎯 Objectifs</div>
          <ul className="mt-2 space-y-1 text-xs text-slate-200">
            {objectifs.slice(0, compact ? 4 : 6).map((x, i) => (
              <li key={i}>• {x}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-xs text-slate-200 font-semibold">⚠️ Erreurs fréquentes</div>
          <ul className="mt-2 space-y-1 text-xs text-slate-200">
            {erreurs.slice(0, compact ? 4 : 6).map((x, i) => (
              <li key={i}>• {x}</li>
            ))}
          </ul>
        </div>

        {!compact && (
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-200 font-semibold">✅ Checklist audience</div>
            <ul className="mt-2 space-y-1 text-xs text-slate-200">
              {checklist.slice(0, 6).map((x, i) => (
                <li key={i}>• {x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-3 text-[11px] text-slate-300">
        Astuce : pendant l’audience, motive en 2–5 phrases et note l’impact sur le contradictoire / recevabilité /
        proportionnalité.
      </div>
    </div>
  );
}

export default function JusticeLabPlay() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const decodedCaseId = useMemo(() => decodeURIComponent(caseId || ""), [caseId]);
  const caseData = useMemo(() => resolveCaseData(decodedCaseId), [decodedCaseId]);

  useMemo(() => {
    if (caseData?.caseId) saveCaseToCache(caseData);
    return null;
  }, [caseData]);

  // ✅ init run
  const [run, setRun] = useState(() => {
    if (!caseData) return null;
    const active = ensureActiveRunValid();
    const activeCaseId = active?.caseId || active?.caseMeta?.caseId;
    if (active && activeCaseId === caseData.caseId) return active;

    const r = createNewRun(caseData);
    return { ...r, caseMeta: { ...(r.caseMeta || {}), caseId: caseData.caseId, caseData } };
  });

  const [step, setStep] = useState(() => (run?.step ? run.step : "MODE"));

  // ✅ multi / solo-ai session
  const session = run?.state?.session || { mode: "SOLO_AI" };
  const isCoop = session?.mode === "COOP";
  const roomId = session?.roomId || "";
  const participantId = session?.participantId || "";
  const isHost = Boolean(session?.isHost);

  const [sessionError, setSessionError] = useState(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState(() => {
    if (!lsAvailable()) return "";
    return localStorage.getItem("justicelab_display_name") || "";
  });

  const [roomInfo, setRoomInfo] = useState(null);
  const roomPollRef = useRef(null);

  // Audience
  const [audienceScene, setAudienceScene] = useState(() => run?.answers?.audience?.scene || null);

  const [isLoadingAudience, setIsLoadingAudience] = useState(false);
  // ✅ Progress bar génération audience (<= 12s)
  const [audienceGenProgress, setAudienceGenProgress] = useState(0);
  const audienceGenTimerRef = useRef(null);


  // Scoring IA + Appeal IA
  const [isScoring, setIsScoring] = useState(false);
  const [scoreError, setScoreError] = useState(null);
  const [appealError, setAppealError] = useState(null);
  const [progress, setProgress] = useState(0);

  // ✅ mini feedback offline + map par objection
  const [liveFeedback, setLiveFeedback] = useState([]);
  const [feedbackByObjection, setFeedbackByObjection] = useState({});

  // ✅ verrouillage motivation (objections)
  const [editReasoningById, setEditReasoningById] = useState({});
  const [draftReasoningById, setDraftReasoningById] = useState({});

  // UI toggles
  const [showAudit, setShowAudit] = useState(true);
  const [showPiecesImpact, setShowPiecesImpact] = useState(true);

  // ✅ Audience ultra pro (formation continue)
  const [ultraPro, setUltraPro] = useState(() => Boolean(run?.state?.settings?.ultraPro));

  // ✅ Procès complet V1 (multi-audiences)
  const [trialV1, setTrialV1] = useState(() => Boolean(run?.state?.settings?.trialV1));

  const currentTrialStage = useMemo(() => {
    if (!trialV1) return null;
    return getCurrentTrialStage(run);
  }, [trialV1, run]);


  // ✅ Greffier (nom)
  const [greffierName, setGreffierName] = useState(() => {
    if (!lsAvailable()) return "Le Greffier";
    return localStorage.getItem("justicelab_greffier_name") || "Le Greffier";
  });

  // ✅ Chrono UI refresh
  const [chronoUiTick, setChronoUiTick] = useState(0);
  const chronoIntervalRef = useRef(null);


  // ✅ persist ultraPro setting in run
  useEffect(() => {
    if (!run?.runId) return;
    const current = Boolean(run?.state?.settings?.ultraPro);
    if (current === Boolean(ultraPro)) return;
    const next = {
      ...run,
      state: {
        ...(run.state || {}),
        settings: { ...(run.state?.settings || {}), ultraPro: Boolean(ultraPro) },
      },
    };
    saveRunState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultraPro]);

  // ✅ persist trialV1 setting in run (+ init trial state)
  useEffect(() => {
    if (!run?.runId) return;
    const current = Boolean(run?.state?.settings?.trialV1);
    if (current === Boolean(trialV1)) return;

    let next = {
      ...run,
      state: {
        ...(run.state || {}),
        settings: { ...(run.state?.settings || {}), trialV1: Boolean(trialV1) },
      },
    };

    // init timeline when enabling
    if (Boolean(trialV1)) {
      next = initTrialV1(next, caseData);
    } else {
      // if disabling, keep state.trial but mark as inactive (no destruction)
      next.state = next.state || {};
      next.state.settings = { ...(next.state.settings || {}), trialV1: false };
    }

    saveRunState(next);
    setRun(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialV1]);



  // ✅ persister run en storage comme active
  useEffect(() => {
    if (!run?.runId) return;
    try {
      upsertAndSetActive(run);
      setActiveRunId(run.runId);
    } catch {
      // ignore
    }
  }, [run?.runId]);

  // ✅ sync audienceScene depuis run
  useEffect(() => {
    const sc = run?.answers?.audience?.scene || null;
    if (sc && sc !== audienceScene) setAudienceScene(sc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.answers?.audience?.scene]);

  // ✅ start chrono auto quand on arrive en AUDIENCE
  useEffect(() => {
    if (!run?.runId) return;

    if (step !== "AUDIENCE") {
      // stop UI tick
      if (chronoIntervalRef.current) {
        clearInterval(chronoIntervalRef.current);
        chronoIntervalRef.current = null;
      }
      return;
    }

    // tick UI
    if (!chronoIntervalRef.current) {
      chronoIntervalRef.current = setInterval(() => setChronoUiTick((t) => t + 1), 1000);
    }

    // auto start if not started
    const ch = run?.state?.chrono || null;
    if (!ch?.startedAt) {
      const next = pushAuditLocal(
        {
          ...run,
          state: {
            ...(run.state || {}),
            chrono: {
              startedAt: nowIso(),
              lastStartAt: nowIso(),
              elapsedMs: 0,
              running: true,
            },
          },
        },
        {
          type: "CHRONO",
          title: "Chronomètre — démarrage",
          detail: "Début du temps d’audience (auto).",
          meta: { step: "AUDIENCE" },
        }
      );
      saveRunState(next);
    } else if (ch?.startedAt && !ch?.running) {
      // keep paused if user paused
    } else if (ch?.startedAt && ch?.running && !ch?.lastStartAt) {
      const next = {
        ...run,
        state: {
          ...(run.state || {}),
          chrono: { ...(ch || {}), lastStartAt: nowIso(), running: true },
        },
      };
      saveRunState(next);
    }

    return () => {
      if (chronoIntervalRef.current) {
        clearInterval(chronoIntervalRef.current);
        chronoIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, run?.runId]);

  // ✅ persist greffierName
  useEffect(() => {
    try {
      if (lsAvailable()) localStorage.setItem("justicelab_greffier_name", greffierName || "Le Greffier");
    } catch {
      // ignore
    }
  }, [greffierName]);

  if (!caseData || !run) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-200 font-semibold">Dossier introuvable.</p>
          <p className="text-sm text-slate-300 mt-2">
            Si ce dossier a été généré dynamiquement, assure-toi qu’il est encore dans le cache local
            (ou regénère-le depuis Justice Lab).
          </p>
          <div className="mt-4 flex gap-2">
            <Link className="inline-flex text-emerald-300 underline" to="/justice-lab">
              Retour Justice Lab
            </Link>
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const piecesById = useMemo(() => {
    const m = new Map();
    (caseData.pieces || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [caseData]);

  const excludedIds = run.state?.excludedPieceIds || [];
  const admittedLateIds = run.state?.admittedLatePieceIds || [];
  const tasks = run.state?.pendingTasks || [];
  const audit = run.state?.auditLog || [];

  const excludedPieces = excludedIds.map((id) => piecesById.get(id)).filter(Boolean);
  const admittedLatePieces = admittedLateIds.map((id) => piecesById.get(id)).filter(Boolean);

  const excludedCount = excludedIds.length || 0;
  const admittedLateCount = admittedLateIds.length || 0;
  const tasksCount = tasks.length || 0;

  const saveRunState = (nextRunOrPatch) => {
    const next = nextRunOrPatch && nextRunOrPatch.runId ? nextRunOrPatch : patchActiveRun(nextRunOrPatch);

    if (next?.runId) {
      upsertAndSetActive(next);
      setActiveRunId(next.runId);
      setRun(next);
    }
    return next;
  };

  // persist display name locally
  useEffect(() => {
    try {
      if (lsAvailable()) localStorage.setItem("justicelab_display_name", displayNameInput || "");
    } catch {
      // ignore
    }
  }, [displayNameInput]);

  const roomApiCreate = async ({ displayName, role }) => {
    setSessionError(null);
    const data = await postJSON(`${API_BASE}/justice-lab/rooms/create`, {
      caseId: run.caseId || run.caseMeta?.caseId,
      displayName,
      role,
    });

    const next = {
      ...run,
      step: "ROLE",
      answers: { ...(run.answers || {}), role },
      state: {
        ...(run.state || {}),
        session: {
          ...(run.state?.session || {}),
          mode: "COOP",
          roomId: data.roomId,
          participantId: data.participantId,
          displayName,
          isHost: true,
          version: Number(data.version || 0),
          lastSyncAt: nowIso(),
        },
      },
    };
    setRoomInfo(data);
    saveRunState(next);
    setStep("ROLE");
  };

  const roomApiJoin = async ({ roomId, displayName, role }) => {
    setSessionError(null);
    const data = await postJSON(`${API_BASE}/justice-lab/rooms/join`, {
      roomId,
      displayName,
      role,
      caseId: run.caseId || run.caseMeta?.caseId,
    });

    const next = {
      ...run,
      step: "ROLE",
      answers: { ...(run.answers || {}), role },
      state: {
        ...(run.state || {}),
        session: {
          ...(run.state?.session || {}),
          mode: "COOP",
          roomId: data.roomId,
          participantId: data.participantId,
          displayName,
          isHost: false,
          version: Number(data.version || 0),
          lastSyncAt: nowIso(),
        },
      },
    };
    setRoomInfo(data);
    // hydrate snapshot if any
    if (data?.snapshot && typeof data.snapshot === "object") {
      const snap = data.snapshot;
      // keep our local session identifiers
      snap.state = snap.state || {};
      snap.state.session = next.state.session;
      setRun(snap);
      upsertAndSetActive(snap);
      setActiveRunId(snap.runId);
    } else {
      saveRunState(next);
    }
    setStep("ROLE");
  };

  const roomApiAction = async (action) => {
    if (!roomId) return;
    try {
      // ✅ Compat: support anciens formats (type:"SNAPSHOT"/"SUGGESTION") et nouveaux (SYNC_SNAPSHOT payload)
      let type = String(action?.type || "").trim();
      const legacySnapshot = action?.snapshot;
      const legacySuggestion = action?.suggestion;

      if (type === "SNAPSHOT") type = "SYNC_SNAPSHOT";

      const payload =
        action?.payload ||
        (legacySnapshot ? { snapshot: legacySnapshot } : null) ||
        (legacySuggestion ? { suggestion: legacySuggestion } : null) ||
        null;

      // On envoie un objet action qui contient aussi les champs legacy (backend tolérant)
      const actionToSend = {
        type,
        payload: payload || undefined,
        snapshot: legacySnapshot || (payload && payload.snapshot) || undefined,
        suggestion: legacySuggestion || (payload && payload.suggestion) || undefined,
        text: action?.text || undefined,
      };

      await postJSON(`${API_BASE}/justice-lab/rooms/action`, {
        roomId,
        participantId,
        action: actionToSend,
      });
    } catch (e) {
      console.warn("room action failed", e);
    }
  };

  // poll room state
  useEffect(() => {
    if (!isCoop || !roomId) return;

    let stopped = false;
    const poll = async () => {
      try {
        const data = await getJSON(`${API_BASE}/justice-lab/rooms/${roomId}?participantId=${encodeURIComponent(participantId || "")}`);
        if (stopped) return;
        setRoomInfo(data);

        const incomingV = Number(data?.version || 0);
        const localV = Number(run?.state?.session?.version || 0);

        if (data?.snapshot && incomingV > localV) {
          const snap = data.snapshot;
          // keep session identifiers
          snap.state = snap.state || {};
          snap.state.session = {
            ...(run?.state?.session || {}),
            mode: "COOP",
            roomId,
            participantId,
            isHost,
            displayName: displayNameInput,
            version: incomingV,
            lastSyncAt: nowIso(),
          };
          setRun(snap);
          try {
            upsertAndSetActive(snap);
            setActiveRunId(snap.runId);
          } catch {
            // ignore
          }
        }
      } catch (e) {
        // ignore transient
      }
    };

    poll();
    if (roomPollRef.current) clearInterval(roomPollRef.current);
    roomPollRef.current = setInterval(poll, 2000);
    return () => {
      stopped = true;
      if (roomPollRef.current) {
        clearInterval(roomPollRef.current);
        roomPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoop, roomId, participantId]);

  const goNext = async () => {
    if (isScoring || isLoadingAudience) return;

    if (step === "MODE") return setStep("ROLE");

    if (step === "ROLE") return setStep("BRIEFING");
    if (step === "BRIEFING") return setStep("QUALIFICATION");
    if (step === "QUALIFICATION") return setStep("PROCEDURE");
    if (step === "PROCEDURE") {
      // Procès complet V1: on passe en timeline (multi-audiences)
      if (Boolean(run?.state?.settings?.trialV1)) {
        const next = initTrialV1(run, caseData);
        saveRunState(next);
        setRun(next);
        return setStep("TRIAL");
      }
      await loadAudience();
      return setStep("AUDIENCE");
    }
    if (step === "TRIAL") {
      // Procès complet V1: on ne peut aller à la décision que lorsque toutes les étapes sont terminées
      if (Boolean(run?.state?.settings?.trialV1) && trialAllDone) return setStep("DECISION");
      return;
    }

    if (step === "AUDIENCE") {
      // Procès complet V1: retour timeline après l'audience de l'étape
      if (Boolean(run?.state?.settings?.trialV1)) {
        return setStep("TRIAL");
      }
      return setStep("DECISION");
    }
    if (step === "DECISION") return finalize();
  };

  const goPrev = () => {
    if (isScoring || isLoadingAudience) return;
    if (step === "ROLE") return setStep("MODE");
    if (step === "BRIEFING") return setStep("ROLE");
    if (step === "QUALIFICATION") return setStep("BRIEFING");
    if (step === "PROCEDURE") return setStep("QUALIFICATION");
    if (step === "TRIAL") return setStep("PROCEDURE");
    if (step === "AUDIENCE") {
      if (Boolean(run?.state?.settings?.trialV1)) return setStep("TRIAL");
      return setStep("PROCEDURE");
    }
    if (step === "DECISION") {
      if (Boolean(run?.state?.settings?.trialV1)) return setStep("TRIAL");
      return setStep("AUDIENCE");
    }
  };

  const loadAudience = async () => {
    if (audienceScene?.objections?.length) return;

    
    // Progress bar (max ~12s)
    setAudienceGenProgress(0);
    if (audienceGenTimerRef.current) clearInterval(audienceGenTimerRef.current);
    const t0 = Date.now();
    audienceGenTimerRef.current = setInterval(() => {
      const dt = Date.now() - t0;
      const p = Math.min(95, Math.round((dt / 11000) * 95));
      setAudienceGenProgress(p);
      if (p >= 95) {
        clearInterval(audienceGenTimerRef.current);
        audienceGenTimerRef.current = null;
      }
    }, 200);

    setIsLoadingAudience(true);
    try {
      const payload = {
        // ✅ Format complet (backend V2) + compat format léger
        caseData,
        runData: run,

        caseId: run.caseId || run.caseMeta?.caseId,
        role: run.answers?.role || "Juge",
        difficulty: caseData?.niveau || "Intermédiaire",
        facts: caseData?.resume || "",
        parties: caseData?.parties || {},
        pieces: (caseData?.pieces || []).map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          content: (p.content || "").slice(0, 900),
        })),
        legalIssues: caseData?.legalIssues || [],
        procedureChoice: run.answers?.procedureChoice || null,
        procedureJustification: run.answers?.procedureJustification || "",
        language: "fr",

        // ✅ Enrichissement "ultra pro"
        audienceStyle: ultraPro ? "ULTRA_PRO" : "STANDARD",
        minTurns: ultraPro ? 40 : 22,
        minObjections: ultraPro ? 8 : 4,
        includeIncidents: true,
        includePiecesLinks: true,
      };;

      const data = await postJSON(`${API_BASE}/justice-lab/audience`, payload);

      const merged = mergeAudienceWithTemplates(caseData, data);
      setAudienceScene(merged);

      const nextRun = setAudienceSceneOnRun(run, merged);
      saveRunState(nextRun);
    } catch (e) {
      console.warn(e);
      const fallback = {
        turns: [
          { speaker: "Greffier", text: "Affaire appelée. Parties présentes." },
          { speaker: "Juge", text: "L’audience est ouverte. Nous allons entendre les incidents." },
          { speaker: "Procureur", text: "Le parquet conteste l’exception et invoque l’intérêt public." },
          { speaker: "Avocat", text: "La défense insiste sur le contradictoire et l’égalité des armes." },
        ],
        objections: [
          {
            id: "OBJ1",
            by: "Avocat",
            title: "Exception de nullité / irrégularité",
            statement: "La défense soutient qu’un acte essentiel est irrégulier et doit être écarté.",
            options: ["Accueillir", "Rejeter", "Demander précision"],
          },
          {
            id: "OBJ2",
            by: "Procureur",
            title: "Recevabilité / preuve tardive",
            statement: "Le parquet conteste une pièce produite tardivement et en discute la recevabilité.",
            options: ["Accueillir", "Rejeter", "Demander précision"],
          },
        ],
      };

      const merged = mergeAudienceWithTemplates(caseData, fallback);
      setAudienceScene(merged);

      const nextRun = setAudienceSceneOnRun(run, merged);
      saveRunState(nextRun);
    } finally {
      setIsLoadingAudience(false);
      setAudienceGenProgress(100);
      if (audienceGenTimerRef.current) {
        clearInterval(audienceGenTimerRef.current);
        audienceGenTimerRef.current = null;
      }
    }
  };

  // ✅ applique décision V5 + feedback instant offline + impacts
  const applyDecisionHybrid = (obj, decision, reasoning) => {
    setRun((prev) => {
      const before = prev;

      const beforeExcluded = before.state?.excludedPieceIds || [];
      const beforeLate = before.state?.admittedLatePieceIds || [];
      const beforeTasks = before.state?.pendingTasks || [];
      const beforeAudit = before.state?.auditLog || [];

      const role = (before.answers?.role || "").trim() || "Juge";

      const payload = {
        objectionId: obj?.id,
        decision,
        reasoning: (reasoning || "").slice(0, 1200),
        role,
        effects: obj?.effects || obj?.effect || null,
      };

      const next = applyAudienceDecision(before, payload);

      const addedExcluded = setDiff(next.state?.excludedPieceIds, beforeExcluded);
      const addedLate = setDiff(next.state?.admittedLatePieceIds, beforeLate);

      const addedTasks = setDiff(
        (next.state?.pendingTasks || []).map((t) => `${t.type}|${t.label}|${t.detail}`),
        beforeTasks.map((t) => `${t.type}|${t.label}|${t.detail}`)
      );

      const lastAudit =
        (next.state?.auditLog || []).slice(0, 1)[0] ||
        (next.state?.auditLog || []).slice(-1)[0] ||
        (beforeAudit || []).slice(0, 1)[0] ||
        (beforeAudit || []).slice(-1)[0] ||
        null;

      const best = bestChoiceForRole(obj, role);
      const ok = decision === best;

      const impactLines = [];
      if (addedExcluded.length) {
        const labels = addedExcluded.map((id) => piecesById.get(id)?.title || id).slice(0, 3);
        impactLines.push(`🧾 Pièces écartées: ${labels.join(" • ")}`);
      }
      if (addedLate.length) {
        const labels = addedLate.map((id) => piecesById.get(id)?.title || id).slice(0, 3);
        impactLines.push(`📎 Pièces admises tardives: ${labels.join(" • ")}`);
      }
      if (addedTasks.length) {
        const lastTasks = (next.state?.pendingTasks || [])
          .slice(-Math.min(2, addedTasks.length))
          .map((t) => t.label || t.type);
        impactLines.push(`✅ Actions: ${lastTasks.join(" • ")}`);
      }
      if (!impactLines.length) impactLines.push("ℹ️ Impact: pas d’effet procédural majeur (bonus/penalty interne possible).");

      const fb = {
        id: `fb_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        at: nowIso(),
        objId: obj?.id || "",
        title: obj?.title || "Objection",
        decision,
        role,
        verdict: ok ? "BON" : "À AMÉLIORER",
        headline: ok ? "✅ Bonne décision (cohérence rôle/garanties)" : "⚠️ Décision discutable (risque procédural)",
        suggestion: ok
          ? "Continue : motive brièvement (contradictoire / recevabilité / proportionnalité)."
          : `Suggestion IA (instant) : pour le rôle ${role}, un choix souvent plus sûr est “${best}”.`,
        impact: impactLines,
        audit: lastAudit
          ? `${lastAudit.title || lastAudit.action || lastAudit.type || "Acte"}${lastAudit.detail ? ` — ${lastAudit.detail}` : ""}`
          : null,
      };

      setLiveFeedback((arr) => [fb, ...(arr || [])].slice(0, 4));
      if (obj?.id) setFeedbackByObjection((m) => ({ ...(m || {}), [obj.id]: fb }));

      try {
        upsertAndSetActive(next);
        setActiveRunId(next.runId);
      } catch {
        // ignore
      }

      // ✅ COOP: l'hôte (souvent le juge) pousse le snapshot aux autres
      if (isCoop && roomId && participantId && isHost) {
        void roomApiAction({ type: "SYNC_SNAPSHOT", payload: { snapshot: next }, snapshot: next });
      }

      return next;
    });
  };

  // ✅ Décision / suggestion selon rôle + mode
  const handleDecisionClick = async (obj, decision, reasoning) => {
    const role = (run.answers?.role || "Juge").trim() || "Juge";

    // COOP: seuls les juges valident. Les autres soumettent une suggestion.
    if (isCoop && role !== "Juge") {
      await roomApiAction({
        type: "SUGGESTION",
        payload: { suggestion: { objectionId: obj?.id, byRole: role, decision, reasoning: (reasoning || "").slice(0, 1200) } },
        suggestion: { objectionId: obj?.id, byRole: role, decision, reasoning: (reasoning || "").slice(0, 1200) },
      });
      setLiveFeedback((arr) =>
        [
          {
            id: `fb_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            at: nowIso(),
            objId: obj?.id || "",
            title: obj?.title || "Objection",
            decision,
            role,
            verdict: "ENVOYÉ",
            headline: "📨 Suggestion envoyée au juge",
            suggestion: "Attends la décision finale du juge (synchro de la salle).",
            impact: [],
            audit: null,
          },
          ...(arr || []),
        ].slice(0, 4)
      );
      return;
    }

    // SOLO AI: si le joueur n'est pas juge, l'IA joue le juge et tranche.
    if (!isCoop && role !== "Juge") {
      const next0 = pushAuditLocal(run, {
        type: "SUGGESTION",
        title: `Suggestion du joueur (${role})`,
        detail: `${decision} — ${(reasoning || "").slice(0, 240)}`,
        meta: { objectionId: obj?.id },
      });
      saveRunState(next0);

      try {
        const ai = await postJSON(`${API_BASE}/justice-lab/ai-judge`, {
          caseData,
          runData: next0,
          objection: obj,
          playerSuggestion: { role, decision, reasoning: (reasoning || "").slice(0, 1200) },
        });
        const chosen = ai?.choice || "Demander précision";
        const rr = (ai?.reasoning || "Décision IA.").slice(0, 1200);
        return applyDecisionHybrid(obj, chosen, rr);
      } catch (e) {
        console.warn(e);
        // fallback: appliquer la suggestion du joueur
        return applyDecisionHybrid(obj, decision, reasoning);
      }
    }

    // JUGE (solo ou coop)
    return applyDecisionHybrid(obj, decision, reasoning);
  };

  /** ✅ Incidents procéduraux (écrit dans auditLog + crée tâche) */
  const addProceduralIncident = (kind) => {
    const k = String(kind || "").toUpperCase();

    const labels = {
      NULLITE: "Incident procédural — Nullité soulevée",
      RENVOI: "Incident procédural — Demande de renvoi",
      JONCTION: "Incident procédural — Jonction sollicitée",
      DISJONCTION: "Incident procédural — Disjonction sollicitée",
      COMMUNICATION_PIECES: "Incident procédural — Communication de pièces",
    };

    const details = {
      NULLITE: "Une partie invoque un vice de procédure. Le juge doit entendre le contradictoire puis motiver la décision.",
      RENVOI: "Renvoi demandé (préparation, témoin, pièces). Décision motivée + fixation éventuelle d’une date.",
      JONCTION: "Demande de jonction de procédures/dossiers connexes. Vérifier connexité, bonne administration de la justice.",
      DISJONCTION: "Demande de disjonction pour juger séparément. Vérifier intérêt, délais, droits de la défense.",
      COMMUNICATION_PIECES: "Demande de communication de pièces. Garantir contradictoire + délai raisonnable.",
    };

    const title = labels[k] || `Incident procédural — ${k}`;
    const detail = details[k] || "Incident ajouté au dossier.";

    const task = {
      type: "INCIDENT",
      label: title,
      detail: "À consigner au PV + décision motivée (2–6 phrases).",
    };

    const next0 = pushAuditLocal(
      {
        ...run,
        state: {
          ...(run.state || {}),
          pendingTasks: Array.isArray(run.state?.pendingTasks)
            ? [...run.state.pendingTasks, task].slice(0, 60)
            : [task],
        },
      },
      {
        type: "INCIDENT",
        title,
        detail,
        meta: { kind: k, step: "AUDIENCE" },
      }
    );

    saveRunState(next0);
  };

  /** ✅ Chrono actions */
  const chrono = run?.state?.chrono || null;
  const elapsedMs = useMemo(() => computeChronoElapsedMs(chrono), [chrono, chronoUiTick]);
  const chronoText = msToClock(elapsedMs);

  const chronoStart = () => {
    const ch = run?.state?.chrono || {};
    const next = pushAuditLocal(
      {
        ...run,
        state: {
          ...(run.state || {}),
          chrono: {
            startedAt: ch.startedAt || nowIso(),
            lastStartAt: nowIso(),
            elapsedMs: Number(ch.elapsedMs || 0),
            running: true,
          },
        },
      },
      { type: "CHRONO", title: "Chronomètre — reprise", detail: "Reprise du temps d’audience.", meta: { step: "AUDIENCE" } }
    );
    saveRunState(next);
  };

  const chronoPause = () => {
    const ch = run?.state?.chrono || {};
    const current = computeChronoElapsedMs(ch);
    const next = pushAuditLocal(
      {
        ...run,
        state: {
          ...(run.state || {}),
          chrono: {
            startedAt: ch.startedAt || nowIso(),
            lastStartAt: ch.lastStartAt || nowIso(),
            elapsedMs: current,
            running: false,
          },
        },
      },
      { type: "CHRONO", title: "Chronomètre — pause", detail: `Pause à ${msToClock(current)}.`, meta: { step: "AUDIENCE" } }
    );
    saveRunState(next);
  };

  const chronoReset = () => {
    const next = pushAuditLocal(
      {
        ...run,
        state: {
          ...(run.state || {}),
          chrono: {
            startedAt: nowIso(),
            lastStartAt: nowIso(),
            elapsedMs: 0,
            running: false,
          },
        },
      },
      { type: "CHRONO", title: "Chronomètre — reset", detail: "Remise à zéro.", meta: { step: "AUDIENCE" } }
    );
    saveRunState(next);
  };



  // ================================
  // ✅ PROCÈS COMPLET V1 — helpers UI
  // ================================
  const trialStageMap = useMemo(() => {
    const m = {};
    for (const s of (TRIAL_V1_STAGES || [])) m[s.id] = s;
    return m;
  }, []);

  const loadStageAudience = async (stageId) => {
    if (!stageId) return;
    const def = trialStageMap[stageId] || {};

    // ensure trial initialized
    let baseRun = run;
    if (!baseRun?.state?.trial || baseRun.state.trial.version !== "V1") {
      baseRun = initTrialV1(baseRun, caseData);
    }
    baseRun = setCurrentTrialStage(baseRun, stageId);
    saveRunState(baseRun);
    setRun(baseRun);

    
    // Progress bar (max ~12s)
    setAudienceGenProgress(0);
    if (audienceGenTimerRef.current) clearInterval(audienceGenTimerRef.current);
    const t0 = Date.now();
    audienceGenTimerRef.current = setInterval(() => {
      const dt = Date.now() - t0;
      const p = Math.min(95, Math.round((dt / 11000) * 95));
      setAudienceGenProgress(p);
      if (p >= 95) {
        clearInterval(audienceGenTimerRef.current);
        audienceGenTimerRef.current = null;
      }
    }, 200);

    setIsLoadingAudience(true);
    try {
      const payload = {
        caseData,
        runData: baseRun,

        // meta de l'étape du procès
        hearingType: stageId,
        hearingObjective: def.objective || "Audience simulée (formation)",

        // ultra pro
        audienceStyle: ultraPro ? "ULTRA_PRO" : "STANDARD",
        minTurns: Number(def.minTurns || (ultraPro ? 40 : 22)),
        minObjections: Number(def.minObjections || (ultraPro ? 8 : 4)),
        includeIncidents: def.includeIncidents !== false,
        includePiecesLinks: true,
      };

      const data = await postJSON(`${API_BASE}/justice-lab/audience`, payload);
      const merged = mergeAudienceWithTemplates(caseData, data);

      // stocker dans la timeline + aussi comme scene active
      let next = attachStageAudienceScene(baseRun, stageId, merged);
      next = setAudienceSceneOnRun(next, merged);

      setAudienceScene(merged);
      saveRunState(next);
      setRun(next);
      setStep("AUDIENCE");
    } catch (e) {
      console.warn(e);
      setSessionError("Impossible de générer l'audience de l'étape.");
    } finally {
      setIsLoadingAudience(false);
      setAudienceGenProgress(100);
      if (audienceGenTimerRef.current) {
        clearInterval(audienceGenTimerRef.current);
        audienceGenTimerRef.current = null;
      }
    }
  };

  const markStageDone = (stageId, note) => {
    if (!stageId) return;
    const t = run?.state?.trial;
    if (!t || !Array.isArray(t.stages)) return;

    const next = {
      ...run,
      state: {
        ...(run.state || {}),
        trial: {
          ...t,
          stages: t.stages.map((s) =>
            s.id === stageId
              ? {
                  ...s,
                  status: "DONE",
                  finishedAt: s.finishedAt || nowIso(),
                  notes: [...(Array.isArray(s.notes) ? s.notes : []), ...(note ? [String(note).slice(0, 400)] : [])],
                }
              : s
          ),
          journal: [...(Array.isArray(t.journal) ? t.journal : []), { ts: nowIso(), type: "STAGE_DONE", text: `Étape terminée → ${stageId}` }],
        },
      },
    };

    saveRunState(next);
    setRun(next);
  };

  const advanceToNextStage = () => {
    const t = run?.state?.trial;
    if (!t || !Array.isArray(t.stages)) return;

    const currentId = t.currentStageId;
    const stages = [...t.stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = stages.findIndex((s) => s.id === currentId);
    const nextStage = stages.find((s, i) => i > idx && s.status !== "DONE") || null;

    if (!nextStage) return; // plus d'étape

    const next = setCurrentTrialStage(run, nextStage.id);
    saveRunState(next);
    setRun(next);
  };

  const trialAllDone = useMemo(() => {
    const st = run?.state?.trial?.stages;
    if (!Array.isArray(st) || !st.length) return false;
    return st.every((s) => s.status === "DONE");
  }, [run]);
  const finalize = async () => {
    setScoreError(null);
    setAppealError(null);
    setIsScoring(true);
    setProgress(8);

    try {
      const local = scoreRun(run);
      setProgress(15);

      let aiScore = null;
      try {
        aiScore = await postJSON(`${API_BASE}/justice-lab/score`, {
          caseData,
          runData: run,
          caseId: run.caseId || run.caseMeta?.caseId,
          role: run.answers?.role || "Juge",
          facts: caseData?.resume || "",
          qualification: run.answers?.qualification || "",
          procedureChoice: run.answers?.procedureChoice || null,
          procedureJustification: run.answers?.procedureJustification || "",
          audience: run.answers?.audience || {},
          decisionMotivation: run.answers?.decisionMotivation || "",
          decisionDispositif: run.answers?.decisionDispositif || "",
          language: "fr",
          greffierName,
          chrono: run?.state?.chrono || null,
        });
        setProgress(55);
      } catch (e) {
        console.warn("score ia failed", e);
      }

      let appeal = null;
      try {
        appeal = await postJSON(`${API_BASE}/justice-lab/appeal`, {
          caseData,
          runData: run,
          scored: aiScore || local,
          caseId: run.caseId || run.caseMeta?.caseId,
          role: run.answers?.role || "Juge",
          facts: caseData?.resume || "",
          decisionMotivation: run.answers?.decisionMotivation || "",
          decisionDispositif: run.answers?.decisionDispositif || "",
          audience: run.answers?.audience || {},
          language: "fr",
          greffierName,
          chrono: run?.state?.chrono || null,
        });
        setProgress(80);
      } catch (e) {
        console.warn("appeal ia failed", e);
      }

      const scoreGlobal = typeof aiScore?.scoreGlobal === "number" ? aiScore.scoreGlobal : local?.scoreGlobal || 0;
      const scores = aiScore?.scores || local?.scores || {};
      const flags = aiScore
        ? toFlagsFromAi(aiScore)
        : (local?.flags || []).map((x) => ({ level: "warn", label: x, detail: "" }));
      const debrief = aiScore ? toDebriefFromAi(aiScore) : local?.debrief || [];

      const finalRun = {
        ...run,
        scoreGlobal,
        scores,
        flags,
        debrief,
        ai: aiScore || null,
        appeal: appeal || null,
        finishedAt: nowIso(),
        caseMeta: {
          ...(run.caseMeta || {}),
          caseId: run.caseId || run.caseMeta?.caseId,
          caseData,
        },
      };

      addRun(finalRun);
      updateGlobalStats(finalRun);

      setProgress(100);
      navigate("/justice-lab/results", { state: { runId: finalRun.runId, runData: finalRun } });
    } catch (e) {
      console.error(e);
      setScoreError("Erreur scoring. Vérifie le token, réseau ou endpoint /justice-lab/score.");
    } finally {
      setIsScoring(false);
    }
  };

  const roleCard = (r, idx) => {
    const active = (run.answers?.role || "Juge") === r.id;
    return (
      <button
        key={`${r.id}-${idx}`}
        type="button"
        disabled={isCoop}
        onClick={() => {
          if (isCoop) return;
          saveRunState({
            ...run,
            answers: { ...run.answers, role: r.id },
          });
        }}
        className={`w-full text-left rounded-2xl border p-4 transition ${
          active
            ? "border-emerald-500/50 bg-emerald-500/10"
            : isCoop
            ? "border-white/10 bg-white/5 opacity-70 cursor-not-allowed"
            : "border-white/10 bg-white/5 hover:bg-white/10"
        }`}
      >
        <div className="text-sm font-semibold text-slate-100">{r.label}</div>
        <div className="text-xs text-slate-300 mt-1">{r.desc}</div>
      </button>
    );
  };

  const procedureCard = (c, idx) => {
    const active = run.answers?.procedureChoice === c.id;
    return (
      <button
        key={`${c.id}-${idx}`}
        type="button"
        onClick={() =>
          saveRunState({
            ...run,
            answers: { ...run.answers, procedureChoice: c.id },
          })
        }
        className={`w-full text-left rounded-2xl border p-4 transition ${
          active ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-100">
            {c.id}. {c.title}
          </div>
          <div className="text-[11px] text-slate-400">{c.hint}</div>
        </div>
      </button>
    );
  };

  const recentAudit = useMemo(() => {
    const arr = Array.isArray(audit) ? audit : [];
    return arr.slice(0, 12).map((a) => ({
      at: a.ts || a.at || nowIso(),
      kind: a.type || a.kind || "Action",
      action: a.title || a.action || a.label || "Action",
      detail: a.detail || a.description || "",
    }));
  }, [audit]);

  const getDecisionForObj = (objId) => {
    const decisions = Array.isArray(run?.answers?.audience?.decisions) ? run.answers.audience.decisions : [];
    return decisions.find((d) => d.objectionId === objId) || null;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">
              <Link to="/justice-lab" className="hover:underline">
                Justice Lab
              </Link>{" "}
              <span className="opacity-60">/</span>{" "}
              <span className="text-slate-200 font-semibold">{caseData.caseId}</span>
              {caseData?.meta?.seed ? (
                <span className="ml-2 text-[11px] text-slate-500">seed: {String(caseData.meta.seed).slice(0, 22)}</span>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold mt-2">{caseData.titre}</h1>
            <p className="text-sm text-slate-300 mt-1">{caseData.resume}</p>

            {/* ✅ Greffier inline */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="text-[11px] text-slate-400">Greffier :</div>
              <input
                value={greffierName}
                onChange={(e) => setGreffierName(e.target.value)}
                className="h-9 w-[220px] rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                placeholder="Nom du greffier"
              />
              <button
                type="button"
                className="h-9 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                onClick={() => navigate("/justice-lab/journal")}
              >
                📓 Journal (PV greffier)
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                onClick={() => navigate("/justice-lab/results")}
              >
                🧪 Mode Examen (résultats)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={() => navigate("/justice-lab")}
            >
              Quitter
            </button>
          </div>
        </div>

        {/* Didacticiel top */}
        <div className="mt-6">
          <PedagogyPanel caseData={caseData} compact />
        </div>

        {/* top controls */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full border border-white/10 bg-white/5">
              Étape: <span className="text-slate-100 font-semibold">{step}</span>
            </span>

            {step === "AUDIENCE" ? (
              <>
                <span className="text-xs px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                  Gestion d’audience: {run?.scores?.audience ?? 0}/100
                </span>
                <span className="text-xs px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-200">
                  ⏱️ {chronoText} {chrono?.running ? "• en cours" : "• pause"}
                </span>
              </>
            ) : null}

            {excludedCount ? (
              <span className="text-xs px-3 py-1 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-200">
                Pièces écartées: {excludedCount}
              </span>
            ) : null}

            {admittedLateCount ? (
              <span className="text-xs px-3 py-1 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-200">
                Tardives admises: {admittedLateCount}
              </span>
            ) : null}

            {tasksCount ? (
              <span className="text-xs px-3 py-1 rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-200">
                Actions: {tasksCount}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={isScoring || isLoadingAudience || step === "MODE"}
              onClick={goPrev}
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
            >
              ← Retour
            </button>

            <button
              disabled={isScoring || isLoadingAudience}
              onClick={goNext}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-500 hover:from-emerald-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm"
            >
              {step === "DECISION" ? "Terminer & scorer" : "Continuer →"}
            </button>
          </div>
        </div>

        {/* content */}
        <div className="mt-6">
          {/* MODE */}
          {step === "MODE" && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Formation continue</div>
                <h2 className="mt-2 text-lg font-semibold text-slate-100">Justice Lab — Simulateur d’audience</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Objectif : professionnaliser le personnel judiciaire par des audiences réalistes, mesurées (scoring),
                  et documentées (PV / journal). Choisis un mode : solo (IA joue les autres rôles) ou co‑op (2–3 joueurs).
                </p>

                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="text-xs font-semibold text-slate-100">🧩 Format de simulation</div>
                  <div className="mt-1 text-xs text-slate-300">
                    Audience unique (1 audience) ou <b>Procès complet V1</b> (multi-audiences).
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`px-3 py-2 rounded-xl border text-xs transition ${
                        !trialV1
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-100"
                      }`}
                      onClick={() => {
                        setTrialV1(false);
                        const next = {
                          ...run,
                          state: {
                            ...(run.state || {}),
                            settings: { ...(run.state?.settings || {}), trialV1: false },
                          },
                        };
                        saveRunState(next);
                        setRun(next);
                      }}
                    >
                      Audience unique
                    </button>

                    <button
                      type="button"
                      className={`px-3 py-2 rounded-xl border text-xs transition ${
                        trialV1
                          ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-100"
                          : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-100"
                      }`}
                      onClick={() => {
                        setTrialV1(true);
                        let next = {
                          ...run,
                          state: {
                            ...(run.state || {}),
                            settings: { ...(run.state?.settings || {}), trialV1: true },
                          },
                        };
                        next = initTrialV1(next, caseData);
                        saveRunState(next);
                        setRun(next);
                      }}
                    >
                      Procès complet V1
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-emerald-200">🧠 Solo (IA multi‑rôles)</div>
                        <div className="mt-1 text-xs text-slate-300">
                          Tu choisis ton rôle. L’IA joue les autres rôles et (si tu n’es pas juge) l’IA‑juge tranche.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition text-sm font-semibold"
                        onClick={() => {
                          const next = {
                            ...run,
                            step: "ROLE",
                            state: {
                              ...(run.state || {}),
                              session: {
                                ...(run.state?.session || {}),
                                mode: "SOLO_AI",
                                roomId: null,
                                isHost: false,
                                version: 0,
                                lastSyncAt: null,
                              },
                            },
                          };
                          saveRunState(next);
                          setStep("ROLE");
                        }}
                      >
                        Choisir
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                    <div className="text-sm font-semibold text-indigo-200">🤝 Co‑op (2–3 joueurs)</div>
                    <div className="mt-1 text-xs text-slate-300">
                      Un joueur crée une salle (code). Les autres rejoignent et choisissent un rôle.
                      <span className="text-slate-200 font-semibold"> Le juge valide les décisions</span>.
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none focus:border-indigo-400/50"
                        placeholder="Nom (ex: Me KABONGO)"
                        value={displayNameInput}
                        onChange={(e) => setDisplayNameInput(e.target.value)}
                      />
                      <input
                        className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none focus:border-indigo-400/50"
                        placeholder="Code salle (pour rejoindre)"
                        value={roomCodeInput}
                        onChange={(e) => setRoomCodeInput(e.target.value)}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {ROLES.map((r, idx) => (
                        <button
                          key={`${r.id}-${idx}`}
                          type="button"
                          className={`px-3 py-2 rounded-xl border text-xs transition ${
                            (run.answers?.role || "Juge") === r.id
                              ? "border-indigo-500/70 bg-indigo-500/10 text-indigo-100"
                              : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-100"
                          }`}
                          onClick={() => {
                            // role preview (sera verrouillé à la création/join)
                            saveRunState({ answers: { ...(run.answers || {}), role: r.id } });
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    {sessionError ? (
                      <div className="mt-2 text-xs text-rose-300">⚠️ {String(sessionError)}</div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition text-sm font-semibold"
                        onClick={async () => {
                          try {
                            await roomApiCreate({
                              displayName: (displayNameInput || "").trim() || "Joueur",
                              role: (run.answers?.role || "Juge").trim() || "Juge",
                            });
                          } catch (e) {
                            setSessionError(e?.message || "Erreur création salle");
                          }
                        }}
                      >
                        Créer une salle
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm font-semibold"
                        onClick={async () => {
                          try {
                            await roomApiJoin({
                              roomId: (roomCodeInput || "").trim(),
                              displayName: (displayNameInput || "").trim() || "Joueur",
                              role: (run.answers?.role || "Juge").trim() || "Juge",
                            });
                          } catch (e) {
                            setSessionError(e?.message || "Erreur join");
                          }
                        }}
                      >
                        Rejoindre
                      </button>
                    </div>

                    {isCoop && roomId ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                        <div>
                          Salle: <span className="text-slate-100 font-semibold">{roomId}</span> • Rôle: {run.answers?.role}
                        </div>
                        <div className="mt-1">
                          Participants: {(roomInfo?.players || []).map((p) => `${p.role}: ${p.displayName}`).join(" • ") || "-"}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Innovation institutionnelle</div>
                <h3 className="mt-2 text-sm font-semibold text-slate-100">Modules proposés (feuille de route)</h3>
                <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li><b>PV intelligent</b> : le greffier obtient un PV structuré + checklists (incidents, pièces, décisions).</li>
                  <li><b>Compétences</b> : badges (motivation, contradictoire, gestion d'audience), progression par chambre.</li>
                  <li><b>Bibliothèque RDC</b> : modèles d'audience, exceptions classiques, erreurs fréquentes par matière.</li>
                  <li><b>Mode examen</b> : sessions chronométrées + barème, export dossier pédagogique.</li>
                  <li><b>Audit institutionnel</b> : KPI anonymisés (délais simulés, erreurs récurrentes) pour la formation continue.</li>
                </ul>
                <div className="mt-4 text-xs text-slate-400">
                  Astuce : en co‑op, le juge tranche. Les autres rôles proposent des arguments (synchronisés).
                </div>
              </section>
            </div>
          )}



          {/* TRIAL */}
          {step === "TRIAL" && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Procès complet V1</div>
                    <h2 className="mt-2 text-lg font-semibold text-slate-100">Timeline multi-audiences (RDC)</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      Un procès réaliste se déroule en plusieurs audiences. Termine chaque étape pour accéder à la décision finale.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-300">État</div>
                    <div className="text-sm font-semibold text-slate-100">{trialAllDone ? "PRÊT POUR JUGEMENT" : "EN COURS"}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {(run?.state?.trial?.stages || []).map((s) => {
                    const active = s.id === run?.state?.trial?.currentStageId;
                    const statusColor =
                      s.status === "DONE"
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : active
                          ? "border-indigo-500/40 bg-indigo-500/5"
                          : "border-white/10 bg-white/5";

                    return (
                      <div key={s.id} className={`rounded-2xl border p-4 ${statusColor}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{s.title}</div>
                            <div className="text-xs text-slate-300 mt-1">{s.objective}</div>
                            <div className="text-[11px] text-slate-400 mt-2">
                              Statut: <span className="text-slate-200 font-semibold">{s.status}</span>
                              {s.finishedAt ? ` • terminé ${String(s.finishedAt).slice(0, 10)}` : ""}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 min-w-[180px]">
                            <button
                              type="button"
                              className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
                                active ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-800 hover:bg-slate-700"
                              }`}
                              onClick={() => {
                                const next = setCurrentTrialStage(run, s.id);
                                saveRunState(next);
                                setRun(next);
                              }}
                            >
                              {active ? "Étape active" : "Activer"}
                            </button>

                            <button
                              type="button"
                              disabled={isLoadingAudience}
                              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm font-semibold disabled:opacity-60"
                              onClick={() => loadStageAudience(s.id)}
                            >
                              Générer l’audience
                            </button>

                            <button
                              type="button"
                              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm font-semibold"
                              onClick={() => markStageDone(s.id, "Étape validée")}
                            >
                              Marquer terminé
                            </button>
                          </div>
                        </div>

                        {s.audienceScene ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                ✅ Audience prête — {s.audienceScene?.sceneMeta?.tribunal || "Tribunal"} • {s.audienceScene?.turns?.length || 0} tours
                              </div>
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition text-xs font-semibold"
                                onClick={() => {
                                  // ouvrir cette audience
                                  const next = setAudienceSceneOnRun(run, s.audienceScene);
                                  saveRunState(next);
                                  setAudienceScene(s.audienceScene);
                                  setRun(next);
                                  setStep("AUDIENCE");
                                }}
                              >
                                Ouvrir
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition text-sm font-semibold"
                    onClick={advanceToNextStage}
                  >
                    Étape suivante →
                  </button>
                  <button
                    type="button"
                    disabled={!trialAllDone}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition text-sm font-semibold disabled:opacity-60"
                    onClick={() => trialAllDone && setStep("DECISION")}
                  >
                    Passer au jugement
                  </button>
                </div>

                {isLoadingAudience ? (
                  <div className="mt-3">
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500/80 transition-all"
                        style={{ width: `${audienceGenProgress}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-indigo-200">
                      ⏳ Génération… {audienceGenProgress}%
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Calendrier + incidents + PV</div>
                <h3 className="mt-2 text-sm font-semibold text-slate-100">Procédure — calendrier réaliste RDC</h3>
                <p className="mt-2 text-xs text-slate-300">
                  Fixation, renvois, mises en état et audiences. Les incidents peuvent être suggérés (auto) puis consignés.
                </p>

                {/* CALENDRIER */}
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-200 font-semibold">📅 Calendrier procédural</div>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition text-xs font-semibold"
                      onClick={() => {
                        const next0 = initProceduralCalendar(run, caseData);
                        saveRunState(next0);
                        setRun(next0);
                      }}
                    >
                      Init/Sync
                    </button>
                  </div>

                  <div className="mt-2 space-y-2">
                    {(
                      (run?.state?.trial?.calendar?.events || [])
                        .slice()
                        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                        .slice(0, 8)
                    ).map((e) => (
                      <div key={e.id} className="rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-slate-100 font-semibold">{e.date} • {e.label}</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] ${e.status === "DONE" ? "text-emerald-300" : "text-slate-400"}`}>{e.status}</span>
                            {e.status !== "DONE" ? (
                              <button
                                type="button"
                                className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition text-[11px]"
                                onClick={() => {
                                  const next = markCalendarEventDone(run, e.id);
                                  saveRunState(next);
                                  setRun(next);
                                }}
                              >
                                Marquer fait
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {e.detail ? <div className="mt-1 text-[11px] text-slate-400">{e.detail}</div> : null}
                      </div>
                    ))}

                    {!(run?.state?.trial?.calendar?.events || []).length ? (
                      <div className="text-xs text-slate-400">Aucun événement. Clique "Init/Sync".</div>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm font-semibold"
                      onClick={() => {
                        // renvoi rapide à J+7 (heuristique)
                        const last = (run?.state?.trial?.calendar?.events || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-1)[0];
                        const base = last?.date || new Date().toISOString().slice(0, 10);
                        const d = new Date(base);
                        d.setDate(d.getDate() + 7);
                        const next = addCalendarEvent(run, {
                          type: "RENVOI",
                          date: d.toISOString().slice(0, 10),
                          label: "Renvoi",
                          detail: "Renvoi ordonné (motif à préciser).",
                          stageId: run?.state?.trial?.currentStageId || null,
                        });
                        saveRunState(next);
                        setRun(next);
                      }}
                    >
                      + Renvoi (J+7)
                    </button>

                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm font-semibold"
                      onClick={() => {
                        const stageId = run?.state?.trial?.currentStageId || "INTRO";
                        const next = applyAutoIncidents(run, caseData, stageId, { mode: "SUGGEST" });
                        saveRunState(next);
                        setRun(next);
                      }}
                    >
                      ⚖️ Suggérer incidents (auto)
                    </button>

                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition text-sm font-semibold"
                      onClick={() => {
                        const stageId = run?.state?.trial?.currentStageId || "INTRO";
                        const next = applyAutoIncidents(run, caseData, stageId, { mode: "APPLY" });
                        saveRunState(next);
                        setRun(next);
                      }}
                    >
                      ✅ Enregistrer incidents (auto)
                    </button>
                  </div>

                  {/* Incidents list */}
                  <div className="mt-3">
                    <div className="text-xs text-slate-200 font-semibold">Incidents (suggestions / enregistrés)</div>
                    <div className="mt-2 space-y-2">
                      {(run?.state?.trial?.incidents || []).slice().reverse().slice(0, 6).map((i) => (
                        <div key={i.id} className="rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-slate-300">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-slate-100 font-semibold">{i.label}</div>
                            <div className="text-[11px] text-slate-400">{i.status} • {i.stageId}</div>
                          </div>
                          {i.detail ? <div className="mt-1 text-[11px] text-slate-400">{i.detail}</div> : null}
                        </div>
                      ))}
                      {!(run?.state?.trial?.incidents || []).length ? (
                        <div className="text-xs text-slate-400">Aucun incident enregistré/suggéré.</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* PV */}
                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">PV & checklists</div>
                  <h3 className="mt-2 text-sm font-semibold text-slate-100">Greffier — notes rapides</h3>
                  <p className="mt-2 text-xs text-slate-300">
                    Ajoute des notes (PV) rattachées à l’étape active. Elles sont conservées dans le run.
                  </p>
                </div>

                <div className="mt-3">
                  <textarea
                    className="w-full min-h-[110px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                    placeholder="Ex: Incidents soulevés, pièces communiquées, décision sur renvoi, observations du parquet…"
                    value={draftReasoningById.__trial_pv || ""}
                    onChange={(e) => setDraftReasoningById((p) => ({ ...(p || {}), __trial_pv: e.target.value }))}
                  />

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition text-sm font-semibold"
                      onClick={() => {
                        const stageId = run?.state?.trial?.currentStageId || "INTRO";
                        const txt = String(draftReasoningById.__trial_pv || "").trim();
                        if (!txt) return;
                        const next = appendStagePV(run, stageId, { by: greffierName, text: txt });
                        saveRunState(next);
                        setRun(next);
                        setDraftReasoningById((p) => ({ ...(p || {}), __trial_pv: "" }));
                      }}
                    >
                      Ajouter au PV
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(currentTrialStage?.pv || []).slice(0, 8).map((row, i) => (
                      <div key={`${row.ts}-${i}`} className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-slate-100 font-semibold">{row.by || "Greffier"}</div>
                          <div className="text-[11px] text-slate-400">{String(row.ts || "").slice(0, 19).replace("T", " ")}</div>
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">{row.text}</div>
                      </div>
                    ))}
                    {!(currentTrialStage?.pv || []).length ? (
                      <div className="text-xs text-slate-400">Aucune note PV pour l’étape active.</div>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          )}
          {/* ROLE */}
          {step === "ROLE" && (
            <div className="grid gap-4 md:grid-cols-3">
              {ROLES.map(roleCard)}
              <div className="md:col-span-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-200 font-semibold">🎮 Mode “jeu”</div>
                <div className="text-xs text-slate-300 mt-1">
                  {isCoop
                    ? `Salle active: ${roomId || "-"}. Ton rôle est verrouillé par la salle. Le juge valide les décisions.`
                    : "Choisis ton rôle. Le moteur adaptera le feedback (contradictoire, recevabilité, proportionnalité)."}
                </div>
              </div>
            </div>
          )}

          {/* BRIEFING */}
          {step === "BRIEFING" && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold text-slate-100">📌 Faits & parties</h2>
                <p className="text-sm text-slate-300 mt-2">{caseData.resume}</p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {Object.entries(caseData.parties || {}).map(([k, v]) => {
                    const pv = normalizePartyValue(v);
                    return (
                      <div key={k} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                        <div className="text-xs text-slate-400 uppercase tracking-[0.2em]">{k}</div>
                        <div className="text-sm text-slate-100 font-semibold mt-1">{pv.title}</div>
                        {pv.sub ? <div className="text-xs text-slate-300 mt-1">{pv.sub}</div> : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <PedagogyPanel caseData={caseData} />
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h2 className="text-sm font-semibold text-emerald-200">🧾 Pièces au dossier</h2>
                <div className="mt-3 space-y-2">
                  {(caseData.pieces || []).map((p, idx) => (
                    <div key={`${p.id}-${idx}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-100">
                          {p.id} • {p.title}
                        </div>
                        <div className="text-[11px] text-slate-400">{p.type}</div>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">{(p.content || "").slice(0, 180)}…</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* QUALIFICATION */}
          {step === "QUALIFICATION" && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h2 className="text-sm font-semibold text-emerald-200 mb-2">🧠 Qualification</h2>
                <p className="text-xs text-emerald-50/90 mb-3">
                  Décris la qualification, les questions litigieuses, et les garanties (faits → questions → règles → application).
                </p>
                <textarea
                  value={run.answers.qualification}
                  onChange={(e) =>
                    saveRunState({
                      ...run,
                      answers: { ...run.answers, qualification: e.target.value },
                    })
                  }
                  rows={10}
                  className="w-full rounded-2xl border border-emerald-500/30 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  placeholder="Ex: question de recevabilité… droits de défense… délais…"
                />
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold text-slate-100 mb-2">🎯 Axes juridiques</h2>
                <ul className="space-y-2 text-sm text-slate-300">
                  {(caseData.legalIssues || []).map((x, i) => (
                    <li key={i} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                      {x}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {/* PROCEDURE */}
          {step === "PROCEDURE" && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold text-slate-100 mb-2">⚙️ Procédure</h2>
                <p className="text-xs text-slate-300 mb-3">Choisis l’orientation procédurale la plus cohérente.</p>
                <div className="space-y-2">{PROCEDURE_CHOICES.map(procedureCard)}</div>

                <div className="mt-3">
                  <textarea
                    value={run.answers.procedureJustification}
                    onChange={(e) =>
                      saveRunState({
                        ...run,
                        answers: { ...run.answers, procedureJustification: e.target.value },
                      })
                    }
                    rows={5}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                    placeholder="Justifie en 3–6 lignes : garanties, délais, droits, charge de preuve..."
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h2 className="text-sm font-semibold text-emerald-200 mb-2">➡️ Étape suivante : Audience IA</h2>
                <p className="text-sm text-slate-200/90">
                  Après PROCÉDURE, le jeu lance une audience simulée : objections, gestion de débats, pièces tardives,
                  audit log en direct.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isLoadingAudience}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-500 hover:from-emerald-600 hover:to-indigo-600 disabled:opacity-60 transition font-semibold"
                    onClick={async () => {
                      await loadAudience();
                      setStep("AUDIENCE");
                    }}
                  >
                    {isLoadingAudience ? "Chargement audience..." : "Lancer l’audience →"}
                  </button>

                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
                    onClick={() => navigate("/justice-lab/audience")}
                  >
                    Ouvrir page Audience
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* AUDIENCE */}
          {step === "AUDIENCE" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">🏛️ Audience simulée</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      Phase interactive: objections + décisions + journal d’audience (audit log) + impact sur pièces.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`px-3 py-2 rounded-xl border text-xs transition ${
                        showPiecesImpact
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                      onClick={() => setShowPiecesImpact((v) => !v)}
                    >
                      Pièces (impact)
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-2 rounded-xl border text-xs transition ${
                        showAudit
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                      onClick={() => setShowAudit((v) => !v)}
                    >
                      Audit log
                    </button>
                  </div>
                </div>

                {/* ✅ Chrono + Incidents */}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-indigo-200/80">⏱️ Chronomètre audience</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-2xl font-bold text-slate-100">{chronoText}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                          onClick={chronoStart}
                        >
                          Start
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                          onClick={chronoPause}
                        >
                          Pause
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                          onClick={chronoReset}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-300">
                      Le chrono est automatiquement enregistré dans le journal (PV) pour la notation “magistrature”.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/80">⚖️ Incidents procéduraux</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                        onClick={() => addProceduralIncident("NULLITE")}
                      >
                        Nullité
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                        onClick={() => addProceduralIncident("RENVOI")}
                      >
                        Renvoi
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                        onClick={() => addProceduralIncident("JONCTION")}
                      >
                        Jonction
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                        onClick={() => addProceduralIncident("DISJONCTION")}
                      >
                        Disjonction
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                        onClick={() => addProceduralIncident("COMMUNICATION_PIECES")}
                      >
                        Communication pièces
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-300">
                      Chaque clic est inscrit au journal d’audience + ajoute une tâche “à motiver”.
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Dialogue (extraits)</div>
                    <div className="mt-2 space-y-2 max-h-[280px] overflow-auto pr-1">
                      {(audienceScene?.turns || []).map((t, i) => (
                        <div key={i} className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                          <div className="text-xs text-slate-400">{t.speaker}</div>
                          <div className="text-sm text-slate-100 mt-1">{t.text}</div>
                        </div>
                      ))}
                      {!audienceScene?.turns?.length ? <div className="text-sm text-slate-400">Chargement...</div> : null}
                    </div>
                  </div>

                  {showPiecesImpact && (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Pièces & incidents</div>

                      <div className="mt-2 space-y-3">
                        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                          <div className="text-xs text-slate-300 font-semibold">🧾 Pièces écartées</div>
                          {excludedPieces.length ? (
                            <ul className="mt-2 text-xs text-slate-200 space-y-1">
                              {excludedPieces.slice(0, 6).map((p, idx) => (
                                <li key={`${p.id}-${idx}`}>• {p.title}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-xs text-slate-400">Aucune.</div>
                          )}
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                          <div className="text-xs text-slate-300 font-semibold">📎 Pièces tardives admises</div>
                          {admittedLatePieces.length ? (
                            <ul className="mt-2 text-xs text-slate-200 space-y-1">
                              {admittedLatePieces.slice(0, 6).map((p, idx) => (
                                <li key={`${p.id}-${idx}`}>• {p.title}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-xs text-slate-400">Aucune.</div>
                          )}
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                          <div className="text-xs text-slate-300 font-semibold">✅ Actions / tâches</div>
                          {tasks.length ? (
                            <ul className="mt-2 text-xs text-slate-200 space-y-1">
                              {tasks.slice(0, 8).map((t, i) => (
                                <li key={i}>• {t.label || t.type}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-xs text-slate-400">Aucune.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {showAudit && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Journal d’audience (live)</div>
                    {recentAudit.length ? (
                      <div className="mt-2 space-y-2 max-h-[360px] overflow-auto pr-1">
                        {recentAudit.map((a, idx) => (
                          <div key={idx} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-slate-200">
                                <span className="text-slate-400">{formatTime(a.at)}</span> •{" "}
                                <span className="text-slate-100 font-semibold">{a.kind}</span>
                              </div>
                              <div className="text-[11px] text-slate-400">{a.action}</div>
                            </div>
                            {a.detail ? <div className="mt-1 text-xs text-slate-300">{a.detail}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-400">Aucune action enregistrée pour le moment.</div>
                    )}
                  </div>
                )}
              </section>

              {/* Objections */}
              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h2 className="text-sm font-semibold text-emerald-200 mb-2">🎯 Objections à trancher</h2>
                <p className="text-xs text-emerald-50/90 mb-3">
                  Choisis une décision. La motivation est <b>verrouillée</b> : clique “Modifier” pour éditer puis “Enregistrer”.
                </p>

                {(audienceScene?.objections || []).length === 0 ? (
                  <div className="text-sm text-slate-300">Aucune objection.</div>
                ) : (
                  <div className="space-y-3">
                    {(audienceScene?.objections || []).map((obj, idx) => {
                      const d = getDecisionForObj(obj.id);
                      const current = { decision: d?.decision || "", reasoning: d?.reasoning || "" };

                      const isEditing = !!editReasoningById[obj.id];
                      const role = (run.answers?.role || "").trim() || "Juge";
                      const best = bestChoiceForRole(obj, role);

                      return (
                        <div key={`${obj.id}-${idx}`} className="rounded-2xl border border-emerald-500/30 bg-slate-950/60 p-4">
                          <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/80">
                            {obj.by} • {obj.id}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-100">{obj.title}</div>
                          <div className="mt-2 text-sm text-slate-200/90">{obj.statement}</div>

                          <div className="mt-2 text-[11px] text-slate-300">
                            IA instant (rôle {role}) : option souvent la plus sûre →{" "}
                            <span className="text-slate-100 font-semibold">“{best}”</span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {(obj.options || ["Accueillir", "Rejeter", "Demander précision"]).map((opt) => {
                              const active = (current?.decision || "") === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`px-3 py-2 rounded-xl border text-xs transition ${
                                    active
                                      ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-100"
                                      : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-100"
                                  }`}
                                  onClick={() => {
                                    const rr = isEditing
                                      ? (draftReasoningById[obj.id] ?? current?.reasoning ?? "")
                                      : (current?.reasoning || "");
                                    handleDecisionClick(obj, opt, rr);
                                  }}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[11px] text-slate-400">
                                Motivation (2–5 phrases). {isEditing ? "✍️ édition" : "🔒 verrouillé"}
                              </div>

                              {!isEditing ? (
                                <button
                                  type="button"
                                  className="text-[11px] px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
                                  onClick={() => {
                                    setEditReasoningById((mm) => ({ ...(mm || {}), [obj.id]: true }));
                                    setDraftReasoningById((mm) => ({ ...(mm || {}), [obj.id]: current?.reasoning || "" }));
                                  }}
                                >
                                  Modifier
                                </button>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="text-[11px] px-2 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 transition text-emerald-100"
                                    onClick={() => {
                                      const val = (draftReasoningById[obj.id] ?? current?.reasoning ?? "").trim();
                                      const chosen = (current?.decision || "").trim() || "Demander précision";
                                      handleDecisionClick(obj, chosen, val);
                                      setEditReasoningById((mm) => ({ ...(mm || {}), [obj.id]: false }));
                                    }}
                                  >
                                    Enregistrer
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[11px] px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
                                    onClick={() => {
                                      setEditReasoningById((mm) => ({ ...(mm || {}), [obj.id]: false }));
                                      setDraftReasoningById((mm) => {
                                        const next = { ...(mm || {}) };
                                        delete next[obj.id];
                                        return next;
                                      });
                                    }}
                                  >
                                    Annuler
                                  </button>
                                </div>
                              )}
                            </div>

                            <textarea
                              value={
                                isEditing
                                  ? (draftReasoningById[obj.id] ?? current?.reasoning ?? "")
                                  : (current?.reasoning || "")
                              }
                              onChange={(e) => {
                                if (!isEditing) return;
                                setDraftReasoningById((mm) => ({ ...(mm || {}), [obj.id]: e.target.value }));
                              }}
                              rows={3}
                              disabled={!isEditing}
                              className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm text-slate-100 outline-none ${
                                isEditing
                                  ? "border-emerald-500/30 bg-slate-950/70 focus:border-emerald-400"
                                  : "border-white/10 bg-slate-950/40 opacity-80 cursor-not-allowed"
                              }`}
                              placeholder="Justification courte : contradictoire, pertinence, régularité, droits de défense…"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* DECISION */}
          {step === "DECISION" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Jugement motivé + voie d’appel (auto)</div>
                    <div className="text-sm text-slate-200 mt-1">
                      Génère une structure réaliste (RDC) à partir des étapes, PV et incidents.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition text-sm font-semibold"
                      onClick={() => {
                        const draft = buildJudgmentDraft({ caseData, run });
                        const next = {
                          ...run,
                          answers: {
                            ...(run.answers || {}),
                            decisionMotivation: draft.motivation + "\n\n" + draft.voiesRecours,
                            decisionDispositif: draft.dispositif,
                          },
                        };
                        saveRunState(next);
                        setRun(next);
                      }}
                    >
                      ⚡ Auto-structurer
                    </button>

                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition text-sm font-semibold"
                      onClick={() => {
                        const ap = buildAppealDraft({ caseData, run });
                        const next = {
                          ...run,
                          appeal: {
                            createdAt: new Date().toISOString(),
                            memo: ap.memo,
                            grounds: ap.grounds,
                            risk: ap.risk,
                            due: ap.due,
                          },
                        };
                        saveRunState(next);
                        setRun(next);
                        // option: orienter vers APPEAL si l'écran existe
                        if (typeof setStep === "function") {
                          // si le module Appeal existe déjà chez toi, on y bascule
                          // sinon on laisse juste le brouillon dans run.appeal
                        }
                      }}
                    >
                      🧩 Générer note d’appel
                    </button>
                  </div>
                </div>

                {run?.appeal?.memo ? (
                  <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                    <div className="font-semibold">Brouillon d’appel prêt (formation)</div>
                    <div className="mt-1 text-amber-50/90">
                      Risque: {String(run.appeal.risk ?? "-")}/10 • Bonus contradictoire: {String(run.appeal.due ?? "-")}/10
                    </div>
                  </div>
                ) : null}
              </div>

              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h2 className="text-sm font-semibold text-emerald-200 mb-2">🧾 Motivation</h2>
                <p className="text-xs text-emerald-50/90 mb-3">Faits → Questions → Droit → Application → Conclusion</p>

                <textarea
                  value={run.answers.decisionMotivation}
                  onChange={(e) =>
                    saveRunState({
                      ...run,
                      answers: { ...run.answers, decisionMotivation: e.target.value },
                    })
                  }
                  rows={10}
                  className="w-full rounded-2xl border border-emerald-500/30 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  placeholder="Attendu que… Considérant que… Au regard de…"
                  disabled={isScoring}
                />

                <div className="mt-4">
                  <PedagogyPanel caseData={caseData} compact />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4">
                <h2 className="text-sm font-semibold text-slate-100 mb-2">Dispositif</h2>

                <textarea
                  value={run.answers.decisionDispositif}
                  onChange={(e) =>
                    saveRunState({
                      ...run,
                      answers: { ...run.answers, decisionDispositif: e.target.value },
                    })
                  }
                  rows={10}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                  placeholder="Par ces motifs… Le tribunal…"
                  disabled={isScoring}
                />

                {isScoring ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-slate-300">Scoring en cours…</div>
                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-2 bg-emerald-500/80" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2">{progress}%</div>
                  </div>
                ) : null}

                {scoreError ? (
                  <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                    {scoreError}
                  </div>
                ) : null}

                {appealError ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    {appealError}
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
