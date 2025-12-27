// src/justiceLab/engine.js
// V6 ULTRA PRO — Justice Lab Engine (offline/hybride)
// Patch: support effects.risk {dueProcessBonus, appealRiskPenalty}
// + fallback meta robuste + pieces status amélioré
// + MODE GREFFIER: chrono + incidents + micro-scoring + audit

export const STEPS = ["BRIEFING", "QUALIFICATION", "PROCEDURE", "AUDIENCE", "DECISION", "SCORE", "APPEAL", "RESULT"];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const safeStr = (v, max = 2000) => String(v ?? "").slice(0, max);

function nowISO() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function pickOne(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function structuredCloneSafe(obj) {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj || {}));
  }
}

/* =========================================================
   RUN
========================================================= */
export function createNewRun(caseData) {
  const runId = uid("run");
  const eventCard = pickOne(caseData?.eventsDeck || []) || null;

  return {
    runId,
    caseId: caseData?.caseId || "",
    caseMeta: {
      caseId: caseData?.caseId || "",
      titre: caseData?.titre || "",
      domaine: caseData?.domaine || "",
      niveau: caseData?.niveau || "",
      // (optionnel) caseData complet si tu veux le mettre côté UI
      // caseData: caseData || null,
    },

    startedAt: nowISO(),
    finishedAt: null,
    step: "BRIEFING",

    eventCard,

    answers: {
      role: "Juge", // "Juge" | "Procureur" | "Avocat" | "Greffier"
      qualification: "",
      procedureChoice: null,
      procedureJustification: "",
      audience: {
        scene: null,
        decisions: [], // [{objectionId, decision, reasoning, ts, role, microScore}]
      },
      decisionMotivation: "",
      decisionDispositif: "",
    },

    state: {
      excludedPieceIds: [],
      admittedLatePieceIds: [],
      pendingTasks: [],
      auditLog: [],
      riskModifiers: { appealRiskPenalty: 0, dueProcessBonus: 0 },
      _audienceMicro: 0,

      // ✅ Chronomètre
      chrono: { running: false, startedAt: null, elapsedMs: 0 },

      // ✅ Incidents procéduraux
      incidents: [],
    },

    scores: { qualification: 0, procedure: 0, audience: 0, droits: 0, motivation: 0 },

    flags: [],
    debrief: [],
    scoreGlobal: 0,

    ai: null,
    appeal: null,
  };
}

/* =========================================================
   AUDIENCE TEMPLATE HELPERS
========================================================= */
export function mergeAudienceWithTemplates(caseData, scene) {
  const base = structuredCloneSafe(scene || {});
  const objections = Array.isArray(caseData?.objectionTemplates) ? caseData.objectionTemplates : [];

  base.transcript = Array.isArray(base.transcript) ? base.transcript : [];
  base.objections = Array.isArray(base.objections) ? base.objections : [];

  if (!base.transcript.length) {
    base.transcript = [
      { speaker: "Greffier", text: "Affaire appelée, parties présentes." },
      { speaker: "Juge", text: "Nous allons entendre les parties. Quelles sont vos observations ?" },
    ];
  }

  if (!base.objections.length) {
    base.objections = objections.map((o) => ({
      id: o.id,
      by: o.by,
      title: o.title,
      statement: o.statement,
      options: o.options || ["Accueillir", "Rejeter", "Demander précision"],
      bestChoiceByRole: o.bestChoiceByRole || {},
      effects: o.effects || {},
    }));
  }

  return base;
}

export function setAudienceScene(run, scene) {
  const next = structuredCloneSafe(run);
  next.answers = next.answers || {};
  next.answers.audience = next.answers.audience || { scene: null, decisions: [] };
  next.answers.audience.scene = structuredCloneSafe(scene);
  pushAudit(next, { action: "AUDIENCE_SCENE_SET", title: "Audience initialisée" });
  return next;
}

export function applyAudienceDecision(run, { objectionId, decision, reasoning, role }) {
  const next = structuredCloneSafe(run);
  next.answers = next.answers || {};
  next.answers.audience = next.answers.audience || { scene: null, decisions: [] };

  const scene = next.answers.audience.scene || {};
  const objections = Array.isArray(scene?.objections) ? scene.objections : [];
  const obj = objections.find((o) => o?.id === objectionId) || null;

  // micro-score simple
  let micro = 1;
  if (obj?.bestChoiceByRole?.[role] && String(obj.bestChoiceByRole[role]) === String(decision)) micro = 6;
  else if (decision === "Demander précision") micro = 3;

  next.state._audienceMicro = safeNum(next.state._audienceMicro) + micro;

  // effects sur pièces
  const effects = obj?.effects || {};
  const excludeIds = Array.isArray(effects.excludePieceIds) ? effects.excludePieceIds : [];
  const admitLateIds = Array.isArray(effects.admitLatePieceIds) ? effects.admitLatePieceIds : [];

  next.state.excludedPieceIds = Array.from(new Set([...(next.state.excludedPieceIds || []), ...excludeIds]));
  next.state.admittedLatePieceIds = Array.from(new Set([...(next.state.admittedLatePieceIds || []), ...admitLateIds]));

  // risk modifiers
  const risk = effects.risk || {};
  next.state.riskModifiers = next.state.riskModifiers || { appealRiskPenalty: 0, dueProcessBonus: 0 };
  next.state.riskModifiers.appealRiskPenalty =
    safeNum(next.state.riskModifiers.appealRiskPenalty) + safeNum(risk.appealRiskPenalty);
  next.state.riskModifiers.dueProcessBonus =
    safeNum(next.state.riskModifiers.dueProcessBonus) + safeNum(risk.dueProcessBonus);

  const entry = {
    objectionId,
    decision,
    reasoning: safeStr(reasoning, 1200),
    ts: nowISO(),
    role: role || next.answers.role || "Juge",
    microScore: micro,
    effects,
  };

  next.answers.audience.decisions = [entry, ...(next.answers.audience.decisions || [])].slice(0, 60);

  pushAudit(next, {
    action: "OBJECTION_DECISION",
    title: `Décision sur objection`,
    detail: `${entry.role}: ${entry.decision} (+${micro})`,
  });

  return next;
}

/* =========================================================
   SCORING
========================================================= */
export function scoreRun(run) {
  const next = structuredCloneSafe(run);

  const q = clamp(safeNum(next.scores?.qualification), 0, 100);
  const p = clamp(safeNum(next.scores?.procedure), 0, 100);

  const micro = clamp(safeNum(next.state?._audienceMicro), 0, 120);
  const due = clamp(safeNum(next.state?.riskModifiers?.dueProcessBonus), 0, 20);
  const appealPenalty = clamp(safeNum(next.state?.riskModifiers?.appealRiskPenalty), 0, 20);

  const audience = clamp(50 + micro / 2 + due - appealPenalty, 0, 100);

  next.scores = next.scores || {};
  next.scores.audience = Math.round(audience);

  const global = clamp(Math.round((q + p + next.scores.audience) / 3), 0, 100);
  next.scoreGlobal = global;

  next.flags = [];
  if (appealPenalty >= 10) {
    next.flags.push({ level: "warn", label: "Risque d’appel élevé", detail: "Incidents/contradictoire perfectibles" });
  }

  next.debrief = [
    `Audience: ${next.scores.audience}/100 — Qualification: ${q}/100`,
    `Procédure: ${p}/100 — Bonus contradictoire: ${due} — Risque appel: ${appealPenalty}`,
  ];

  return { scoreGlobal: next.scoreGlobal, scores: next.scores, flags: next.flags, debrief: next.debrief };
}

/* =========================================================
   AUDIT LOG
========================================================= */
function pushAudit(run, evt) {
  run.state = run.state || {};
  run.state.auditLog = Array.isArray(run.state.auditLog) ? run.state.auditLog : [];
  run.state.auditLog.unshift({ id: uid("log"), ts: nowISO(), ...evt });
  run.state.auditLog = run.state.auditLog.slice(0, 250);
}

/* =========================================================
   CHRONO + INCIDENTS (mode Greffier)
========================================================= */
export function startChrono(run) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  next.state.chrono = next.state.chrono || { running: false, startedAt: null, elapsedMs: 0 };
  if (!next.state.chrono.startedAt) next.state.chrono.startedAt = nowISO();
  next.state.chrono.running = true;
  pushAudit(next, { action: "CHRONO_START", title: "Chronomètre démarré" });
  return next;
}

export function stopChrono(run) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  next.state.chrono = next.state.chrono || { running: false, startedAt: null, elapsedMs: 0 };
  next.state.chrono.running = false;
  pushAudit(next, { action: "CHRONO_STOP", title: "Chronomètre arrêté" });
  return next;
}

export function setChronoElapsed(run, elapsedMs) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  next.state.chrono = next.state.chrono || { running: false, startedAt: null, elapsedMs: 0 };
  next.state.chrono.elapsedMs = Math.max(0, safeNum(elapsedMs));
  return next;
}

function incidentPoints(type) {
  const t = String(type || "").toLowerCase();
  if (t === "nullite") return 6;
  if (t === "communication") return 4;
  if (t === "renvoi") return 3;
  if (t === "jonction" || t === "disjonction") return 2;
  return 1;
}

export function recordIncident(run, { type, title, detail, actor }) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  next.state.incidents = Array.isArray(next.state.incidents) ? next.state.incidents : [];

  const pts = incidentPoints(type);
  next.state._audienceMicro = safeNum(next.state._audienceMicro) + pts;

  next.state.riskModifiers = next.state.riskModifiers || { appealRiskPenalty: 0, dueProcessBonus: 0 };
  next.state.riskModifiers.dueProcessBonus = safeNum(next.state.riskModifiers.dueProcessBonus) + Math.min(2, pts);

  const inc = {
    id: uid("inc"),
    ts: nowISO(),
    type: String(type || "incident"),
    title: title || "Incident procédural",
    detail: safeStr(detail, 1200),
    actor: actor || next.answers?.role || "Greffier",
    points: pts,
  };

  next.state.incidents.unshift(inc);
  next.state.incidents = next.state.incidents.slice(0, 80);

  pushAudit(next, {
    action: `INCIDENT_${String(type || "").toUpperCase()}`,
    title: inc.title,
    detail: `${inc.detail}${inc.detail ? " " : ""}(+${pts})`,
  });

  return next;
}

/* =========================================================
   ✅ PIECES STATUS (export manquant pour JusticeLabJournal.jsx)
========================================================= */
export function getEffectivePieces(run, caseData) {
  const pieces = Array.isArray(caseData?.pieces) ? caseData.pieces : [];
  const excluded = new Set(run?.state?.excludedPieceIds || []);
  const admittedLate = new Set(run?.state?.admittedLatePieceIds || []);

  return pieces.map((p, idx) => {
    const id = p?.id || `P${idx + 1}`;
    const status = excluded.has(id) ? "EXCLUDEE" : admittedLate.has(id) ? "TARDIVE_ADMISE" : "OK";
    return { ...p, id, status };
  });
}

export function getPiecesStatusSummary(run, caseData) {
  const effective = getEffectivePieces(run, caseData);

  const ok = effective.filter((p) => p.status === "OK");
  const excluded = effective.filter((p) => p.status === "EXCLUDEE");
  const admittedLate = effective.filter((p) => p.status === "TARDIVE_ADMISE");

  return {
    ok,
    excluded,
    admittedLate,
    counts: {
      total: effective.length,
      ok: ok.length,
      excluded: excluded.length,
      admittedLate: admittedLate.length,
    },
  };
}
