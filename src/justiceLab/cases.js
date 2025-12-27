// src/justiceLab/cases.js
// V9 — Ultra pro (multi-audiences + génération dynamique + IA “full caseData” par domaine)
// + HYDRATATION AUTOMATIQUE des caseData IA pour compatibilité engine/UI
// + PERSISTENCE cache local (justicelab_caseCache_v2) pour Play
// Exports:
// - export const DOMAINS
// - export const CASE_TEMPLATES
// - export function generateCase({ templateId, seed, level })
// - export async function generateCaseHybrid({ templateId, seed, level, ai, apiBase, timeoutMs })
// - export async function generateCaseAIByDomain({ domaine, level, seed, apiBase, timeoutMs, lang })
// - export function listGeneratedCases()
// - export const CASES

const DEFAULT_CITY = "Lubumbashi";

// ✅ Persisted case cache (compatible with JusticeLabPlay.jsx)
const CASE_CACHE_KEY_V2 = "justicelab_caseCache_v2";

function lsAvailable() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__jl_t";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function loadCaseCache() {
  if (!lsAvailable()) return {};
  try {
    const raw = localStorage.getItem(CASE_CACHE_KEY_V2);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveCaseToCache(caseData) {
  if (!lsAvailable()) return;
  try {
    if (!caseData?.caseId) return;
    const cache = loadCaseCache();
    cache[caseData.caseId] = caseData;
    localStorage.setItem(CASE_CACHE_KEY_V2, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function slugDomain(d) {
  const s = String(d || "");
  const clean = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (clean.includes("penal")) return "penal";
  if (clean.includes("foncier")) return "foncier";
  if (clean.includes("travail")) return "travail";
  if (clean.includes("famille")) return "famille";
  if (clean.includes("constitution")) return "constitutionnel";
  if (clean.includes("militaire")) return "militaire";
  if (clean.includes("admin")) return "administratif";
  if (clean.includes("ohada") || clean.includes("commercial")) return "commercial";
  return clean.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "autre";
}

/* =========================
   RNG seeded
========================= */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function rngFromSeed(seed) {
  const seedStr = String(seed ?? "seed");
  const h = xmur3(seedStr);
  return sfc32(h(), h(), h(), h());
}
function pick(rng, arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}
function pickN(rng, arr, n) {
  const a = Array.isArray(arr) ? [...arr] : [];
  const out = [];
  while (a.length && out.length < n) {
    const i = Math.floor(rng() * a.length);
    out.push(a.splice(i, 1)[0]);
  }
  return out;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function fmtMoney(rng) {
  const base = pick(rng, [250, 400, 600, 900, 1200, 2000, 3500, 5000, 12000, 25000, 60000]) || 600;
  const mult = pick(rng, [1, 1, 1, 2, 3]) || 1;
  return `${base * mult} USD`;
}
function idPiece(i) {
  return `P${i}`;
}

/* =========================
   Seed + Hash helpers
========================= */
function normalizeSeed(seed) {
  if (seed === null || seed === undefined) return "0";
  return String(seed).trim() || "0";
}
function shortHash(input) {
  const h = xmur3(String(input))();
  return (h >>> 0).toString(36).slice(0, 8);
}
function mkCaseId(templateId, seedNorm) {
  const h = shortHash(`${templateId}:${seedNorm}`);
  const dom = (templateId || "TPL").replace("TPL_", "").split("_")[0].slice(0, 3).toUpperCase();
  return `RDC-${dom}-${h}`;
}

/* =========================
   Domain catalog (UI)
========================= */
export const DOMAINS = [
  { id: "PENAL", label: "Pénal" },
  { id: "FONCIER", label: "Foncier" },
  { id: "TRAVAIL", label: "Travail" },
  { id: "CONSTIT", label: "Constitutionnel" },
  { id: "MILITAIRE", label: "Pénal militaire" },
  { id: "FAMILLE", label: "Famille" },
  { id: "COMMERCIAL", label: "Commercial/OHADA" },
  { id: "ADMIN", label: "Administratif" },
];

function mapDomainToTemplateId(domaineLabel) {
  const d = String(domaineLabel || "").toLowerCase();
  if (d.includes("foncier")) return "TPL_FONCIER_TITRE_COUTUME";
  if (d.includes("travail")) return "TPL_TRAVAIL_LICENCIEMENT";
  if (d.includes("constitution")) return "TPL_CONSTITUTIONNEL_DROITS_FONDAMENTAUX";
  if (d.includes("militaire")) return "TPL_PENAL_MILITAIRE_INSUBORDINATION";
  if (d.includes("famille")) return "TPL_FAMILLE_GARDE_PENSION";
  if (d.includes("ohada") || d.includes("commercial")) return "TPL_OHADA_INJONCTION_PAYER";
  if (d.includes("admin")) return "TPL_ADMIN_PERMIS_SANCTION";
  return "TPL_PENAL_DETENTION";
}

/* =========================
   Didactique / pédagogie
========================= */
function buildPedagogy({ domaine, level }) {
  const commonSkills = [
    "Identifier les questions litigieuses et les qualifier juridiquement",
    "Structurer une motivation (faits → droit → application → conclusion)",
    "Garantir le contradictoire et l’égalité des armes",
    "Gérer la preuve (recevabilité, pertinence, tardiveté)",
    "Maîtriser la gestion d’audience (incidents, police de l’audience, décisions motivées)",
    "Tenue du dossier: traçabilité des pièces, mentions, calendrier",
  ];

  const domainSkills = {
    "Pénal": [
      "Contrôle des droits de la défense et de la régularité des actes",
      "Apprécier détention / mesures alternatives et garanties",
      "Répondre aux nullités / exceptions et incidents d’audience",
    ],
    "Pénal militaire": [
      "Vérifier compétence (juridiction) et statut du prévenu",
      "Apprécier discipline/ordre public militaire vs droits de la défense",
      "Gérer auditions/rapports hiérarchiques et contradictions",
    ],
    "Foncier": [
      "Apprécier force probante du titre et pièces cadastrales",
      "Gérer expertise/bornage et mesures d’instruction",
      "Arbitrer conflit titre vs occupation coutumière",
    ],
    "Travail": [
      "Qualifier la rupture (faute, préavis, indemnités)",
      "Apprécier preuves (contrat, bulletins, avertissements, attestations)",
      "Concilier réparation, proportionnalité, et équité",
    ],
    "Famille": [
      "Apprécier intérêt supérieur de l’enfant",
      "Organiser la preuve en matière familiale (attestations, rapports sociaux)",
      "Fixer mesures provisoires (garde, pension, visite)",
    ],
    "Constitutionnel": [
      "Qualifier le grief (inconstitutionnalité, atteinte aux droits, conflit de compétence)",
      "Structurer un raisonnement constitutionnel (normes, contrôle, proportionnalité)",
      "Motiver une décision claire et intelligible",
    ],
    "Commercial/OHADA": [
      "Apprécier preuves commerciales (factures, bons, courriels, comptes)",
      "Gérer injonction de payer / exceptions",
      "Sécuriser motivation sur obligations et responsabilité",
    ],
    "Administratif": [
      "Qualifier l’acte administratif et le recours",
      "Vérifier délai, intérêt, compétence, excès de pouvoir",
      "Apprécier urgence et mesures provisoires",
    ],
  };

  const pitfalls = [
    "Motiver trop court / sans répondre aux moyens des parties",
    "Trancher une objection sans entendre l’autre partie (contradictoire)",
    "Admettre une pièce tardive sans justification",
    "Écarter une pièce clé sans base procédurale claire",
    "Négliger les délais / formalités essentielles",
    "Confondre compétence matérielle/territoriale",
  ];

  const checklist = [
    "Ai-je résumé l’incident de façon neutre ?",
    "Ai-je entendu les parties sur l’incident (oui/non) ?",
    "Ma décision est-elle motivée en 2–6 phrases ?",
    "Ai-je noté l’impact sur les pièces (admise/écartée) ?",
    "Ai-je identifié le risque d’appel (faible/moyen/élevé) ?",
  ];

  const skills = [...commonSkills, ...(domainSkills[domaine] || [])];
  const lvl = level || "Intermédiaire";

  return {
    level: lvl,
    objectifs: skills.slice(0, 8),
    erreursFrequentes: pitfalls,
    checklistAudience: checklist,
  };
}

/* =========================
   Tribunal / Chambre / Type d’audience
========================= */
function computeTribunal(domaine) {
  const d = String(domaine || "").toLowerCase();
  if (d.includes("militaire")) {
    return { tribunal: "Tribunal militaire de garnison", chambre: "Chambre correctionnelle", typeAudience: "Comparution" };
  }
  if (d.includes("constitution")) {
    return { tribunal: "Cour constitutionnelle (simulation)", chambre: "Chambre des recours", typeAudience: "Audience publique" };
  }
  if (d.includes("foncier")) {
    return { tribunal: "Tribunal de grande instance", chambre: "Chambre civile", typeAudience: "Audience civile" };
  }
  if (d.includes("travail")) {
    return { tribunal: "Tribunal du travail", chambre: "Chambre sociale", typeAudience: "Conciliation/Audience" };
  }
  if (d.includes("famille")) {
    return { tribunal: "Tribunal de paix", chambre: "Chambre familiale", typeAudience: "Audience familiale" };
  }
  if (d.includes("admin")) {
    return { tribunal: "Conseil d’État (simulation)", chambre: "Chambre administrative", typeAudience: "Audience administrative" };
  }
  if (d.includes("ohada") || d.includes("commercial")) {
    return { tribunal: "Tribunal de commerce", chambre: "Chambre commerciale", typeAudience: "Audience commerciale" };
  }
  return { tribunal: "Tribunal de paix", chambre: "Chambre correctionnelle", typeAudience: "Audience pénale" };
}

/* =========================
   Templates (EXTRAIT / garde ton contenu)
========================= */
export const CASE_TEMPLATES = [
  // ⚠️ Garde ton catalogue complet ici.
  // (Je laisse tes IDs utilisés partout)
  {
    templateId: "TPL_PENAL_DETENTION",
    baseTitle: "Détention préventive et garanties",
    domaine: "Pénal",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: {
      demandeur: ["Ministère public", "Procureur"],
      defendeur: ["Prévenu", "Suspect"],
      victime: ["Partie civile", "Victime"],
    },
    factsVariants: [
      "Le prévenu est poursuivi pour des faits de vol aggravé. La défense sollicite la mise en liberté provisoire.",
      "Une détention provisoire a été ordonnée. Une demande de liberté provisoire est introduite avec garanties contestées.",
    ],
    legalIssuesPool: [
      "Conditions de la détention préventive",
      "Garanties de représentation",
      "Risque de trouble à l’ordre public",
      "Droits de la défense",
    ],
    piecesPool: [
      { title: "Procès-verbal d’audition", type: "PV", isLate: false, reliability: 85 },
      { title: "Attestation de résidence", type: "Attestation", isLate: true, reliability: 65 },
      { title: "Certificat médical", type: "Médical", isLate: false, reliability: 75 },
      { title: "Rapport de police", type: "Rapport", isLate: false, reliability: 80 },
      { title: "Lettre de garantie", type: "Garantie", isLate: true, reliability: 60 },
    ],
    eventsDeckPool: [
      { title: "Pièce tardive produite", impact: "Une pièce arrive tard, débat sur le contradictoire." },
      { title: "Demande de renvoi", impact: "Une partie demande renvoi pour compléter le dossier." },
    ],
    objectionPool: [
      { by: "Avocat", title: "Exception de nullité", statement: "Vice de procédure dans l’acte d’arrestation.", effects: { risk: { dueProcessBonus: 4 } } },
      { by: "Procureur", title: "Opposition à la liberté", statement: "Risque de fuite et trouble à l’ordre public.", effects: { risk: { appealRiskPenalty: 2 } } },
    ],
  },

  // ✅ exemples minimaux supplémentaires (mets tes vrais)
  {
    templateId: "TPL_FONCIER_TITRE_COUTUME",
    baseTitle: "Conflit foncier (titre vs coutume)",
    domaine: "Foncier",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: { demandeur: ["Acquéreur"], defendeur: ["Occupant"], victime: ["Chef coutumier"] },
    factsVariants: ["Un titre est contesté par une occupation coutumière ancienne."],
    legalIssuesPool: ["Force probante du titre", "Bornage/expertise", "Mesures conservatoires"],
    piecesPool: [
      { title: "Certificat d’enregistrement", type: "Titre", isLate: false, reliability: 85 },
      { title: "Attestation coutumière", type: "Attestation", isLate: true, reliability: 60 },
      { title: "Plan cadastral", type: "Cadastral", isLate: false, reliability: 80 },
    ],
    eventsDeckPool: [{ title: "Mesure d’instruction", impact: "Demande d’expertise/bornage." }],
    objectionPool: [
      { by: "Avocat", title: "Exception d’incompétence", statement: "La juridiction saisie serait incompétente.", effects: { risk: { appealRiskPenalty: 1 } } },
    ],
  },

  {
    templateId: "TPL_TRAVAIL_LICENCIEMENT",
    baseTitle: "Licenciement contesté",
    domaine: "Travail",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: { demandeur: ["Travailleur"], defendeur: ["Employeur"], victime: ["Syndicat"] },
    factsVariants: ["Un licenciement pour faute grave est contesté, indemnités réclamées."],
    legalIssuesPool: ["Cause réelle et sérieuse", "Procédure disciplinaire", "Indemnités"],
    piecesPool: [
      { title: "Contrat de travail", type: "Contrat", isLate: false, reliability: 90 },
      { title: "Avertissement", type: "Discipline", isLate: true, reliability: 65 },
      { title: "Fiche de paie", type: "Paie", isLate: false, reliability: 85 },
    ],
    eventsDeckPool: [{ title: "Contradiction", impact: "Une partie se contredit sur un fait clé." }],
    objectionPool: [
      { by: "Procureur", title: "Fin de non-recevoir", statement: "Délai de recours dépassé.", effects: { risk: { appealRiskPenalty: 2 } } },
    ],
  },
];

function buildParties(rng, schema) {
  const rndName = () =>
    pick(rng, ["Mukendi", "Kabila", "Kasongo", "Ilunga", "Bisimwa", "Mutombo", "Kalala", "Kanyama"]) || "Partie";
  const rndPrenom = () => pick(rng, ["Jean", "Paul", "Marie", "Aline", "Patrick", "Nadine", "Claude", "Sarah"]) || "";
  const person = () => `${rndPrenom()} ${rndName()}`.trim();

  const out = {};
  const keys = Object.keys(schema || {});
  for (const k of keys) {
    out[k] = {
      name: person(),
      role: pick(rng, schema[k]) || k,
    };
  }
  return out;
}

function buildPieces(rng, pool, n = 6) {
  const base = Array.isArray(pool) ? pool : [];
  const picks = pickN(rng, base, Math.min(n, base.length));
  const out = picks.map((p, i) => ({
    id: String(p?.id || idPiece(i + 1)),
    title: String(p?.title || `Pièce ${i + 1}`),
    type: String(p?.type || "Pièce"),
    isLate: Boolean(p?.isLate),
    reliability: Number.isFinite(Number(p?.reliability)) ? Number(p.reliability) : 70,
  }));
  if (out.length) {
    if (!out.some((x) => x.isLate)) out[out.length - 1].isLate = true;
    if (!out.some((x) => (x.reliability ?? 100) <= 65)) out[0].reliability = 60;
  }
  return out;
}

function injectDynamicEffects(o, pieces) {
  const ex = [];
  const late = [];
  const p = pieces || [];
  const latePiece = p.find((x) => x.isLate) || p[p.length - 1];
  const weak = p.find((x) => (x.reliability ?? 100) <= 65) || p[0];
  if (latePiece) late.push(latePiece.id);
  if (weak) ex.push(weak.id);

  const effects = o.effects || {};
  return {
    ...o,
    effects: {
      ...effects,
      excludePieceIds: effects.excludePieceIds || ex.slice(0, 1),
      admitLatePieceIds: effects.admitLatePieceIds || late.slice(0, 1),
    },
  };
}

/* =========================
   Local generation (seeded)
========================= */
export function generateCase({ templateId, seed, level } = {}) {
  const tpl = CASE_TEMPLATES.find((t) => t.templateId === templateId) || CASE_TEMPLATES[0];

  const seedNorm = normalizeSeed(seed ?? "0");
  const rng = rngFromSeed(`${tpl.templateId}:${seedNorm}`);

  const lvlChoices = Array.isArray(tpl.levels) && tpl.levels.length ? tpl.levels : ["Intermédiaire"];
  const lvl = level || pick(rng, lvlChoices) || "Intermédiaire";

  const parties = buildParties(rng, tpl.partiesSchema);
  const facts = pick(rng, tpl.factsVariants) || "";
  const legalIssues = pickN(rng, tpl.legalIssuesPool, 3).filter(Boolean);

  const pieces = buildPieces(rng, tpl.piecesPool, 6);

  const events = pickN(rng, tpl.eventsDeckPool, 3).map((e, i) => ({
    id: `E${i + 1}`,
    title: e.title,
    impact: e.impact,
  }));

  const rawObs = pickN(rng, tpl.objectionPool, clamp(Math.floor(2 + rng() * 3), 2, 5));
  const objections = rawObs.map((o, i) => {
    const domTag = (tpl.domaine || "DOM").slice(0, 3).toUpperCase();
    const objId = `${domTag}_OBJ_${i + 1}`;
    return {
      id: objId,
      by: o.by,
      title: o.title,
      statement: o.statement,
      options: ["Accueillir", "Rejeter", "Demander précision"],
      bestChoiceByRole: {
        Juge: "Demander précision",
        Procureur: o.by?.toLowerCase().includes("procure") ? "Accueillir" : "Rejeter",
        Avocat: o.by?.toLowerCase().includes("avocat") ? "Accueillir" : "Rejeter",
      },
      effects: o.effects,
    };
  });

  const objectionTemplates = objections.map((o) => injectDynamicEffects(o, pieces));

  const city =
    pick(rng, ["Kinshasa", "Lubumbashi", "Goma", "Kolwezi", "Bukavu", "Matadi", "Mbuji-Mayi"]) || DEFAULT_CITY;
  const { tribunal, chambre, typeAudience } = computeTribunal(tpl.domaine);

  const caseId = mkCaseId(tpl.templateId, seedNorm);
  const titre = `${tpl.baseTitle} — ${pick(rng, ["Dossier A", "Dossier B", "Dossier C", "Cas pratique", "Affaire"])}`;
  const resume = `${facts} Enjeu indicatif: ${fmtMoney(rng)}. Ville: ${city}.`;

  const pedagogy = buildPedagogy({ domaine: tpl.domaine, level: lvl });

  const out = {
    // canonical
    caseId,
    domaine: tpl.domaine,
    typeAudience,
    niveau: lvl,
    titre,
    resume,
    parties,
    pieces,
    legalIssues,
    eventsDeck: events,
    objectionTemplates,
    pedagogy,
    meta: {
      templateId: tpl.templateId,
      seed: seedNorm,
      city,
      tribunal,
      chambre,
      generatedAt: new Date().toISOString(),
    },

    // ✅ UI aliases (avoid "dossier introuvable" + React key warnings)
    id: caseId,
    title: titre,
    domain: slugDomain(tpl.domaine),
    level: String(lvl || "débutant").toLowerCase(),
    city,
    jurisdiction: tribunal,
    caseNumber: caseId,
    summary: resume,
    isDynamic: true,
  };

  // ✅ persist for /play/:caseId resolution
  saveCaseToCache(out);
  return out;
}

/* =========================
   Timeout helper
========================= */
function withTimeout(promise, ms = 12000) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function getApiBase(apiBase) {
  const base =
    apiBase ||
    (typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE : "") ||
    "https://droitgpt-indexer.onrender.com";
  return String(base).replace(/\/$/, "");
}

/* =========================
   IA helpers (conservés, fallback local)
========================= */
function sanitizePieces(pieces, rng) {
  const arr = Array.isArray(pieces) ? pieces : [];
  const out = arr.slice(0, 10).map((p, idx) => {
    const id = String(p?.id || `P${idx + 1}`);
    const title = String(p?.title || p?.titre || `Pièce ${idx + 1}`);
    const type = String(p?.type || p?.kind || "Pièce");
    const isLate = Boolean(p?.isLate || p?.late);
    const reliability = Number.isFinite(Number(p?.reliability))
      ? Number(p.reliability)
      : clamp(Math.round(55 + (rng ? rng() : Math.random()) * 45), 0, 100);
    return { ...p, id, title, type, isLate, reliability };
  });

  if (out.length) {
    if (!out.some((x) => x.isLate)) out[out.length - 1].isLate = true;
    if (!out.some((x) => (x.reliability ?? 100) <= 65)) out[0].reliability = 60;
  }
  return out;
}

function buildEventsDeckFromSeed(rng, domaine) {
  return [
    { title: "Pièce tardive produite", impact: "Une pièce arrive à la dernière minute, débat sur le contradictoire." },
    { title: "Contradiction en audience", impact: "Une partie se contredit sur un fait clé, relance du juge." },
    { title: "Demande de renvoi", impact: "Une partie sollicite un renvoi pour produire une preuve." },
    { title: "Incident de procédure", impact: "Exception soulevée sur la recevabilité ou compétence." },
    { title: "Mesure d’instruction", impact: "Une expertise / descente sur les lieux est demandée." },
  ].slice(0, 3);
}

function hydrateCaseData(raw, { domaine, level, seed } = {}) {
  const rng = rngFromSeed(`HYD:${domaine}:${seed ?? "0"}`);
  const domLabel = String(domaine || raw?.domaine || "Pénal");
  const tplId = raw?.meta?.templateId || mapDomainToTemplateId(domLabel);
  const seedNorm = normalizeSeed(seed ?? raw?.meta?.seed ?? "0");

  const caseId = String(raw?.caseId || raw?.id || mkCaseId(tplId, seedNorm));

  const pieces = sanitizePieces(raw?.pieces, rng);
  const { tribunal, chambre, typeAudience } = computeTribunal(domLabel);

  const out = {
    ...raw,
    caseId,
    id: caseId,
    domaine: raw?.domaine || domLabel,
    niveau: raw?.niveau || level || "Intermédiaire",
    titre: raw?.titre || raw?.title || `Dossier ${domLabel} — Simulation`,
    resume: raw?.resume || raw?.summary || "",
    parties: raw?.parties || {},
    pieces,
    legalIssues: Array.isArray(raw?.legalIssues) ? raw.legalIssues : [],
    eventsDeck: Array.isArray(raw?.eventsDeck) && raw.eventsDeck.length ? raw.eventsDeck : buildEventsDeckFromSeed(rng, domLabel),
    objectionTemplates: Array.isArray(raw?.objectionTemplates) ? raw.objectionTemplates : [],
    pedagogy: raw?.pedagogy || buildPedagogy({ domaine: domLabel, level: raw?.niveau || level }),
    meta: {
      ...(raw?.meta || {}),
      templateId: raw?.meta?.templateId || tplId,
      seed: raw?.meta?.seed || seedNorm,
      city: raw?.meta?.city || DEFAULT_CITY,
      tribunal: raw?.meta?.tribunal || tribunal,
      chambre: raw?.meta?.chambre || chambre,
      generatedAt: raw?.meta?.generatedAt || new Date().toISOString(),
    },

    // UI aliases
    title: raw?.titre || raw?.title || `Dossier ${domLabel}`,
    domain: slugDomain(domLabel),
    level: String(raw?.niveau || level || "débutant").toLowerCase(),
    city: raw?.meta?.city || DEFAULT_CITY,
    jurisdiction: tribunal,
    caseNumber: caseId,
    summary: raw?.resume || raw?.summary || "",
    isDynamic: true,
  };

  saveCaseToCache(out);
  return out;
}

export async function generateCaseHybrid({ templateId, seed, level, ai, apiBase, timeoutMs } = {}) {
  if (!ai) return generateCase({ templateId, seed, level });

  try {
    const base = getApiBase(apiBase);
    const payload = { type: "justicelab_case_hybrid", data: { templateId, seed, level } };
    const res = await withTimeout(fetch(`${base}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }), timeoutMs || 15000);

    if (!res.ok) return generateCase({ templateId, seed, level });

    const data = await res.json();
    const raw = data?.caseData || data?.case;
    if (!raw || typeof raw !== "object") return generateCase({ templateId, seed, level });

    return hydrateCaseData(raw, { domaine: raw?.domaine, level, seed });
  } catch {
    return generateCase({ templateId, seed, level });
  }
}

export async function generateCaseAIByDomain({ domaine, level, seed, apiBase, timeoutMs, lang } = {}) {
  const dom = String(domaine || "Pénal");
  const theSeed = seed ?? String(Date.now());

  try {
    const base = getApiBase(apiBase);
    const payload = { type: "justicelab_case_by_domain", data: { domaine: dom, level, seed: theSeed, lang } };
    const res = await withTimeout(fetch(`${base}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }), timeoutMs || 20000);

    if (!res.ok) {
      const tplId = mapDomainToTemplateId(dom);
      return generateCase({ templateId: tplId, seed: payload.seed, level });
    }

    const data = await res.json();
    const raw = data?.caseData || data?.case;

    if (!raw || typeof raw !== "object") {
      const tplId = mapDomainToTemplateId(dom);
      return generateCase({ templateId: tplId, seed: payload.seed, level });
    }

    const hydrated = hydrateCaseData(raw, { domaine: dom, level, seed: payload.seed });

    if (!String(hydrated.resume || "").trim()) {
      const rng = rngFromSeed(`RESUME:${dom}:${payload.seed}`);
      hydrated.resume = `Dossier ${dom} (simulation RDC). Enjeu indicatif: ${fmtMoney(rng)}. Ville: ${hydrated.meta?.city || DEFAULT_CITY}.`;
    }

    return hydrated;
  } catch {
    const tplId = mapDomainToTemplateId(dom);
    return generateCase({ templateId: tplId, seed: String(theSeed), level });
  }
}

/* =========================
   Catalogue stable
========================= */
export function listGeneratedCases() {
  const cache = loadCaseCache();
  const vals = Object.values(cache || {}).filter(Boolean);
  vals.sort((a, b) => {
    const ta = new Date(a?.meta?.generatedAt || 0).getTime();
    const tb = new Date(b?.meta?.generatedAt || 0).getTime();
    return tb - ta;
  });
  return vals.map((c) => ({ ...c, id: c.id || c.caseId || String(Date.now()) }));
}

// ✅ built-in sample cases (affichés même si aucun cache)
export const CASES = [
  generateCase({ templateId: "TPL_PENAL_DETENTION", seed: "SAMPLE-1", level: "Intermédiaire" }),
  generateCase({ templateId: "TPL_FONCIER_TITRE_COUTUME", seed: "SAMPLE-2", level: "Intermédiaire" }),
  generateCase({ templateId: "TPL_TRAVAIL_LICENCIEMENT", seed: "SAMPLE-3", level: "Débutant" }),
];
