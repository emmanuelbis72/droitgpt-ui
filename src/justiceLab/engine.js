// src/justiceLab/engine.js
// V6 ULTRA PRO — Justice Lab Engine (offline/hybride)
// Patch: support effects.risk {dueProcessBonus, appealRiskPenalty}
// + fallback meta robuste + pieces status amélioré

export const STEPS = [
  "MODE",
  "ROLE",
  "BRIEFING",
  "QUALIFICATION",
  "PROCEDURE",
  "AUDIENCE",
  "DECISION",
  "SCORE",
  "APPEAL",
  "RESULT",
];

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

function uniq(arr) {
  return Array.from(new Set((arr || []).map(String)));
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
    },

    startedAt: nowISO(),
    finishedAt: null,
    step: "MODE",

    eventCard,

    answers: {
      role: "Juge", // "Juge" | "Procureur" | "Avocat"
      qualification: "",
      procedureChoice: null,
      procedureJustification: "",
      audience: {
        scene: null,
        decisions: [], // [{objectionId, decision, reasoning, ts, role, microScore, effects}]
      },
      decisionMotivation: "",
      decisionDispositif: "",
    },

    // état runtime
    state: {
      // session multi / solo-ai
      session: {
        mode: "SOLO_AI", // "SOLO_AI" | "COOP"
        roomId: null,
        participantId: null,
        displayName: "",
        isHost: false,
        version: 0,
        lastSyncAt: null,
      },
      excludedPieceIds: [],
      admittedLatePieceIds: [],
      pendingTasks: [],
      auditLog: [],
      riskModifiers: {
        appealRiskPenalty: 0,
        dueProcessBonus: 0,
      },
      _audienceMicro: 0, // cumul pour scoring
      chrono: { running: false, startedAt: null, elapsedMs: 0 },
    },

    // scoring local (fallback si IA backend absente)
    scores: {
      qualification: 0,
      procedure: 0,
      audience: 0,
      droits: 0,
      motivation: 0,
    },

    flags: [],
    debrief: [],
    scoreGlobal: 0,

    ai: null,
    appeal: null,
  };
}

/* =========================================================
   PIECES — statut (OK / EXCLUDEE / TARDIVE_ADMISE)
========================================================= */
export function getEffectivePieces(run, caseData) {
  const pieces = Array.isArray(caseData?.pieces) ? caseData.pieces : [];
  const excluded = new Set(run?.state?.excludedPieceIds || []);
  const admittedLate = new Set(run?.state?.admittedLatePieceIds || []);

  return pieces.map((p, idx) => {
    const id = p.id || `P${idx + 1}`;
    return {
      ...p,
      id,
      status: excluded.has(id) ? "EXCLUDEE" : admittedLate.has(id) ? "TARDIVE_ADMISE" : "OK",
      reliability: Number.isFinite(Number(p?.reliability)) ? Number(p.reliability) : undefined,
      isLate: Boolean(p?.isLate || p?.late),
    };
  });
}

export function getPiecesStatusSummary(run, caseData) {
  const eff = getEffectivePieces(run, caseData);
  const admittedLate = eff.filter((p) => p.status === "TARDIVE_ADMISE");
  const excluded = eff.filter((p) => p.status === "EXCLUDEE");
  const ok = eff.filter((p) => p.status === "OK");
  return {
    ok,
    admittedLate,
    excluded,
    counts: { ok: ok.length, admittedLate: admittedLate.length, excluded: excluded.length, total: eff.length },
  };
}

/* =========================================================
   AUDIENCE — Templates + Merge IA
========================================================= */
export function mergeAudienceWithTemplates(caseData, apiData) {
  const templates = Array.isArray(caseData?.objectionTemplates) ? caseData.objectionTemplates : [];

  const tribunal = safeStr(caseData?.meta?.tribunal || caseData?.tribunal || "Tribunal", 60);
  const chambre = safeStr(caseData?.meta?.chambre || caseData?.chambre || "Audience", 80);
  const ville = safeStr(caseData?.meta?.city || caseData?.meta?.ville || caseData?.city || "RDC", 40);

  const sceneMeta = {
    tribunal,
    chambre,
    ville,
    date: nowISO().slice(0, 10),
    dossier: safeStr(caseData?.caseId || "DOSSIER", 40),
    audienceType: safeStr(caseData?.typeAudience || "Audience simulée", 60),
    phases: [
      { id: "ouverture", title: "Ouverture et vérifications" },
      { id: "incidents", title: "Incidents / Exceptions / Objections" },
      { id: "debats", title: "Débats au fond" },
      { id: "cloture", title: "Clôture et mise en délibéré" },
    ],
  };

  const turns =
    (Array.isArray(apiData?.turns) && apiData.turns) ||
    [
      { speaker: "Greffier", text: "Affaire appelée, parties présentes." },
      { speaker: "Juge", text: "L'audience est ouverte." },
      { speaker: "Procureur", text: "Le ministère public présente ses réquisitions." },
      { speaker: "Avocat", text: "La défense soulève des incidents et répond au fond." },
    ];

  const apiObs = Array.isArray(apiData?.objections) ? apiData.objections : [];
  const merged = [];

  // 1) objections IA
  for (let i = 0; i < apiObs.length; i++) {
    const o = apiObs[i] || {};
    merged.push({
      id: safeStr(o.id || `OBJ${i + 1}`, 32),
      by: safeStr(o.by || "Avocat", 20),
      title: safeStr(o.title || "Objection", 80),
      statement: safeStr(o.statement || "", 600),
      options: ["Accueillir", "Rejeter", "Demander précision"],
      effects: o.effects || o.effect || null,
      bestChoiceByRole: o.bestChoiceByRole || null,
    });
  }

  // 2) compléter avec templates si IA insuffisant
  for (let j = 0; j < templates.length && merged.length < 4; j++) {
    const t = templates[j] || {};
    merged.push({
      id: safeStr(t.id || `OBJ_TPL_${j + 1}`, 32),
      by: safeStr(t.by || "Avocat", 20),
      title: safeStr(t.title || "Objection", 80),
      statement: safeStr(t.statement || "", 600),
      options: ["Accueillir", "Rejeter", "Demander précision"],
      effects: t.effects || t.effect || null,
      bestChoiceByRole: t.bestChoiceByRole || null,
    });
  }

  return {
    sceneMeta,
    turns: turns.slice(0, 12).map((t) => ({
      speaker: safeStr(t?.speaker || "Juge", 20),
      text: safeStr(t?.text || "", 900),
      ts: nowISO(),
    })),
    objections: merged.slice(0, 10),
  };
}

export function setAudienceScene(run, scene) {
  const next = structuredCloneSafe(run);
  next.answers = next.answers || {};
  next.answers.audience = next.answers.audience || { decisions: [], scene: null };
  next.answers.audience.scene = scene || null;

  pushAudit(next, {
    type: "AUDIENCE_SCENE_SET",
    title: "Scène d’audience initialisée",
    detail: scene?.sceneMeta?.tribunal ? `${scene.sceneMeta.tribunal} — ${scene.sceneMeta.chambre}` : "Audience",
  });

  return next;
}

/* =========================================================
   AUDIENCE — Decision + effets + audit
========================================================= */
export function applyAudienceDecision(run, payload) {
  const next = structuredCloneSafe(run);

  const objectionId = safeStr(payload?.objectionId || "", 64);
  const decision = safeStr(payload?.decision || "", 32);
  const reasoning = safeStr(payload?.reasoning || "", 1400);
  const role = safeStr(payload?.role || next?.answers?.role || "Juge", 24);

  if (!objectionId || !decision) return next;

  next.answers = next.answers || {};
  next.answers.audience = next.answers.audience || { decisions: [], scene: null };
  const decisions = Array.isArray(next.answers.audience.decisions) ? next.answers.audience.decisions : [];

  const idx = decisions.findIndex((d) => d.objectionId === objectionId);
  const microScore = computeMicroScore(decision, reasoning);

  // ✅ conserver les effets dans la décision (pièces/renvoi/etc)
  const effects = payload?.effects || payload?.effect || null;
  const row = { objectionId, decision, reasoning, role, microScore, ts: nowISO(), effects: effects || null };

  if (idx >= 0) decisions[idx] = row;
  else decisions.push(row);

  next.answers.audience.decisions = decisions;

  next.state = next.state || {};
  next.state._audienceMicro = safeNum(next.state._audienceMicro) + microScore;

  if (effects && typeof effects === "object") {
    applyEffectsByDecision(next, effects, decision);
  }

  pushAudit(next, {
    type: "AUDIENCE_DECISION",
    title: `Objection ${objectionId} — ${decision}`,
    detail: reasoning ? reasoning.slice(0, 260) : "(sans motif)",
    meta: {
      role,
      microScore,
      excludedPieceIds: next?.state?.excludedPieceIds || [],
      admittedLatePieceIds: next?.state?.admittedLatePieceIds || [],
      dueProcessBonus: next?.state?.riskModifiers?.dueProcessBonus || 0,
      appealRiskPenalty: next?.state?.riskModifiers?.appealRiskPenalty || 0,
    },
  });

  next.scores = next.scores || {};
  next.scores.audience = computeAudienceScore(next);

  return next;
}

function computeMicroScore(decision, reasoning) {
  const d = String(decision || "").toLowerCase();
  const base = d.includes("demander") ? 9 : d.includes("accue") || d.includes("rej") ? 10 : 6;
  const text = String(reasoning || "").trim();
  const bonusLen = clamp(Math.floor(text.length / 160), 0, 6);
  const bonusStruct = /fait|droit|motif|attendu|considérant|considérant que/i.test(text) ? 2 : 0;
  return clamp(base + bonusLen + bonusStruct, 0, 18);
}

function applyEffectsByDecision(run, effects, decision) {
  const d = String(decision || "").toLowerCase();

  let branch = null;
  if (d.includes("accue")) branch = effects.onAccueillir || null;
  else if (d.includes("rej")) branch = effects.onRejeter || null;
  else if (d.includes("demander") || d.includes("préc") || d.includes("prec")) branch = effects.onDemander || null;

  const eff = branch || effects;

  run.state = run.state || {};
  run.state.excludedPieceIds = Array.isArray(run.state.excludedPieceIds) ? run.state.excludedPieceIds : [];
  run.state.admittedLatePieceIds = Array.isArray(run.state.admittedLatePieceIds) ? run.state.admittedLatePieceIds : [];
  run.state.pendingTasks = Array.isArray(run.state.pendingTasks) ? run.state.pendingTasks : [];
  run.state.riskModifiers = run.state.riskModifiers || { appealRiskPenalty: 0, dueProcessBonus: 0 };

  if (Array.isArray(eff.excludePieceIds)) {
    for (const id of eff.excludePieceIds) if (id) run.state.excludedPieceIds.push(String(id));
  }
  if (Array.isArray(eff.admitLatePieceIds)) {
    for (const id of eff.admitLatePieceIds) if (id) run.state.admittedLatePieceIds.push(String(id));
  }

  if (Number.isFinite(Number(eff.dueProcessBonus))) {
    run.state.riskModifiers.dueProcessBonus += Number(eff.dueProcessBonus);
  }
  if (eff.risk && typeof eff.risk === "object") {
    if (Number.isFinite(Number(eff.risk.dueProcessBonus))) {
      run.state.riskModifiers.dueProcessBonus += Number(eff.risk.dueProcessBonus);
    }
    if (Number.isFinite(Number(eff.risk.appealRiskPenalty))) {
      run.state.riskModifiers.appealRiskPenalty += Number(eff.risk.appealRiskPenalty);
    }
  } else if (d.includes("demander")) {
    run.state.riskModifiers.dueProcessBonus += 1;
  }

  if (eff.addTask && typeof eff.addTask === "object") {
    run.state.pendingTasks.push({ id: uid("task"), ts: nowISO(), ...eff.addTask });
  }
  if (eff.clarification && typeof eff.clarification === "object") {
    run.state.pendingTasks.push({ id: uid("task"), ts: nowISO(), ...eff.clarification });
  }

  run.state.excludedPieceIds = uniq(run.state.excludedPieceIds);
  run.state.admittedLatePieceIds = uniq(run.state.admittedLatePieceIds);
  run.state.pendingTasks = run.state.pendingTasks.slice(0, 60);
}

function computeAudienceScore(run) {
  const decisions = run?.answers?.audience?.decisions || [];
  const n = Array.isArray(decisions) ? decisions.length : 0;

  const micro = safeNum(run?.state?._audienceMicro);
  const base = n === 0 ? 0 : clamp(Math.round((micro / (n * 18)) * 100), 0, 100);

  const due = safeNum(run?.state?.riskModifiers?.dueProcessBonus);
  const bonus = clamp(due * 2, 0, 12);

  const appealPen = safeNum(run?.state?.riskModifiers?.appealRiskPenalty);
  const pen = clamp(appealPen * 2, 0, 12);

  return clamp(base + bonus - pen, 0, 100);
}

/* =========================================================
   SCORING LOCAL (fallback)
========================================================= */
export function scoreRun(run) {
  const next = structuredCloneSafe(run);

  const qual = clamp(Math.min(100, Math.floor((safeStr(next?.answers?.qualification).length / 18) * 10)), 0, 100);
  const proc = next?.answers?.procedureChoice ? 60 : 30;
  const mot = clamp(Math.min(100, Math.floor((safeStr(next?.answers?.decisionMotivation).length / 28) * 10)), 0, 100);

  const aud = typeof next?.scores?.audience === "number" ? next.scores.audience : computeAudienceScore(next);
  const droits = clamp(40 + safeNum(next?.state?.riskModifiers?.dueProcessBonus) * 3, 0, 100);

  next.scores = next.scores || {};
  next.scores.qualification = qual;
  next.scores.procedure = clamp(proc, 0, 100);
  next.scores.audience = clamp(aud, 0, 100);
  next.scores.motivation = clamp(mot, 0, 100);
  next.scores.droits = clamp(droits, 0, 100);

  const scoreGlobal = Math.round(
    next.scores.qualification * 0.22 +
      next.scores.procedure * 0.18 +
      next.scores.audience * 0.24 +
      next.scores.droits * 0.16 +
      next.scores.motivation * 0.20
  );

  next.scoreGlobal = clamp(scoreGlobal, 0, 100);

  next.flags = [];
  if (next.scores.audience < 35) next.flags.push("Audience faible: manque de gestion des débats/objections");
  if (next.scores.motivation < 35) next.flags.push("Motivation insuffisante");
  if (next.scores.droits < 35) next.flags.push("Garanties procédurales à renforcer");

  next.debrief = [
    `Score global (fallback): ${next.scoreGlobal}/100`,
    `Audience: ${next.scores.audience}/100 — Qualification: ${next.scores.qualification}/100`,
    `Procédure: ${next.scores.procedure}/100 — Droits: ${next.scores.droits}/100 — Motivation: ${next.scores.motivation}/100`,
  ];

  return {
    scoreGlobal: next.scoreGlobal,
    scores: next.scores,
    flags: next.flags,
    debrief: next.debrief,
  };
}

/* =========================================================
   AUDIT LOG
========================================================= */
function pushAudit(run, evt) {
  run.state = run.state || {};
  run.state.auditLog = Array.isArray(run.state.auditLog) ? run.state.auditLog : [];
  run.state.auditLog.unshift({
    id: uid("log"),
    ts: nowISO(),
    ...evt,
  });
  run.state.auditLog = run.state.auditLog.slice(0, 250);
}

/* =========================================================
   CHRONO + INCIDENTS (Mode Greffier)
========================================================= */
export function startChrono(run) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  next.state.chrono = {
    running: true,
    startedAt: nowISO(),
    elapsedMs: safeNum(next.state?.chrono?.elapsedMs),
  };
  pushAudit(next, { type: "CHRONO_START", title: "Chronomètre démarré", detail: "Audience en cours." });
  return next;
}

export function stopChrono(run) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  const prev = next.state.chrono || {};
  next.state.chrono = {
    running: false,
    startedAt: prev.startedAt || null,
    elapsedMs: safeNum(prev.elapsedMs),
  };
  pushAudit(next, { type: "CHRONO_STOP", title: "Chronomètre arrêté", detail: "Audience suspendue/terminée." });
  return next;
}

export function setChronoElapsed(run, elapsedMs) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  next.state.chrono = next.state.chrono || { running: false, startedAt: null, elapsedMs: 0 };
  next.state.chrono.elapsedMs = safeNum(elapsedMs);
  return next;
}

export function recordIncident(run, payload) {
  const next = structuredCloneSafe(run);
  const type = safeStr(payload?.type || payload?.incidentType || "incident", 32);
  const detail = safeStr(payload?.detail || payload?.text || "", 1200);
  const by = safeStr(payload?.by || payload?.role || next?.answers?.role || "Greffier", 24);

  next.state = next.state || {};
  next.state.riskModifiers = next.state.riskModifiers || { appealRiskPenalty: 0, dueProcessBonus: 0 };

  if (type === "renvoi") next.state.riskModifiers.appealRiskPenalty += 1;
  if (type === "nullite") next.state.riskModifiers.appealRiskPenalty += 2;
  if (type === "communication") next.state.riskModifiers.dueProcessBonus += 1;

  pushAudit(next, {
    type: "INCIDENT_PROCEDURAL",
    title: `Incident: ${type}`,
    detail: detail || "(sans détail)",
    meta: { by },
  });
  return next;
}
