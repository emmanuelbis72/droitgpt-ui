// src/justiceLab/engine.js
// V6 ULTRA PRO — Justice Lab Engine (offline/hybride)
// Patch: support effects.risk {dueProcessBonus, appealRiskPenalty}
// + fallback meta robuste + pieces status amélioré

export const STEPS = [
  "BRIEFING",
  "QUALIFICATION",
  "PROCEDURE",
  "AUDIENCE",
  "DECISION",
  "SCORE",
  "APPEAL",
  "RESULT",
];

// ================================
// ✅ PROCÈS COMPLET — V1+ (multi-audiences + calendrier + plaidoirie)
// NOTE: on conserve le nom TRIAL_V1_STAGES pour compat (runs existants),
// mais la timeline est enrichie: "mise en état" + "plaidoirie".
// Le calendrier procédural permet de simuler fixation, renvois et MEE.
// ================================
export const TRIAL_V1_STAGES = [
  {
    id: "INTRO",
    title: "Audience d’introduction",
    objective:
      "Appel de la cause, identification des parties, vérification des citations/comparutions, police d’audience.",
    minTurns: 32,
    minObjections: 4,
    includeIncidents: true,
  },
  {
    id: "INCIDENTS",
    title: "Audience des incidents / exceptions",
    objective:
      "Traitement des exceptions (incompétence, nullité, irrecevabilité), demandes de renvoi, communication de pièces.",
    minTurns: 42,
    minObjections: 8,
    includeIncidents: true,
  },
  {
    id: "FOND",
    title: "Audience de fond (preuves & débats)",
    objective:
      "Administration de la preuve, interrogatoire/audition, confrontation, discussion structurée des pièces, questions du siège.",
    minTurns: 60,
    minObjections: 10,
    includeIncidents: true,
  },
  {
    id: "MISE_EN_ETAT",
    title: "Mise en état (calendrier & communication)",
    objective:
      "Fixation, renvois, mise en état: communication de pièces, conclusions/observations, mesures d'instruction, calendrier procédural.",
    minTurns: 34,
    minObjections: 6,
    includeIncidents: true,
  },
  {
    id: "PLAIDOIRIE",
    title: "Audience de plaidoirie (fond & réquisitions)",
    objective:
      "Plaidoiries structurées, réquisitions du ministère public, questions finales du siège, clôture des débats.",
    minTurns: 55,
    minObjections: 8,
    includeIncidents: true,
  },
  {
    id: "DELIBERE",
    title: "Délibéré (note interne)",
    objective:
      "Synthèse des faits, questions juridiques, appréciation des preuves, plan de motivation et risques d’appel.",
    minTurns: 26,
    minObjections: 2,
    includeIncidents: false,
  },
  {
    id: "PRONONCE",
    title: "Prononcé du jugement",
    objective:
      "Lecture des motifs essentiels, dispositif, voies de recours, mesures d’exécution/saisie le cas échéant.",
    minTurns: 28,
    minObjections: 2,
    includeIncidents: false,
  },
];

export function initTrialV1(run, caseData) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};

  // si déjà initialisé, migrer (V1 -> V1+) sans casser les runs existants
  if (next.state.trial && next.state.trial.version === "V1") {
    return migrateTrialV1Plus(next, caseData);
  }

  const stages = TRIAL_V1_STAGES.map((s, i) => ({
    id: s.id,
    title: s.title,
    objective: s.objective,
    order: i,
    status: i === 0 ? "ACTIVE" : "PENDING", // PENDING | ACTIVE | DONE
    startedAt: i === 0 ? nowISO() : null,
    finishedAt: null,
    audienceScene: null,
    pv: [],
    score: null,
    notes: [],
  }));

  next.state.trial = {
    version: "V1",
    createdAt: nowISO(),
    currentStageId: stages[0]?.id || "INTRO",
    stages,
    calendar: buildDefaultProceduralCalendar({ caseData, stages }),
    incidents: [],
    // journal global du procès (événements)
    journal: [{ ts: nowISO(), type: "TRIAL_INIT", text: "Procès complet V1 initialisé." }],
  };

  pushAudit(next, {
    type: "TRIAL_INIT",
    title: "Procès complet V1",
    detail: (caseData?.titre || "Dossier") + " — timeline multi-audiences initialisée",
  });

  // calendrier procédural (fixation/renvois/mise en état) — V1+
  return initProceduralCalendar(next, caseData);
}

export function getTrialStage(run, stageId) {
  const stages = run?.state?.trial?.stages;
  if (!Array.isArray(stages)) return null;
  return stages.find((s) => s.id === stageId) || null;
}

export function getCurrentTrialStage(run) {
  const id = run?.state?.trial?.currentStageId;
  return id ? getTrialStage(run, id) : null;
}

export function setCurrentTrialStage(run, stageId) {
  const next = structuredCloneSafe(run);
  const t = next?.state?.trial;
  if (!t || !Array.isArray(t.stages)) return next;

  const target = t.stages.find((s) => s.id === stageId);
  if (!target) return next;

  // active stage unique
  t.stages = t.stages.map((s) => {
    if (s.id === stageId) {
      const status = s.status === "DONE" ? "DONE" : "ACTIVE";
      return { ...s, status, startedAt: s.startedAt || nowISO() };
    }
    if (s.status === "ACTIVE") return { ...s, status: "PENDING" };
    return s;
  });

  t.currentStageId = stageId;
  t.journal = Array.isArray(t.journal) ? t.journal : [];
  t.journal.push({ ts: nowISO(), type: "STAGE_SET", text: `Étape active → ${stageId}` });

  pushAudit(next, { type: "TRIAL_STAGE_SET", title: `Étape → ${stageId}`, detail: target.title });
  return next;
}

export function attachStageAudienceScene(run, stageId, scene) {
  const next = structuredCloneSafe(run);
  const stage = getTrialStage(next, stageId);
  if (!stage) return next;
  stage.audienceScene = scene || null;

  next.state.trial.journal.push({
    ts: nowISO(),
    type: "STAGE_AUDIENCE",
    text: `Audience générée pour ${stageId}`,
  });

  pushAudit(next, {
    type: "TRIAL_STAGE_AUDIENCE",
    title: `Audience générée — ${stage.title}`,
    detail: scene?.sceneMeta?.tribunal ? `${scene.sceneMeta.tribunal}` : "Audience",
  });

  return next;
}

export function appendStagePV(run, stageId, payload) {
  const next = structuredCloneSafe(run);
  const stage = getTrialStage(next, stageId);
  if (!stage) return next;

  const by = safeStr(payload?.by || payload?.role || next?.answers?.role || "Greffier", 24);
  const text = safeStr(payload?.text || payload?.detail || "", 1200).trim();
  if (!text) return next;

  stage.pv = Array.isArray(stage.pv) ? stage.pv : [];
  stage.pv.push({ id: uid("pv"), ts: nowISO(), by, text });
  stage.pv = stage.pv.slice(-120);

  return next;
}

export function completeStage(run, stageId, summary = {}) {
  const next = structuredCloneSafe(run);
  const t = next?.state?.trial;
  if (!t || !Array.isArray(t.stages)) return next;

  const stage = t.stages.find((s) => s.id === stageId);
  if (!stage) return next;

  stage.status = "DONE";
  stage.finishedAt = nowISO();
  stage.score = Number.isFinite(Number(summary?.score)) ? Number(summary.score) : stage.score;

  if (summary?.note) {
    stage.notes = Array.isArray(stage.notes) ? stage.notes : [];
    stage.notes.push(safeStr(summary.note, 800));
    stage.notes = stage.notes.slice(-50);
  }

  t.journal = Array.isArray(t.journal) ? t.journal : [];
  t.journal.push({ ts: nowISO(), type: "STAGE_DONE", text: `Étape terminée → ${stageId}` });

  // active next stage
  const ordered = [...t.stages].sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = ordered.findIndex((s) => s.id === stageId);
  const nextStage = ordered[idx + 1] || null;

  if (nextStage && nextStage.status !== "DONE") {
    t.currentStageId = nextStage.id;
    t.stages = t.stages.map((s) =>
      s.id === nextStage.id ? { ...s, status: "ACTIVE", startedAt: s.startedAt || nowISO() } : s
    );
  }

  pushAudit(next, {
    type: "TRIAL_STAGE_DONE",
    title: `Étape terminée — ${stage.title}`,
    detail: nextStage ? `Prochaine étape: ${nextStage.title}` : "Procès terminé",
  });

  return next;
}

/* =========================================================
   ✅ CALENDRIER PROCEDURAL + MIGRATION V1+
   - fixation, renvois, mises en état, audiences
   - incidents automatisés (templates)
========================================================= */

function addDays(isoOrDate, days) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

export function initProceduralCalendar(run, caseData) {
  const next = structuredCloneSafe(run);
  next.state = next.state || {};
  next.state.trial = next.state.trial || { version: "V1", createdAt: nowISO(), currentStageId: "INTRO", stages: [], journal: [] };

  const t = next.state.trial;
  t.calendar = t.calendar || { version: 1, events: [], lastUpdatedAt: null };
  t.calendar.events = Array.isArray(t.calendar.events) ? t.calendar.events : [];

  // si déjà un calendrier avec des événements, on ne réinitialise pas
  if (t.calendar.events.length > 0) {
    t.calendar.lastUpdatedAt = nowISO();
    return next;
  }

  const start = new Date();
  const city = safeStr(caseData?.meta?.city || caseData?.meta?.ville || caseData?.city || "RDC", 40);
  const tribunal = safeStr(caseData?.meta?.tribunal || caseData?.tribunal || "Tribunal", 80);

  // Calendrier par défaut: fixation -> MEE -> audiences
  const defaults = [
    { type: "FIXATION", day: 0, label: "Fixation de la cause", detail: `Fixation au ${tribunal} (${city}).` },
    { type: "MISE_EN_ETAT", day: 7, label: "Mise en état", detail: "Communication de pièces et calendrier des écritures." },
    { type: "AUDIENCE", day: 14, label: "Audience d’introduction", stageId: "INTRO" },
    { type: "AUDIENCE", day: 21, label: "Audience des incidents", stageId: "INCIDENTS" },
    { type: "AUDIENCE", day: 35, label: "Audience de fond", stageId: "FOND" },
    { type: "AUDIENCE", day: 49, label: "Audience de plaidoirie", stageId: "PLAIDOIRIE" },
    { type: "DELIBERE", day: 56, label: "Mise en délibéré", stageId: "DELIBERE" },
    { type: "PRONONCE", day: 70, label: "Prononcé du jugement", stageId: "PRONONCE" },
  ];

  for (const e of defaults) {
    t.calendar.events.push({
      id: uid("cal"),
      ts: nowISO(),
      type: e.type,
      date: addDays(start, e.day).toISOString().slice(0, 10),
      label: e.label,
      detail: e.detail || "",
      stageId: e.stageId || null,
      status: "PLANNED", // PLANNED | DONE | CANCELLED
    });
  }

  t.calendar.lastUpdatedAt = nowISO();
  t.journal = Array.isArray(t.journal) ? t.journal : [];
  t.journal.push({ ts: nowISO(), type: "CAL_INIT", text: "Calendrier procédural initialisé." });
  pushAudit(next, { type: "CAL_INIT", title: "Calendrier procédural", detail: "Fixation, MEE, audiences planifiées" });
  return next;
}

export function addCalendarEvent(run, payload) {
  const next = structuredCloneSafe(run);
  const t = next?.state?.trial;
  if (!t) return next;
  t.calendar = t.calendar || { version: 1, events: [], lastUpdatedAt: null };
  t.calendar.events = Array.isArray(t.calendar.events) ? t.calendar.events : [];

  const type = safeStr(payload?.type || "RENVOI", 24).toUpperCase();
  const label = safeStr(payload?.label || payload?.title || type, 120);
  const detail = safeStr(payload?.detail || payload?.text || "", 600);
  const date = safeStr(payload?.date || nowISO().slice(0, 10), 20);
  const stageId = safeStr(payload?.stageId || "", 32) || null;

  t.calendar.events.push({
    id: uid("cal"),
    ts: nowISO(),
    type,
    date,
    label,
    detail,
    stageId,
    status: "PLANNED",
  });

  t.calendar.lastUpdatedAt = nowISO();
  t.journal = Array.isArray(t.journal) ? t.journal : [];
  t.journal.push({ ts: nowISO(), type: "CAL_ADD", text: `Événement ajouté: ${type} (${date})` });
  pushAudit(next, { type: "CAL_ADD", title: `Calendrier: ${type}`, detail: `${label} — ${date}` });

  // renvoi = petit risque d'appel (délais/gestion)
  if (type === "RENVOI") {
    next.state = next.state || {};
    next.state.riskModifiers = next.state.riskModifiers || { appealRiskPenalty: 0, dueProcessBonus: 0 };
    next.state.riskModifiers.appealRiskPenalty += 1;
  }

  return next;
}

export function markCalendarEventDone(run, eventId) {
  const next = structuredCloneSafe(run);
  const evts = next?.state?.trial?.calendar?.events;
  if (!Array.isArray(evts)) return next;
  const i = evts.findIndex((e) => e.id === eventId);
  if (i < 0) return next;
  evts[i] = { ...evts[i], status: "DONE" };
  next.state.trial.calendar.lastUpdatedAt = nowISO();
  return next;
}

function migrateTrialV1Plus(run, caseData) {
  const next = structuredCloneSafe(run);
  const t = next?.state?.trial;
  if (!t || !Array.isArray(t.stages)) return next;

  const existing = new Set(t.stages.map((s) => s.id));
  const ordered = [...t.stages].sort((a, b) => (a.order || 0) - (b.order || 0));
  let maxOrder = ordered.length ? ordered[ordered.length - 1].order || 0 : 0;

  // ajouter les nouvelles étapes si absentes
  for (const s of TRIAL_V1_STAGES) {
    if (existing.has(s.id)) continue;
    maxOrder += 1;
    t.stages.push({
      id: s.id,
      title: s.title,
      objective: s.objective,
      order: maxOrder,
      status: "PENDING",
      startedAt: null,
      finishedAt: null,
      audienceScene: null,
      pv: [],
      score: null,
      notes: [],
    });
    t.journal = Array.isArray(t.journal) ? t.journal : [];
    t.journal.push({ ts: nowISO(), type: "MIGRATE", text: `Étape ajoutée (V1+): ${s.id}` });
  }

  // calendrier procédural (si absent)
  const withCal = initProceduralCalendar(next, caseData);
  return withCal;
}

// ---------- Incidents automatisés ----------
export function generateAutoIncidents(caseData, stageId, run) {
  const domain = safeStr(caseData?.domaine || caseData?.matiere || "", 40).toLowerCase();
  const stage = String(stageId || "").toUpperCase();
  const pieces = Array.isArray(caseData?.pieces) ? caseData.pieces : [];
  const hasLate = pieces.some((p) => p?.isLate || p?.late);
  const hasCitation = pieces.some((p) => /citation|assignation|exploit/i.test(String(p?.title || p?.type || "")));

  const out = [];

  // incidents génériques
  if (stage === "INTRO") {
    if (!hasCitation) out.push({ type: "nullite", label: "Nullité pour vice de citation/notification", detail: "Soulever un vice de forme ou absence de preuve de citation régulière." });
    out.push({ type: "renvoi", label: "Renvoi pour préparation", detail: "Demande de renvoi pour prise de connaissance des pièces et préparation." });
  }

  if (stage === "INCIDENTS") {
    out.push({ type: "incompetence", label: "Exception d’incompétence", detail: "Vérifier compétence matérielle/territoriale; soulever si nécessaire." });
    out.push({ type: "irrecevabilite", label: "Exception d’irrecevabilité", detail: "Qualité/intérêt à agir, délai, défaut de pouvoir." });
    if (hasLate) out.push({ type: "communication", label: "Communication de pièces tardives", detail: "Demander communication complète et contradictoire (respect des droits de la défense)." });
    out.push({ type: "jonction", label: "Jonction/Disjonction", detail: "Demander jonction si connexité; disjonction si retard/complexité." });
  }

  if (stage === "FOND" || stage === "PLAIDOIRIE") {
    out.push({ type: "mesure_instruction", label: "Mesure d’instruction", detail: "Demander audition, descente sur les lieux, expertise, réquisition de pièces." });
    if (domain.includes("penal")) out.push({ type: "liberte", label: "Liberté provisoire / contrôle", detail: "Soulever une mesure provisoire selon le dossier et garanties." });
  }

  if (domain.includes("foncier")) {
    out.push({ type: "descente", label: "Descente sur les lieux", detail: "Proposer une descente sur les lieux / expertise cadastrale." });
  }
  if (domain.includes("travail")) {
    out.push({ type: "conciliation", label: "Conciliation / tentative préalable", detail: "Vérifier conciliation préalable/inspection du travail si applicable." });
  }

  // dédup
  const seen = new Set();
  const uniqOut = [];
  for (const i of out) {
    const k = `${i.type}-${i.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniqOut.push(i);
  }

  return uniqOut.slice(0, 6);
}

export function applyAutoIncidents(run, caseData, stageId, opts = {}) {
  const next = structuredCloneSafe(run);
  const incidents = generateAutoIncidents(caseData, stageId, next);
  if (!incidents.length) return next;

  next.state = next.state || {};
  next.state.trial = next.state.trial || { version: "V1", createdAt: nowISO(), currentStageId: stageId, stages: [], journal: [] };
  next.state.trial.incidents = Array.isArray(next.state.trial.incidents) ? next.state.trial.incidents : [];

  const mode = String(opts.mode || "SUGGEST").toUpperCase(); // SUGGEST | APPLY
  for (const inc of incidents) {
    const row = { id: uid("inc"), ts: nowISO(), stageId: String(stageId || ""), ...inc, status: mode === "APPLY" ? "RECORDED" : "SUGGESTED" };
    next.state.trial.incidents.push(row);
    if (mode === "APPLY") {
      // enregistrement au journal + ajustement risques
      const t = inc.type;
      recordIncident(next, { type: t, detail: `${inc.label}. ${inc.detail || ""}`, by: "System" });
    }
  }
  next.state.trial.incidents = next.state.trial.incidents.slice(-60);
  return next;
}

/* =========================================================
   ✅ Jugement motivé (auto-structuré) + Voie d’appel (draft)
========================================================= */

export function buildJudgmentDraft({ caseData, run }) {
  const cd = caseData || {};
  const r = run || {};

  const parties = cd.parties || {};
  const facts = safeStr(cd.resume || cd.brief || "", 1200);
  const domain = safeStr(cd.domaine || "RDC", 40);

  const incidents = (r?.state?.trial?.incidents || []).filter((x) => x.status === "RECORDED" || x.status === "SUGGESTED").slice(-6);
  const pv = (r?.state?.trial?.stages || []).flatMap((s) => (s.pv || []).map((p) => ({ stage: s.id, ...p })));
  const pvBullets = pv.slice(-6).map((p) => `- (${p.stage}) ${safeStr(p.text, 180)}`).join("\n");

  const qual = safeStr(r?.answers?.qualification || "", 700);
  const proc = safeStr(r?.answers?.procedureJustification || "", 700);

  const motivation = [
    "**I. Faits et procédure**",
    facts ? `\n${facts}` : "\n(à compléter: faits essentiels)",
    pvBullets ? `\n\n**Éléments consignés au PV**\n${pvBullets}` : "",
    "\n\n**II. Questions litigieuses**",
    "\n1) Recevabilité/compétence et exceptions éventuelles.",
    "\n2) Bien‑fondé au fond (responsabilité/droits invoqués) et appréciation des preuves.",
    "\n\n**III. Règles applicables**",
    `\n(Droit RDC / ${domain}) : textes pertinents à préciser (code, loi spéciale, principes du contradictoire).`,
    "\n\n**IV. Application au cas**",
    qual ? `\nQualification/Analyse: ${qual}` : "\nQualification/Analyse: (à compléter)",
    proc ? `\nProcédure/Contradictoire: ${proc}` : "\nProcédure/Contradictoire: (à compléter)",
    incidents.length ? `\n\n**Incidents soulevés**\n${incidents.map((i) => `- ${i.label} (${i.type})`).join("\n")}` : "",
    "\n\n**V. Conclusion**",
    "\nLe tribunal statue conformément aux motifs ci‑dessus.",
  ].filter(Boolean).join("\n");

  const dispositif = [
    "**PAR CES MOTIFS**",
    "\n- Dit la demande recevable (ou irrecevable) (à adapter).",
    "\n- Dit l’exception (accueillie/rejetée) (à adapter).",
    "\n- Dit la demande fondée (ou non fondée) (à adapter).",
    "\n- Ordonne (le cas échéant) les mesures d’exécution (à adapter).",
    "\n- Met les frais à charge de (à adapter).",
  ].join("\n");

  const voiesRecours = [
    "**Voies de recours (à adapter selon la matière et la juridiction)**",
    "- Appel: devant la Cour d’appel compétente, selon les délais légaux applicables.",
    "- Opposition: si jugement par défaut, selon les conditions légales.",
    "- Pourvoi: selon les voies et conditions prévues par la loi.",
  ].join("\n");

  return { motivation, dispositif, voiesRecours };
}

export function buildAppealDraft({ caseData, run }) {
  const cd = caseData || {};
  const r = run || {};

  const risk = safeNum(r?.state?.riskModifiers?.appealRiskPenalty);
  const due = safeNum(r?.state?.riskModifiers?.dueProcessBonus);

  const incidents = (r?.state?.trial?.incidents || []).slice(-10);
  const flags = Array.isArray(r?.flags) ? r.flags.slice(-8) : [];

  const grounds = [];

  // heuristiques “formation continue” (pas de délais chiffrés)
  if (risk >= 4) grounds.push("Violation alléguée du contradictoire / gestion des renvois et communications");
  if (flags.some((f) => /nullit|vice|compétence/i.test(String(f)))) grounds.push("Nullité de procédure (vice de forme ou compétence contestée)");
  if (incidents.some((i) => /incompetence|irrecev/i.test(String(i.type)))) grounds.push("Exception d’incompétence/irrecevabilité mal tranchée");
  if (incidents.some((i) => /mesure_instruction|descente|expertise/i.test(String(i.type)))) grounds.push("Refus ou insuffisance de mesure d’instruction (appréciation des preuves)");
  if (grounds.length === 0) grounds.push("Erreur d’appréciation des faits et des preuves (à préciser)");

  const memo = [
    "**Projet de requête / déclaration d’appel (formation)**",
    `\n**Affaire**: ${safeStr(cd?.caseId || "DOSSIER", 40)} — ${safeStr(cd?.titre || "", 140)}`,
    "\n**Décision attaquée**: (à préciser: date/juridiction).",
    "\n**Moyens d’appel (exemples)**",
    grounds.map((g, i) => `${i + 1}) ${g}`).join("\n"),
    "\n**Demandes à la Cour**",
    "- Réformer/annuler la décision (en tout ou partie) ;",
    "- Dire droit conformément aux moyens ;",
    "- Ordonner, si besoin, une mesure d’instruction complémentaire.",
    "\n**Observations pédagogiques**",
    `- Indice de risque d’appel (simulation): ${risk}/10 ; bonus contradictoire: ${due}/10.`,
  ].join("\n");

  return { memo, grounds, risk, due };
}

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
    step: "BRIEFING",

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
