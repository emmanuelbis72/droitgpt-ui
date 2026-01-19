// src/justiceLab/cases.js
// V12 — JusticeLab “École de magistrature augmentée”
// ✅ 24 dossiers locaux VARIÉS (tous différents, pas 1 par niveau sous un même dossier)
// ✅ anti-duplication: jamais un dossier identique à un local, ni 2 fois le même généré
// ✅ prompt utilisateur (contenu) + domaine optionnel (auto si vide)
// ✅ import dossier réel (PDF->texte) => simulation
// ✅ mode Greffier: PV d’audience certifié
// ✅ mode Examen: notation magistrature (rubriques + score /100)
//
// Exports:
// - export const DOMAINS
// - export const CASE_TEMPLATES
// - export function generateCase({ templateId, seed, level, domain, prompt, source })
// - export async function generateCaseHybrid({ templateId, seed, level, ai, apiBase, timeoutMs, lang })
// - export async function generateCaseAIByDomain({ domaine, level, seed, apiBase, timeoutMs, lang })
// - export function listGeneratedCases({ limit })
// - export const CASES
// + NEW:
// - export function inferDomainFromPrompt(prompt)
// - export function importCaseFromDocumentText({ documentText, filename, domain, level, seed, ai, apiBase, lang })
// - export function buildGreffierPV({ caseData, runData, journalEntries, greffierName })
// - export function gradeMagistratureExam({ caseData, runData, journalEntries, decisionText })

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

/* =========================
   ✅ Uniqueness guard
   - évite que des dossiers générés collident avec des locaux
   - évite de générer 2 fois le même dossier
========================= */
function collectExistingCaseIds() {
  const ids = new Set();

  // 1) cache
  const cache = loadCaseCache();
  for (const k of Object.keys(cache || {})) ids.add(k);

  // 2) CASES (si déjà construits)
  try {
    if (Array.isArray(CASES)) {
      for (const c of CASES) if (c?.caseId) ids.add(c.caseId);
      for (const c of CASES) if (c?.id) ids.add(c.id); // selon format UI
    }
  } catch {
    // ignore (CASES pas encore initialisé)
  }

  return ids;
}

function ensureUniqueSeedAndId({ templateId, seedNorm, source }) {
  // Unicité demandée surtout pour generated/import/ai
  const mustBeUnique = source && source !== "base";

  if (!mustBeUnique) return { seedNorm };

  let attempt = 0;
  let candidateSeed = seedNorm;
  let candidateId = mkCaseId(templateId, candidateSeed);

  const existingIds = collectExistingCaseIds();

  // Tant que collision, on altère la seed
  while (existingIds.has(candidateId) && attempt < 12) {
    attempt += 1;
    candidateSeed = `${seedNorm}-u${attempt}-${Math.random().toString(36).slice(2, 6)}`;
    candidateId = mkCaseId(templateId, candidateSeed);
  }

  return { seedNorm: candidateSeed };
}

function slugDomain(d) {
  const s = String(d || "");
  const clean = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (clean.includes("penal")) return "penal";
  if (clean.includes("foncier") || clean.includes("terre") || clean.includes("parcelle")) return "foncier";
  if (clean.includes("travail") || clean.includes("licenci")) return "travail";
  if (clean.includes("famille") || clean.includes("divorce") || clean.includes("garde")) return "famille";
  if (clean.includes("constitution")) return "constitutionnel";
  if (clean.includes("militaire")) return "militaire";
  if (clean.includes("admin")) return "administratif";
  if (clean.includes("ohada") || clean.includes("commercial") || clean.includes("societe") || clean.includes("entreprise"))
    return "commercial";
  if (clean.includes("fiscal") || clean.includes("impot") || clean.includes("tax")) return "fiscal";
  if (clean.includes("douan")) return "douanier";
  if (clean.includes("mine") || clean.includes("minier")) return "minier";

  return clean.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "autre";
}

function normalizeDomainLabel(input) {
  const d = String(input || "").trim();
  if (!d) return "Pénal";
  const s = slugDomain(d);

  const map = {
    penal: "Pénal",
    foncier: "Foncier",
    travail: "Travail",
    famille: "Famille",
    constitutionnel: "Constitutionnel",
    militaire: "Pénal militaire",
    administratif: "Administratif",
    commercial: "Commercial/OHADA",
    fiscal: "Fiscal",
    douanier: "Douanier",
    minier: "Minier",
  };
  return map[s] || d;
}

function normalizeUiLevel(level) {
  const s = String(level || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (s.includes("avance")) return "avancé";
  if (s.includes("inter")) return "intermédiaire";
  if (s.includes("debut")) return "débutant";
  return "intermédiaire";
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
  if (seed === null || seed === undefined) return "";
  return String(seed).trim() || "";
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
  { id: "AUTO", label: "Auto (selon le contenu)" },
  { id: "PENAL", label: "Pénal" },
  { id: "FONCIER", label: "Foncier" },
  { id: "TRAVAIL", label: "Travail" },
  { id: "OHADA", label: "OHADA (Commercial / Sociétés)" },
  { id: "CONSTIT", label: "Constitutionnel" },
  { id: "MILITAIRE", label: "Pénal militaire" },
  { id: "FAMILLE", label: "Famille" },
  { id: "ADMIN", label: "Administratif" },
  { id: "FISCAL", label: "Fiscal" },
  { id: "DOUANIER", label: "Douanier" },
  { id: "MINIER", label: "Minier" },
];

function mapDomainToTemplateId(domaineLabelOrSlug) {
  const s = slugDomain(domaineLabelOrSlug);
  if (s === "foncier") return "TPL_FONCIER_TITRE_COUTUME";
  if (s === "travail") return "TPL_TRAVAIL_LICENCIEMENT";
  if (s === "constitutionnel") return "TPL_CONSTITUTIONNEL_DROITS_FONDAMENTAUX";
  if (s === "militaire") return "TPL_PENAL_MILITAIRE_INSUBORDINATION";
  if (s === "famille") return "TPL_FAMILLE_GARDE_PENSION";
  if (s === "commercial") return "TPL_OHADA_INJONCTION_PAYER";
  if (s === "administratif") return "TPL_ADMIN_PERMIS_SANCTION";
  if (s === "fiscal") return "TPL_FISCAL_REDRESSEMENT";
  if (s === "douanier") return "TPL_DOUANIER_CONTENTIEUX";
  if (s === "minier") return "TPL_MINIER_TITRE_CONCESSION";
  return "TPL_PENAL_DETENTION";
}

/* =========================
   ✅ Domaine auto depuis le prompt
========================= */
export function inferDomainFromPrompt(prompt) {
  const p = String(prompt || "").toLowerCase();
  if (!p.trim()) return "penal";

  if (/(parcelle|terrain|concession|bornage|lot|cadastre|titre|certificat|occupation|domaine foncier)/i.test(p))
    return "foncier";

  if (/(licenci|contrat de travail|salaire|indemn|employeur|employe|harcelement|cnss|inspection du travail)/i.test(p))
    return "travail";

  if (/(ohada|soci(e|é)t(e|é)|registre|rccm|injonction|facture|creance|commerce|contrat commercial|actionnaire)/i.test(p))
    return "commercial";

  if (/(constitution|droits fondamentaux|liberte|recours constitutionnel|inconstitutionnel|cour constitutionnelle)/i.test(p))
    return "constitutionnel";

  if (/(administratif|autorisation|permis|arrete|decision administrative|sanction|etat|ministere|commune|mairie)/i.test(p))
    return "administratif";

  if (/(imp(o|ô)t|taxe|dgi|redressement|fiscal|amende fiscale|declaration fiscale)/i.test(p))
    return "fiscal";

  if (/(douane|declaration en douane|import|export|cdd|dgda|saisie douaniere|tarif|marchandise)/i.test(p))
    return "douanier";

  if (/(minier|mine|concession miniere|permis de recherche|permis d'exploitation|creuseur|cobalt|cuivre)/i.test(p))
    return "minier";

  if (/(militaire|garnison|insubordination|desertion|code militaire)/i.test(p))
    return "militaire";

  if (/(divorce|garde|pension|filiation|mariage|enfant|violences conjugales)/i.test(p))
    return "famille";

  return "penal";
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
      "Vérifier titre/coutume, occupation, preuve et chaîne des transferts",
      "Gérer expertise, bornage, descente sur les lieux",
      "Motiver sur la preuve et la sécurité juridique",
    ],
    "Travail": [
      "Qualifier rupture (licenciement) et vérifier procédure",
      "Calculer/justifier indemnités, salaire dû, dommages-intérêts",
      "Gérer conciliation et preuve (contrat, fiches de paie)",
    ],
    "Commercial/OHADA": [
      "Qualifier créance et conditions OHADA (injonction, preuve écrite)",
      "Vérifier RCCM, qualité à agir, compétence commerciale",
      "Motiver sur intérêts, frais, exécution",
    ],
    "Constitutionnel": [
      "Identifier la norme et le grief constitutionnel",
      "Contrôle de proportionnalité / nécessité",
      "Motiver de manière structurée et accessible",
    ],
    "Administratif": [
      "Contrôle de légalité (compétence, forme, procédure, motif)",
      "Gestion des délais/recours et mesures provisoires",
      "Motivation sur intérêt général / droits des administrés",
    ],
    "Fiscal": [
      "Comprendre redressement et obligations déclaratives",
      "Apprécier preuve comptable et régularité de la procédure",
      "Motiver sur pénalités, intérêts et proportionnalité",
    ],
    "Douanier": [
      "Qualifier infraction douanière et preuve (documents import/export)",
      "Contradictoire et mainlevée/saisie",
      "Motiver sur tarif, valeur, sanctions",
    ],
    "Minier": [
      "Vérifier titre minier / conformité et droits des tiers",
      "Gérer conflits (creuseurs, société, autorité) et preuve",
      "Motiver sur sécurité, environnement, ordre public",
    ],
    "Famille": [
      "Gérer l’intérêt supérieur de l’enfant et l’équilibre des droits",
      "Évaluer la preuve (revenus, charges, situation familiale)",
      "Motiver sur garde, pension, modalités de visite",
    ],
  };

  const pitfalls = [
    "Ne pas entendre une partie avant de statuer sur un incident",
    "Décision non motivée ou motivation trop vague",
    "Oublier l’impact des pièces tardives sur le contradictoire",
    "Confondre compétence/recevabilité/exception au fond",
    "Ne pas consigner clairement au PV",
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
    objectifs: skills.slice(0, 10),
    erreursFrequentes: pitfalls,
    checklistAudience: checklist,
  };
}

/* =========================
   Tribunal / Chambre / Type d’audience
========================= */
function computeTribunal(domaine) {
  switch (domaine) {
    case "Pénal":
      return { tribunal: "Tribunal de paix", chambre: "Audience correctionnelle", typeAudience: "Pénale" };
    case "Pénal militaire":
      return { tribunal: "Tribunal militaire de garnison", chambre: "Audience correctionnelle", typeAudience: "Pénale militaire" };
    case "Foncier":
      return { tribunal: "Tribunal de grande instance", chambre: "Chambre foncière", typeAudience: "Foncier" };
    case "Travail":
      return { tribunal: "Tribunal du travail", chambre: "Conciliation / Jugement", typeAudience: "Travail" };
    case "Famille":
      return { tribunal: "Tribunal pour enfants / TGI", chambre: "Chambre famille", typeAudience: "Famille" };
    case "Constitutionnel":
      return { tribunal: "Cour constitutionnelle", chambre: "Audience publique", typeAudience: "Constitutionnel" };
    case "Commercial/OHADA":
      return { tribunal: "Tribunal de commerce", chambre: "Chambre commerciale", typeAudience: "Commercial/OHADA" };
    case "Administratif":
      return { tribunal: "Conseil d’État / Juridiction administrative", chambre: "Audience administrative", typeAudience: "Administratif" };
    case "Fiscal":
      return { tribunal: "Juridiction compétente", chambre: "Audience fiscale", typeAudience: "Fiscal" };
    case "Douanier":
      return { tribunal: "Juridiction compétente", chambre: "Audience douanière", typeAudience: "Douanier" };
    case "Minier":
      return { tribunal: "Juridiction compétente", chambre: "Audience minière", typeAudience: "Minier" };
    default:
      return { tribunal: "Tribunal", chambre: "Audience", typeAudience: "Général" };
  }
}

/* =========================
   Templates PRO (multi-domaines)
   ✅ incidents procéduraux intégrés
========================= */

const COMMON_INCIDENTS = [
  {
    by: "Avocat",
    title: "Nullité (vice de forme / violation du contradictoire)",
    statement:
      "Incident : la défense invoque une nullité (vice de forme / violation d’un droit de la défense). Elle demande l’annulation de l’acte et l’écartement de la pièce litigieuse.",
    effects: {
      onAccueillir: { dueProcessBonus: 2, addTask: { type: "NOTE", label: "Motiver la nullité (2–6 phrases)", detail: "Faits → règle → application → effet." } },
      onRejeter: { risk: { appealRiskPenalty: 2, dueProcessBonus: 0 } },
      onDemander: { clarification: { type: "QUESTION", label: "Préciser l’acte irrégulier et le grief", detail: "Quel acte ? Quelle atteinte ? Quel préjudice ?" }, dueProcessBonus: 1 },
    },
  },
  {
    by: "Procureur",
    title: "Renvoi (témoin / expertise / communication de pièces)",
    statement:
      "Incident : demande de renvoi pour audition d’un témoin / expertise / communication de pièces. Débat sur la diligence et l’équilibre du contradictoire.",
    effects: {
      onAccueillir: { dueProcessBonus: 1, addTask: { type: "DECISION", label: "Fixer renvoi + mesures", detail: "Date, sommations, communication, expertise." } },
      onRejeter: { risk: { appealRiskPenalty: 1, dueProcessBonus: 0 } },
      onDemander: { clarification: { type: "QUESTION", label: "Justifier l’utilité et la diligence", detail: "Pourquoi maintenant ? Quelles démarches déjà faites ?" }, dueProcessBonus: 1 },
    },
  },
  {
    by: "Avocat",
    title: "Jonction / Disjonction d’instances",
    statement:
      "Incident : demande de jonction (connexité) ou disjonction (bonne administration de la justice, délais, complexité).",
    effects: {
      onAccueillir: { dueProcessBonus: 1, addTask: { type: "NOTE", label: "Motiver jonction/disjonction", detail: "Connexité, économie, délais, droits des parties." } },
      onRejeter: { risk: { appealRiskPenalty: 1, dueProcessBonus: 0 } },
      onDemander: { clarification: { type: "QUESTION", label: "Préciser connexité / préjudice", detail: "Quels liens ? Quel risque si séparé/ensemble ?" }, dueProcessBonus: 1 },
    },
  },
  {
    by: "Avocat",
    title: "Communication de pièces (mise en état / contradictoire)",
    statement:
      "Incident : une partie réclame la communication de pièces (ou conteste une production tardive). Débat sur recevabilité, délai, contradictoire.",
    effects: {
      onAccueillir: { dueProcessBonus: 2, addTask: { type: "DECISION", label: "Ordonner communication", detail: "Délai, modalités, sanction/écartement si non-respect." } },
      onRejeter: { risk: { appealRiskPenalty: 2, dueProcessBonus: 0 } },
      onDemander: { clarification: { type: "QUESTION", label: "Lister les pièces et le préjudice", detail: "Quelles pièces ? En quoi indispensables ? Préjudice ?" }, dueProcessBonus: 1 },
    },
  },
];

export const CASE_TEMPLATES = [
  // 1) PÉNAL
  {
    templateId: "TPL_PENAL_DETENTION",
    domaine: "Pénal",
    baseTitle: "Détention préventive, régularité des actes & contradictoire",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "prevenu", statut: "Prévenu", poolNames: ["M. Kabeya", "M. Ndaye", "M. Sefu", "M. Tshibanda"] },
      { key: "victime", statut: "Victime", poolNames: ["Mme Banza", "Mme Lunda", "Mme Rukiya"] },
      { key: "parquet", statut: "Parquet", poolNames: ["Ministère public"] },
      { key: "defense", statut: "Défense", poolNames: ["Me Kalala", "Me Mbuyi", "Me Kasongo"] },
    ],
    factsVariants: [
      "Le prévenu conteste la régularité de son interpellation et soutient un dépassement des délais de détention. La défense demande mainlevée et/ou mise en liberté provisoire.",
      "Une déclaration clé du PV d’audition est contestée (signature, mention d’heure, présence de conseil). La défense soulève une nullité et demande l’écartement de la pièce.",
      "Une preuve numérique (capture WhatsApp) est produite tardivement. Débat sur authenticité, chaîne de conservation et respect du contradictoire.",
      "Le parquet demande renvoi pour compléter l’enquête (témoin/rapport technique). Débat sur diligence, délais et équilibre des droits.",
    ],
    legalIssuesPool: [
      "Contrôle de la détention préventive",
      "Nullités de procédure (acte/forme/grief)",
      "Droits de la défense et contradictoire",
      "Recevabilité des pièces tardives",
      "Motivation et cohérence du dispositif",
      "Gestion des preuves numériques",
    ],
    piecesPool: [
      { type: "PV", titlePool: ["PV d'interpellation", "PV d'audition", "PV de confrontation"], contentPool: ["Mention d’heure discutée…", "Conseil non mentionné…", "Signatures incomplètes…"] },
      { type: "Réquisition", titlePool: ["Réquisition du parquet", "Ordonnance de détention", "Mandat"], contentPool: ["Motifs succincts…", "Délais contestés…", "Base légale discutée…"] },
      { type: "Certificat", titlePool: ["Certificat médical", "Attestation", "Rapport infirmier"], contentPool: ["État de santé invoqué…", "Traitement requis…", "Compatibilité avec détention discutée…"] },
      { type: "Preuve numérique", titlePool: ["Capture WhatsApp", "Audio", "Photo"], contentPool: ["Origine incertaine…", "Horodatage contesté…", "Authenticité discutée…"] },
      { type: "Note", titlePool: ["Note de service", "Rapport d’enquête", "Note de renseignement"], contentPool: ["Informations partielles…", "Témoin non entendu…", "Contradictions…"] },
    ],
    eventsDeckPool: [
      { title: "Pièce tardive", impact: "Débat immédiat sur contradictoire/recevabilité." },
      { title: "Témoin indisponible", impact: "Renvoi demandé avec mesures de contrainte." },
      { title: "Nullité soulevée", impact: "Décision incidente motivée attendue." },
      { title: "Demande de mise en liberté", impact: "Apprécier garanties et équilibre." },
    ],
    objectionPool: [
      ...COMMON_INCIDENTS,
      {
        by: "Avocat",
        title: "Mise en liberté provisoire (garanties)",
        statement:
          "Incident : demande de mise en liberté provisoire (adresse fixe, caution, engagement de comparution). Débat sur garanties et risques.",
        effects: {
          onAccueillir: { dueProcessBonus: 2, addTask: { type: "DECISION", label: "Fixer conditions/garanties", detail: "Caution, résidence, pointage, interdictions." } },
          onRejeter: { risk: { appealRiskPenalty: 1, dueProcessBonus: 0 } },
          onDemander: { clarification: { type: "QUESTION", label: "Préciser les garanties", detail: "Adresse, caution, emploi, antécédents." }, dueProcessBonus: 1 },
        },
      },
      {
        by: "Procureur",
        title: "Recevabilité preuve numérique",
        statement:
          "Incident : le parquet produit une capture WhatsApp. La défense conteste l’authenticité et la chaîne de conservation.",
        effects: {
          onAccueillir: { dueProcessBonus: 1, addTask: { type: "NOTE", label: "Motiver admissibilité", detail: "Pertinence + garanties d’authenticité." } },
          onRejeter: { dueProcessBonus: 1, addTask: { type: "NOTE", label: "Motiver écart", detail: "Doute sérieux + atteinte contradictoire." } },
          onDemander: { clarification: { type: "QUESTION", label: "Exiger éléments d’authenticité", detail: "Téléphone, export, témoin, expert." }, dueProcessBonus: 1 },
        },
      },
    ],
  },

  // 2) FONCIER
  {
    templateId: "TPL_FONCIER_TITRE_COUTUME",
    domaine: "Foncier",
    baseTitle: "Litige foncier: titre, coutume, occupation & bornage",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "demandeur", statut: "Demandeur", poolNames: ["M. Ilunga", "Mme Kayembe", "M. Mukendi"] },
      { key: "defendeur", statut: "Défendeur", poolNames: ["M. Kanku", "Mme Tshiala", "M. Bondo"] },
      { key: "conservateur", statut: "Conservateur", poolNames: ["Conservation des titres immobiliers"] },
      { key: "avocat", statut: "Avocat", poolNames: ["Me Nsimba", "Me Katende", "Me Lwamba"] },
    ],
    factsVariants: [
      "Deux titres revendiquent une même parcelle. Le défendeur invoque l’occupation paisible et la coutume; le demandeur invoque un certificat/titre enregistré.",
      "Le bornage est contesté; une clôture a été déplacée. Demande d’expertise et descente sur les lieux.",
      "Le demandeur réclame annulation d’un acte de vente (vice de consentement) et restitution de la parcelle.",
      "Production tardive d’un certificat d’enregistrement. Débat sur communication de pièces et renvoi.",
    ],
    legalIssuesPool: [
      "Compétence, recevabilité et qualité à agir",
      "Preuve du droit de propriété / opposabilité",
      "Chaîne des transferts (actes, enregistrement, formalités)",
      "Occupation, possession, trouble et réparation",
      "Bornage/expertise et mesures d’instruction",
      "Contradictoire et communication de pièces",
    ],
    piecesPool: [
      { type: "Titre", titlePool: ["Certificat d’enregistrement", "Titre foncier", "Extrait du livre foncier"], contentPool: ["Références divergentes…", "Parcelle mentionnée…", "Date contestée…"] },
      { type: "Acte", titlePool: ["Acte de vente", "Acte notarié", "Procès-verbal de cession"], contentPool: ["Signatures discutées…", "Prix partiellement payé…", "Témoins mentionnés…"] },
      { type: "Plan", titlePool: ["Plan cadastral", "Croquis de bornage", "Plan de lotissement"], contentPool: ["Bornes contestées…", "Superficie incertaine…", "Coordonnées absentes…"] },
      { type: "Attestation", titlePool: ["Attestation coutumière", "Attestation du chef", "Déclaration de voisinage"], contentPool: ["Occupation ancienne…", "Délimitations orales…", "Contradictions…"] },
      { type: "Photo", titlePool: ["Photos de la clôture", "Photos des bornes", "Photos du terrain"], contentPool: ["Déplacement allégué…", "Date incertaine…", "Contexte ambigu…"] },
    ],
    eventsDeckPool: [
      { title: "Demande d’expertise", impact: "Mesure d’instruction (bornage/descente) à motiver." },
      { title: "Pièce tardive", impact: "Communication de pièces + contradictoire." },
      { title: "Renvoi demandé", impact: "Diligence, calendrier et sanctions." },
      { title: "Incident de jonction", impact: "Connexité avec une autre affaire foncière." },
    ],
    objectionPool: [
      ...COMMON_INCIDENTS,
      {
        by: "Avocat",
        title: "Exception d’incompétence / irrecevabilité",
        statement:
          "Incident : le défendeur soulève l’incompétence ou l’irrecevabilité (qualité à agir / intérêt / défaut de pièce essentielle).",
        effects: {
          onAccueillir: { dueProcessBonus: 2, addTask: { type: "DECISION", label: "Statuer sur compétence/recevabilité", detail: "Motiver brièvement + renvoi juridiction/mesures." } },
          onRejeter: { risk: { appealRiskPenalty: 1, dueProcessBonus: 0 } },
          onDemander: { clarification: { type: "QUESTION", label: "Préciser la base", detail: "Quelle règle? Quelle pièce manque? Quel grief?" }, dueProcessBonus: 1 },
        },
      },
      {
        by: "Procureur",
        title: "Mesure d’instruction: descente sur les lieux / expertise",
        statement:
          "Le parquet (ou le tribunal) propose une descente sur les lieux / expertise pour clarifier bornage et occupation.",
        effects: {
          onAccueillir: { dueProcessBonus: 1, addTask: { type: "DECISION", label: "Ordonner expertise", detail: "Mission, expert, délai, consignation, contradictoire." } },
          onRejeter: { risk: { appealRiskPenalty: 1, dueProcessBonus: 0 } },
          onDemander: { clarification: { type: "QUESTION", label: "Définir la mission", detail: "Quelles questions précises? Bornes, superficie, occupation." }, dueProcessBonus: 1 },
        },
      },
    ],
  },

  // 3) TRAVAIL
  {
    templateId: "TPL_TRAVAIL_LICENCIEMENT",
    domaine: "Travail",
    baseTitle: "Licenciement, procédure & indemnités",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "demandeur", statut: "Travailleur", poolNames: ["M. Mutombo", "Mme Mbuyi", "M. Kalenga"] },
      { key: "defendeur", statut: "Employeur", poolNames: ["Société KAT-TRANS SARL", "Entreprise LUALABA MINING", "ETS KASAI LOGISTICS"] },
      { key: "inspection", statut: "Inspection du Travail", poolNames: ["Inspection du Travail"] },
      { key: "avocat", statut: "Avocat", poolNames: ["Me Mwilambwe", "Me Kanyinda", "Me Lungu"] },
    ],
    factsVariants: [
      "Le travailleur conteste un licenciement pour faute lourde; il invoque absence de procédure et réclame indemnités et arriérés.",
      "L’employeur invoque abandon de poste; le travailleur invoque maladie et produit un certificat tardif.",
      "Litige sur paiement d’heures supplémentaires et primes; débat sur charge de la preuve (plannings, fiches).",
      "Conciliation inaboutie; demande de renvoi pour production des fiches de paie et du contrat original.",
    ],
    legalIssuesPool: [
      "Qualification de la rupture (faute, abandon, économique)",
      "Régularité de la procédure disciplinaire",
      "Preuve salariale (fiches, plannings, attestations)",
      "Calcul indemnités et dommages-intérêts",
      "Conciliation et calendrier de mise en état",
      "Communication de pièces / pièces tardives",
    ],
    piecesPool: [
      { type: "Contrat", titlePool: ["Contrat de travail", "Avenant", "Lettre d’engagement"], contentPool: ["Clause contestée…", "Date/qualification…", "Signature discutée…"] },
      { type: "Paie", titlePool: ["Bulletins de paie", "Relevé CNSS", "État de paiement"], contentPool: ["Primes omises…", "Heures sup contestées…", "Déductions discutées…"] },
      { type: "Discipline", titlePool: ["Lettre de licenciement", "Convocation", "Avertissement"], contentPool: ["Motifs flous…", "Délais discutés…", "Procédure contestée…"] },
      { type: "Médical", titlePool: ["Certificat médical", "Arrêt de travail", "Attestation"], contentPool: ["Authenticité discutée…", "Date tardive…", "Lien avec absence…"] },
      { type: "Preuve", titlePool: ["Planning", "Emails/WhatsApp", "Attestation collègue"], contentPool: ["Contradictions…", "Horaires contestés…", "Tardiveté…"] },
    ],
    eventsDeckPool: [
      { title: "Pièce tardive (certificat/paie)", impact: "Débat contradictoire + renvoi éventuel." },
      { title: "Demande de renvoi", impact: "Production contrat original + fiches." },
      { title: "Nullité (procédure disciplinaire)", impact: "Décision incidente motivée." },
      { title: "Tentative conciliation", impact: "Proposition transactionnelle à consigner." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 4) OHADA / COMMERCIAL
  {
    templateId: "TPL_OHADA_INJONCTION_PAYER",
    domaine: "Commercial/OHADA",
    baseTitle: "Créance commerciale & injonction de payer (OHADA)",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "demandeur", statut: "Créancier", poolNames: ["Société KIVU SUPPLY SARL", "ETS LUBA TRADING", "ALPHA SERVICES"] },
      { key: "defendeur", statut: "Débiteur", poolNames: ["BETA DISTRIBUTION", "GAMMA CONSTRUCTION", "DELTA MARKET"] },
      { key: "greffe", statut: "Greffe", poolNames: ["Greffe du Tribunal de commerce"] },
      { key: "avocat", statut: "Avocat", poolNames: ["Me Munganga", "Me Kabila", "Me Kasanji"] },
    ],
    factsVariants: [
      "Une créance est réclamée sur base de factures et bons de livraison; le débiteur conteste la réception et invoque défaut de qualité.",
      "Demande d’injonction de payer; opposition déposée tardivement: débat recevabilité et délais.",
      "Le débiteur invoque compensation et vice de livraison; demande expertise sur conformité.",
      "Une pièce clé (bon de livraison signé) est produite tardivement; demande communication et renvoi.",
    ],
    legalIssuesPool: [
      "Preuve écrite de la créance et exigibilité",
      "Recevabilité de l’opposition / délais",
      "Compétence commerciale et qualité à agir",
      "Intérêts, frais et exécution",
      "Contradictoire et pièces tardives",
      "Mesures provisoires / saisies",
    ],
    piecesPool: [
      { type: "Facture", titlePool: ["Facture n°", "Relevé de compte", "État de créance"], contentPool: ["Montant contesté…", "TVA discutée…", "Échéance…"] },
      { type: "Livraison", titlePool: ["Bon de livraison", "Bon de commande", "PV de réception"], contentPool: ["Signature contestée…", "Quantités discutées…", "Dates…"] },
      { type: "Correspondance", titlePool: ["Mise en demeure", "Email", "WhatsApp"], contentPool: ["Reconnaissance partielle…", "Réclamation qualité…", "Silence…"] },
      { type: "RCCM", titlePool: ["Extrait RCCM", "Statuts", "Pouvoir"], contentPool: ["Qualité du signataire…", "Représentation…", "Société…"] },
      { type: "Paiement", titlePool: ["Reçu", "Virement", "Proposition d’échéancier"], contentPool: ["Paiement partiel…", "Solde…", "Condition…"] },
    ],
    eventsDeckPool: [
      { title: "Opposition tardive", impact: "Débat sur recevabilité/délais." },
      { title: "Pièce tardive (bon signé)", impact: "Contradictoire + renvoi." },
      { title: "Demande de jonction", impact: "Connexité avec autre créance." },
      { title: "Mesure conservatoire", impact: "Saisie/garantie à motiver." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 5) CONSTITUTIONNEL
  {
    templateId: "TPL_CONSTITUTIONNEL_DROITS_FONDAMENTAUX",
    domaine: "Constitutionnel",
    baseTitle: "Droits fondamentaux & contrôle de proportionnalité",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "requérant", statut: "Requérant", poolNames: ["Association Citoyenne", "M. X.", "Mme Y."] },
      { key: "etat", statut: "État", poolNames: ["Ministère concerné", "Autorité administrative"] },
      { key: "conseil", statut: "Conseil", poolNames: ["Me Kabongo", "Me Mamba", "Me Kitenge"] },
    ],
    factsVariants: [
      "Le requérant conteste une décision limitant une liberté (réunion/expression). Débat sur base légale, nécessité et proportionnalité.",
      "Un acte administratif est attaqué pour inconstitutionnalité; débat sur procédure, compétence et intérêt à agir.",
      "Demande de mesure provisoire pour éviter un préjudice grave; débat sur urgence et apparence du droit.",
      "Production tardive d’un arrêté; débat sur communication et renvoi.",
    ],
    legalIssuesPool: [
      "Base légale et hiérarchie des normes",
      "Proportionnalité (nécessité/pertinence)",
      "Recevabilité et intérêt à agir",
      "Urgence et mesures provisoires",
      "Motivation claire et accessible",
      "Contradictoire/communication de pièces",
    ],
    piecesPool: [
      { type: "Acte", titlePool: ["Arrêté", "Décision", "Note circulaire"], contentPool: ["Base légale contestée…", "Motifs généraux…", "Portée…"] },
      { type: "Preuve", titlePool: ["PV", "Photos", "Article/communiqué"], contentPool: ["Contexte discuté…", "Faits contestés…", "Datation…"] },
      { type: "Requête", titlePool: ["Mémoire en demande", "Mémoire en réponse", "Conclusions"], contentPool: ["Griefs constitutionnels…", "Arguments…", "Répliques…"] },
      { type: "Jurisprudence", titlePool: ["Décision antérieure", "Avis", "Extrait"], contentPool: ["Principe invoqué…", "Comparaison…", "Portée…"] },
      { type: "Attestation", titlePool: ["Attestation", "Déclaration", "Rapport ONG"], contentPool: ["Crédibilité discutée…", "Méthode…", "Sources…"] },
    ],
    eventsDeckPool: [
      { title: "Mesure provisoire", impact: "Urgence + apparence du droit à motiver." },
      { title: "Pièce tardive", impact: "Communication + contradictoire." },
      { title: "Jonction", impact: "Connexité de requêtes." },
      { title: "Renvoi", impact: "Débat sur calendrier de procédure." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 6) ADMINISTRATIF
  {
    templateId: "TPL_ADMIN_PERMIS_SANCTION",
    domaine: "Administratif",
    baseTitle: "Sanction administrative / permis & contrôle de légalité",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "requérant", statut: "Requérant", poolNames: ["M. Nsenga", "Mme Kafando", "Société OMEGA"] },
      { key: "autorite", statut: "Autorité", poolNames: ["Mairie/Commune", "Ministère", "Service technique"] },
      { key: "conseil", statut: "Conseil", poolNames: ["Me Lukusa", "Me Bokele", "Me Mpoyi"] },
    ],
    factsVariants: [
      "Retrait d’un permis (commerce/construction) pour motifs d’ordre public. Débat sur compétence, procédure, motivation.",
      "Sanction administrative sans audition préalable alléguée. Nullité pour violation du contradictoire.",
      "Délai de recours contesté; débat sur recevabilité.",
      "Pièce tardive (rapport technique). Demande de communication et renvoi.",
    ],
    legalIssuesPool: [
      "Compétence de l’autorité et base légale",
      "Respect des formes et procédure contradictoire",
      "Motivation et proportionnalité",
      "Recevabilité/délais de recours",
      "Mesures provisoires",
      "Communication de pièces",
    ],
    piecesPool: [
      { type: "Décision", titlePool: ["Décision de retrait", "Arrêté", "Notification"], contentPool: ["Motifs stéréotypés…", "Date contestée…", "Base légale…"] },
      { type: "Rapport", titlePool: ["Rapport technique", "PV de contrôle", "Note d’inspection"], contentPool: ["Constats discutés…", "Photos…", "Méthode…"] },
      { type: "Autorisation", titlePool: ["Permis", "Licence", "Autorisation"], contentPool: ["Conditions…", "Renouvellement…", "Mention…"] },
      { type: "Requête", titlePool: ["Mémoire", "Conclusions", "Réplique"], contentPool: ["Moyens de légalité…", "Griefs…", "Demandes…"] },
      { type: "Attestation", titlePool: ["Attestation", "Déclaration", "Rapport tiers"], contentPool: ["Crédibilité discutée…", "Contradictions…", "Sources…"] },
    ],
    eventsDeckPool: [
      { title: "Exception de délai", impact: "Recevabilité à statuer." },
      { title: "Nullité (contradictoire)", impact: "Décision incidente motivée." },
      { title: "Pièce tardive", impact: "Communication + renvoi." },
      { title: "Mesure provisoire", impact: "Urgence à apprécier." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 7) FAMILLE
  {
    templateId: "TPL_FAMILLE_GARDE_PENSION",
    domaine: "Famille",
    baseTitle: "Garde d’enfant & pension alimentaire",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "demandeur", statut: "Parent 1", poolNames: ["Mme M.", "M. K.", "Mme S."] },
      { key: "defendeur", statut: "Parent 2", poolNames: ["M. T.", "Mme L.", "M. N."] },
      { key: "ministerePublic", statut: "MP (si requis)", poolNames: ["Ministère public"] },
      { key: "conseil", statut: "Conseil", poolNames: ["Me Ilunga", "Me Luba", "Me Tshombe"] },
    ],
    factsVariants: [
      "Conflit sur garde et droit de visite; accusations croisées. Demande enquête sociale.",
      "Demande de pension alimentaire; débat sur revenus, charges, scolarité et santé.",
      "Pièce tardive (preuve de revenus). Demande communication et renvoi.",
      "Demande de mesures provisoires urgentes (hébergement, scolarité).",
    ],
    legalIssuesPool: [
      "Intérêt supérieur de l’enfant",
      "Équilibre garde / visite / stabilité",
      "Preuve des revenus et charges",
      "Mesures provisoires et urgence",
      "Communication de pièces",
      "Motivation et modalités pratiques",
    ],
    piecesPool: [
      { type: "État civil", titlePool: ["Acte de naissance", "Attestation", "Jugement antérieur"], contentPool: ["Mentions…", "Autorité parentale…", "Historique…"] },
      { type: "Scolarité", titlePool: ["Bulletin scolaire", "Facture école", "Attestation"], contentPool: ["Frais…", "Santé…", "Difficultés…"] },
      { type: "Revenus", titlePool: ["Fiche de paie", "Relevé bancaire", "Attestation emploi"], contentPool: ["Montants…", "Variations…", "Contestations…"] },
      { type: "Preuve", titlePool: ["Messages", "Attestation", "Rapport"], contentPool: ["Contexte…", "Crédibilité discutée…", "Tardiveté…"] },
      { type: "Social", titlePool: ["Rapport social", "Enquête", "Attestation résidence"], contentPool: ["Conditions logement…", "Stabilité…", "Observations…"] },
    ],
    eventsDeckPool: [
      { title: "Mesures provisoires", impact: "Urgence + stabilité à motiver." },
      { title: "Enquête sociale", impact: "Mesure d’instruction utile." },
      { title: "Pièce tardive", impact: "Communication + contradictoire." },
      { title: "Renvoi", impact: "Calendrier et diligence." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 8) FISCAL
  {
    templateId: "TPL_FISCAL_REDRESSEMENT",
    domaine: "Fiscal",
    baseTitle: "Redressement fiscal & procédure contradictoire",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "contribuable", statut: "Contribuable", poolNames: ["Société KATANGA FOOD", "ETS KIVU AGRO", "M. X."] },
      { key: "administration", statut: "Administration", poolNames: ["DGI"] },
      { key: "conseil", statut: "Conseil", poolNames: ["Me Fiscalis", "Me Kabongo", "Me Mutombo"] },
    ],
    factsVariants: [
      "Redressement fiscal contesté: procédure et base d’imposition discutées; demande d’annulation des pénalités.",
      "Pièces comptables produites tardivement; débat sur leur recevabilité et impact sur le contradictoire.",
      "Demande de renvoi pour produire journaux comptables et preuves de paiements.",
      "Contestations sur pénalités et proportionnalité.",
    ],
    legalIssuesPool: [
      "Régularité de la procédure de contrôle",
      "Charge et qualité de la preuve comptable",
      "Pénalités/intérêts: proportionnalité",
      "Recevabilité des pièces tardives",
      "Communication de pièces",
      "Motivation et dispositif",
    ],
    piecesPool: [
      { type: "Notification", titlePool: ["Avis de vérification", "Notification de redressement", "Mise en demeure"], contentPool: ["Délai contesté…", "Motifs…", "Base…"] },
      { type: "Comptabilité", titlePool: ["Grand livre", "Journal", "Balance"], contentPool: ["Écritures…", "Incohérences…", "Justifications…"] },
      { type: "Paiement", titlePool: ["Quitus", "Reçus", "Relevé"], contentPool: ["Paiement partiel…", "Solde…", "Date…"] },
      { type: "Expertise", titlePool: ["Rapport", "Note comptable", "Attestation"], contentPool: ["Méthode…", "Sources…", "Conclusion…"] },
      { type: "Requête", titlePool: ["Mémoire", "Conclusions", "Réplique"], contentPool: ["Moyens…", "Annulation…", "Décharge…"] },
    ],
    eventsDeckPool: [
      { title: "Pièce tardive (compta)", impact: "Contradictoire + renvoi." },
      { title: "Nullité procédure", impact: "Décision incidente motivée." },
      { title: "Renvoi", impact: "Diligence et calendrier." },
      { title: "Communication de pièces", impact: "Ordonnance de communication." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 9) DOUANIER
  {
    templateId: "TPL_DOUANIER_CONTENTIEUX",
    domaine: "Douanier",
    baseTitle: "Saisie douanière, valeur & mainlevée",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "importateur", statut: "Importateur", poolNames: ["Société TRANS-AFRICA", "ETS KASAI IMPORT", "M. X."] },
      { key: "douane", statut: "DGDA", poolNames: ["DGDA"] },
      { key: "conseil", statut: "Conseil", poolNames: ["Me Douanes", "Me Ilunga", "Me Mpoyi"] },
    ],
    factsVariants: [
      "Marchandises saisies: débat sur déclaration, valeur, tarif, et mainlevée sous garantie.",
      "Pièce tardive (facture d’achat originale) produite pour contester la valeur douanière.",
      "Demande de renvoi pour obtenir documents de transit/transport.",
      "Exception de nullité pour irrégularité de la saisie ou défaut de notification.",
    ],
    legalIssuesPool: [
      "Régularité de la saisie et notifications",
      "Preuve de la valeur et classification tarifaire",
      "Mainlevée / garanties",
      "Contradictoire et pièces tardives",
      "Motivation et proportionnalité des sanctions",
    ],
    piecesPool: [
      { type: "Saisie", titlePool: ["PV de saisie", "Notification", "Rapport"], contentPool: ["Forme contestée…", "Date…", "Signature…"] },
      { type: "Facture", titlePool: ["Facture d’achat", "Proforma", "Liste colisage"], contentPool: ["Valeur contestée…", "Origine…", "Quantités…"] },
      { type: "Transport", titlePool: ["Connaissement", "Lettre de voiture", "Transit"], contentPool: ["Itinéraire…", "Dates…", "Incohérences…"] },
      { type: "Paiement", titlePool: ["Reçu", "Virement", "Garantie"], contentPool: ["Mainlevée demandée…", "Montant…", "Conditions…"] },
      { type: "Correspondance", titlePool: ["Réclamation", "Email", "Mémoire"], contentPool: ["Arguments…", "Tardiveté…", "Contradiction…"] },
    ],
    eventsDeckPool: [
      { title: "Mainlevée sous garantie", impact: "Décision motivée attendue." },
      { title: "Pièce tardive (facture)", impact: "Contradictoire + renvoi." },
      { title: "Nullité saisie", impact: "Incident à trancher." },
      { title: "Communication de pièces", impact: "Ordonnance de communication." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 10) MINIER
  {
    templateId: "TPL_MINIER_TITRE_CONCESSION",
    domaine: "Minier",
    baseTitle: "Concession minière, droits des tiers & ordre public",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "societe", statut: "Société", poolNames: ["KATANGA MINING SA", "LUALABA RESOURCES", "COPPER ONE"] },
      { key: "tiers", statut: "Tiers", poolNames: ["Coopérative artisanale", "Communauté locale", "M. X."] },
      { key: "etat", statut: "Autorité", poolNames: ["Service des mines", "Autorité provinciale"] },
      { key: "conseil", statut: "Conseil", poolNames: ["Me Minier", "Me Kanyinda", "Me Kabeya"] },
    ],
    factsVariants: [
      "Conflit entre permis/titre minier et activités artisanales. Débat sur droits, sécurité, environnement et mesures.",
      "Production tardive d’un document technique (plan, permis). Demande de communication et renvoi.",
      "Demande de disjonction: plusieurs sites/acteurs, risque de confusion.",
      "Nullité soulevée: défaut de notification ou vice de procédure administrative.",
    ],
    legalIssuesPool: [
      "Validité/opposabilité du titre minier",
      "Droits des tiers et mesures de sécurité",
      "Environnement et ordre public",
      "Procédure/notifications et nullités",
      "Communication de pièces et renvoi",
      "Mesures provisoires",
    ],
    piecesPool: [
      { type: "Titre minier", titlePool: ["Permis d’exploitation", "Permis de recherche", "Arrêté"], contentPool: ["Références…", "Coordonnées…", "Validité…"] },
      { type: "Technique", titlePool: ["Plan", "Rapport technique", "Carte"], contentPool: ["Zones…", "Périmètre…", "Incohérences…"] },
      { type: "Environnement", titlePool: ["Rapport EIE", "Note", "PV"], contentPool: ["Mesures…", "Non-conformités…", "Risques…"] },
      { type: "Preuve", titlePool: ["Photos", "Attestations", "PV"], contentPool: ["Incidents…", "Présences…", "Dates…"] },
      { type: "Correspondance", titlePool: ["Mise en demeure", "Décision", "Réclamation"], contentPool: ["Demandes…", "Refus…", "Conditions…"] },
    ],
    eventsDeckPool: [
      { title: "Mesure provisoire sécurité", impact: "Décision motivée (ordre public)." },
      { title: "Disjonction demandée", impact: "Bonne administration de la justice." },
      { title: "Pièce tardive", impact: "Contradictoire + renvoi." },
      { title: "Nullité", impact: "Incident à trancher." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },

  // 11) PÉNAL MILITAIRE
  {
    templateId: "TPL_PENAL_MILITAIRE_INSUBORDINATION",
    domaine: "Pénal militaire",
    baseTitle: "Discipline, insubordination & garanties de procédure",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "prevenu", statut: "Prévenu (militaire)", poolNames: ["Sgt. K.", "Cpl. M.", "Adjt. N."] },
      { key: "parquet", statut: "Ministère public", poolNames: ["Parquet militaire"] },
      { key: "commandement", statut: "Commandement", poolNames: ["Commandement unité"] },
      { key: "defense", statut: "Défense", poolNames: ["Me Militaria", "Me Kabeya", "Me Mbuyi"] },
    ],
    factsVariants: [
      "Le prévenu est poursuivi pour insubordination. La défense invoque irrégularités d’arrestation et absence d’assistance.",
      "Production tardive d’un rapport hiérarchique. Demande de communication/renvoi.",
      "Demande de jonction avec une autre procédure disciplinaire.",
      "Nullité soulevée sur notification ou compétence.",
    ],
    legalIssuesPool: [
      "Compétence et statut du prévenu",
      "Régularité des actes et droits de la défense",
      "Valeur des rapports hiérarchiques (preuve)",
      "Communication de pièces et contradictoire",
      "Décisions incidentes motivées",
    ],
    piecesPool: [
      { type: "Rapport", titlePool: ["Rapport hiérarchique", "Note de service", "PV interne"], contentPool: ["Mentions…", "Contradictions…", "Date…"] },
      { type: "Acte", titlePool: ["Ordre", "Notification", "Convocation"], contentPool: ["Forme…", "Signature…", "Délai…"] },
      { type: "PV", titlePool: ["PV d’audition", "PV d’arrestation", "PV de constat"], contentPool: ["Heure…", "Conseil…", "Mentions…"] },
      { type: "Preuve", titlePool: ["Attestation", "Photo", "Enregistrement"], contentPool: ["Authenticité…", "Contexte…", "Tardiveté…"] },
      { type: "Médical", titlePool: ["Certificat", "Rapport médical", "Attestation"], contentPool: ["État…", "Compatibilité…", "Contestations…"] },
    ],
    eventsDeckPool: [
      { title: "Rapport tardif", impact: "Contradictoire + renvoi." },
      { title: "Nullité", impact: "Décision incidente motivée." },
      { title: "Jonction", impact: "Connexité disciplinaire." },
      { title: "Renvoi", impact: "Diligence à apprécier." },
    ],
    objectionPool: [...COMMON_INCIDENTS],
  },
];

/* =========================
   Generation helpers (local)
========================= */
function buildParties(rng, schema) {
  const out = {};
  for (const s of schema || []) {
    const nom = pick(rng, s.poolNames) || s.poolNames?.[0] || "Partie";
    out[s.key] = { nom, statut: s.statut };
  }
  return out;
}

function buildPieces(rng, pool, count = 6) {
  const maxWanted = Math.max(4, count);
  const items = pickN(rng, pool, count ? clamp(maxWanted, 4, pool?.length || 6) : 4);

  const pieces = items.map((it, idx) => {
    const id = idPiece(idx + 1);
    const reliability = clamp(Math.round(55 + rng() * 45), 0, 100);
    const isLate = rng() < 0.18;
    return {
      id,
      type: it.type,
      title: (pick(rng, it.titlePool) || it.type) + (it.type === "Facture" ? ` ${Math.floor(1000 + rng() * 9000)}` : ""),
      content: `${pick(rng, it.contentPool) || "Contenu…"} (réf. ${id})`,
      reliability,
      isLate,
    };
  });

  while (pieces.length < 4) {
    const it = pick(rng, pool);
    const id = idPiece(pieces.length + 1);
    pieces.push({
      id,
      type: it?.type || "Pièce",
      title: pick(rng, it?.titlePool) || `Pièce ${id}`,
      content: `${pick(rng, it?.contentPool) || "Contenu…"} (réf. ${id})`,
      reliability: clamp(Math.round(55 + rng() * 45), 0, 100),
      isLate: rng() < 0.18,
    });
  }

  if (!pieces.some((p) => p.isLate)) pieces[clamp(Math.floor(rng() * pieces.length), 0, pieces.length - 1)].isLate = true;
  if (!pieces.some((p) => (p.reliability ?? 100) <= 65)) pieces[0].reliability = 60;

  return pieces.slice(0, 10);
}

function injectDynamicEffects(objection, pieces) {
  const mapId = (id) => {
    if (!id) return id;
    if (id === "P1" && pieces[0]) return pieces[0].id;
    if (id === "P2" && pieces[1]) return pieces[1].id;
    if (id === "P3" && pieces[2]) return pieces[2].id;
    if (id === "P4" && pieces[3]) return pieces[3].id;
    return id;
  };

  const clone = JSON.parse(JSON.stringify(objection));
  const fx = clone.effects || {};
  const keys = ["onAccueillir", "onRejeter", "onDemander"];
  for (const k of keys) {
    if (!fx[k]) continue;
    if (Array.isArray(fx[k].excludePieceIds)) fx[k].excludePieceIds = fx[k].excludePieceIds.map(mapId);
    if (Array.isArray(fx[k].admitLatePieceIds)) fx[k].admitLatePieceIds = fx[k].admitLatePieceIds.map(mapId);
  }
  clone.effects = fx;
  return clone;
}

/* =========================
   ✅ UI mapping (JusticeLab.jsx)
========================= */
function toUiCase(caseData) {
  const meta = caseData?.meta || {};
  const domainSlug = slugDomain(caseData?.domaine || meta?.inferredDomain || meta?.requestedDomain || "penal");
  const levelSlug = normalizeUiLevel(caseData?.niveau || "intermédiaire");
  const city = meta?.city || DEFAULT_CITY;
  const tribunal = meta?.tribunal || "Tribunal";

  return {
    id: caseData.caseId,
    title: caseData.titre,
    summary: caseData.resume,
    domain: domainSlug,
    level: levelSlug,
    city,
    jurisdiction: tribunal,
    caseNumber: caseData.caseId,
    isDynamic: meta?.source && meta.source !== "base",
    ...caseData,
  };
}

/* =========================
   Local generation (seeded)
   ✅ anti-duplication + seed auto si vide
========================= */
export function generateCase({ templateId, seed, level, domain, prompt, source = "generated" } = {}) {
  // ✅ Seed auto unique si non fourni, pour éviter dossiers identiques
  let seedNorm = normalizeSeed(seed);

  if (!seedNorm && source !== "base") {
    seedNorm = `AUTO:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  }
  if (!seedNorm) seedNorm = "0";

  const domainSlug = domain ? slugDomain(domain) : "";
  const inferred = !domainSlug ? inferDomainFromPrompt(prompt) : domainSlug;

  const tplId = templateId || mapDomainToTemplateId(inferred);
  const tpl = CASE_TEMPLATES.find((t) => t.templateId === tplId) || CASE_TEMPLATES[0];

  // ✅ Unicité: ne pas produire un dossier déjà existant (local ou généré)
  const uniq = ensureUniqueSeedAndId({ templateId: tpl.templateId, seedNorm, source });
  seedNorm = uniq.seedNorm;

  const rng = rngFromSeed(`${tpl.templateId}:${seedNorm}`);

  const lvlChoices = Array.isArray(tpl.levels) && tpl.levels.length ? tpl.levels : ["Intermédiaire"];
  const lvl = level || pick(rng, lvlChoices) || "Intermédiaire";

  const parties = buildParties(rng, tpl.partiesSchema);
  const facts = pick(rng, tpl.factsVariants) || "";
  const legalIssues = pickN(rng, tpl.legalIssuesPool, 4).filter(Boolean);
  const pieces = buildPieces(rng, tpl.piecesPool, 7);

  const events = pickN(rng, tpl.eventsDeckPool, 4).map((e, i) => ({
    id: `E${i + 1}`,
    title: e.title,
    impact: e.impact,
  }));

  const rawObs = pickN(rng, tpl.objectionPool, clamp(Math.floor(3 + rng() * 3), 3, 6));
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

  const city = pick(rng, ["Kinshasa", "Lubumbashi", "Goma", "Kolwezi", "Bukavu", "Matadi", "Mbuji-Mayi"]) || DEFAULT_CITY;
  const { tribunal, chambre, typeAudience } = computeTribunal(tpl.domaine);

  const caseId = mkCaseId(tpl.templateId, seedNorm);
  const titre = `${tpl.baseTitle} — ${pick(rng, ["Dossier", "Cas pratique", "Affaire", "Scénario", "Instance"])} ${pick(rng, ["I", "II", "III", "IV", "V", "A", "B", "C"])}`;

  const promptText = String(prompt || "").trim();
  const resume = promptText
    ? `${promptText}\n\n(⚖️ Dossier ${source === "base" ? "local" : "généré"} — Enjeu indicatif: ${fmtMoney(rng)} • Ville: ${city})`
    : `${facts}\n\nEnjeu indicatif: ${fmtMoney(rng)} • Ville: ${city}.`;

  const pedagogy = buildPedagogy({ domaine: tpl.domaine, level: lvl });

  const caseData = {
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
      requestedDomain: domain || "",
      inferredDomain: inferred,
      userPrompt: promptText || "",
      source, // base | generated | import
    },
  };

  saveCaseToCache(caseData);
  return toUiCase(caseData);
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

function sanitizePieces(pieces, rng) {
  const arr = Array.isArray(pieces) ? pieces : [];
  const out = arr.slice(0, 10).map((p, idx) => {
    const id = String(p?.id || `P${idx + 1}`);
    const title = String(p?.title || p?.titre || `Pièce ${idx + 1}`);
    const type = String(p?.type || p?.kind || "Pièce");
    const isLate = Boolean(p?.isLate || p?.late);
    const reliability =
      Number.isFinite(Number(p?.reliability))
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

/* =========================
   HYDRATE caseData IA -> compatible UI/engine
========================= */
function hydrateCaseData(raw, { domaine, level, seed } = {}) {
  const dom = normalizeDomainLabel(raw?.domaine || domaine);
  const lvl = String(raw?.niveau || raw?.level || level || "Intermédiaire");
  let seedNorm = normalizeSeed(raw?.meta?.seed || raw?.seed || seed);

  if (!seedNorm) seedNorm = `AI:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  const rng = rngFromSeed(`HYDRATE:${dom}:${seedNorm}`);

  const { tribunal, chambre, typeAudience } = computeTribunal(dom);
  const city =
    raw?.meta?.city ||
    raw?.meta?.ville ||
    raw?.city ||
    pick(rng, ["Kinshasa", "Lubumbashi", "Goma", "Kolwezi", "Bukavu", "Matadi"]) ||
    DEFAULT_CITY;

  // ✅ Unicité caseId (si IA renvoie un id déjà existant)
  let caseId = String(raw?.caseId || raw?.id || "");
  if (!caseId) caseId = mkCaseId(mapDomainToTemplateId(dom), seedNorm);

  const existing = collectExistingCaseIds();
  if (existing.has(caseId)) {
    const uniq = ensureUniqueSeedAndId({ templateId: mapDomainToTemplateId(dom), seedNorm, source: "generated" });
    seedNorm = uniq.seedNorm;
    caseId = mkCaseId(mapDomainToTemplateId(dom), seedNorm);
  }

  const titre = String(raw?.titre || raw?.title || `Dossier simulé — ${dom}`);
  const resume = String(raw?.resume || raw?.summary || "");

  const parties =
    raw?.parties && typeof raw.parties === "object"
      ? raw.parties
      : {
          demandeur: raw?.parties?.demandeur || raw?.demandeur || "Demandeur",
          defendeur: raw?.parties?.defendeur || raw?.defendeur || "Défendeur",
        };

  const pieces = sanitizePieces(raw?.pieces, rng);

  const legalIssues =
    Array.isArray(raw?.legalIssues) && raw.legalIssues.length
      ? raw.legalIssues.slice(0, 8)
      : pickN(
          rng,
          [
            "Compétence et recevabilité",
            "Contradictoire et égalité des armes",
            "Preuve: authenticité / tardiveté",
            "Motivation suffisante",
            "Mesures d’instruction",
            "Cohérence dispositif",
          ],
          4
        );

  const eventsDeck =
    Array.isArray(raw?.eventsDeck) && raw.eventsDeck.length
      ? raw.eventsDeck.slice(0, 8)
      : pickN(
          rng,
          [
            { title: "Pièce tardive produite", impact: "Débat sur contradictoire." },
            { title: "Demande de renvoi", impact: "Préparation / production de preuve." },
            { title: "Incident de procédure", impact: "Exception recevabilité/compétence." },
            { title: "Mesure d’instruction", impact: "Expertise / descente sur les lieux." },
          ],
          4
        ).map((e, i) => ({ id: `E${i + 1}`, ...e }));

  const objectionTemplates =
    Array.isArray(raw?.objectionTemplates) && raw.objectionTemplates.length ? raw.objectionTemplates.slice(0, 12) : [];

  const pedagogy =
    raw?.pedagogy && typeof raw.pedagogy === "object" ? raw.pedagogy : buildPedagogy({ domaine: dom, level: lvl });

  const meta = {
    templateId: raw?.meta?.templateId || raw?.templateId || mapDomainToTemplateId(dom),
    seed: seedNorm,
    city,
    tribunal: raw?.meta?.tribunal || tribunal,
    chambre: raw?.meta?.chambre || chambre,
    generatedAt: raw?.meta?.generatedAt || new Date().toISOString(),
    source: raw?.meta?.source || raw?.source || "generated",
    inferredDomain: slugDomain(dom),
  };

  const hydrated = {
    caseId,
    domaine: dom,
    typeAudience: raw?.typeAudience || typeAudience,
    niveau: lvl,
    titre,
    resume,
    parties,
    pieces,
    legalIssues,
    eventsDeck,
    objectionTemplates,
    pedagogy,
    meta,
  };

  saveCaseToCache(hydrated);
  return toUiCase(hydrated);
}

/* =========================
   HYBRID: IA enrichissement (optionnel)
========================= */
export async function generateCaseHybrid({ templateId, seed, level, ai = false, apiBase, timeoutMs = 12000, lang = "fr" } = {}) {
  const local = generateCase({ templateId, seed, level, source: "generated" });
  if (!ai) return local;

  const base = getApiBase(apiBase);
  const url = `${base}/justice-lab/generate-case`;

  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "enrich",
          lang,
          caseSeed: local.meta?.seed,
          templateId: local.meta?.templateId,
          domaine: local.domaine,
          level: local.niveau,
          city: local.meta?.city,
          tribunal: local.meta?.tribunal,
          chambre: local.meta?.chambre,
          draft: local,
        }),
      }),
      timeoutMs
    );

    if (!res.ok) return local;
    const data = await res.json();
    const enrichedRaw = data?.caseData || data?.case || null;
    if (!enrichedRaw || typeof enrichedRaw !== "object") return local;

    return hydrateCaseData({ ...local, ...enrichedRaw }, { domaine: local.domaine, level: local.niveau, seed: local.meta?.seed });
  } catch {
    return local;
  }
}

/* =========================
   IA FULL: génère un dossier complet par domaine (fallback local si échec)
========================= */
export async function generateCaseAIByDomain({ domaine = "Pénal", level = "Intermédiaire", seed = undefined, apiBase, timeoutMs = 20000, lang = "fr" } = {}) {
  const base = getApiBase(apiBase);
  const url = `${base}/justice-lab/generate-case`;

  // ✅ Auth: le backend Render protège /justice-lab/generate-case (requireAuth).
  // On récupère un token depuis le localStorage si disponible.
  function getAuthTokenFromStorage() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      const keys = [
        "droitgpt_access_token",
        "token",
        "authToken",
        "accessToken",
        "droitgpt_token",
      ];
      for (const k of keys) {
        const v = window.localStorage.getItem(k);
        if (v && String(v).trim().length > 10) return String(v).trim();
      }
    } catch {
      // ignore
    }
    return null;
  }

  const dom = normalizeDomainLabel(domaine);

  // ✅ seed auto unique si absent
  const theSeed = seed ?? `AI:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const payload = { mode: "full", domaine: dom, level, seed: String(theSeed), lang };

  try {
    const token = getAuthTokenFromStorage();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await withTimeout(
      fetch(url, { method: "POST", headers, body: JSON.stringify(payload) }),
      timeoutMs
    );

    if (!res.ok) {
      const tplId = mapDomainToTemplateId(dom);
      return generateCase({ templateId: tplId, seed: payload.seed, level, source: "generated" });
    }

    const data = await res.json();
    const raw = data?.caseData || data?.case;
    if (!raw || typeof raw !== "object") {
      const tplId = mapDomainToTemplateId(dom);
      return generateCase({ templateId: tplId, seed: payload.seed, level, source: "generated" });
    }

    const hydrated = hydrateCaseData(raw, { domaine: dom, level, seed: payload.seed });
    if (!String(hydrated.summary || hydrated.resume || "").trim()) {
      const rng = rngFromSeed(`RESUME:${dom}:${payload.seed}`);
      hydrated.resume = `Dossier ${dom} (simulation RDC). Enjeu indicatif: ${fmtMoney(rng)}. Ville: ${hydrated.meta?.city || DEFAULT_CITY}.`;
      hydrated.summary = hydrated.resume;
    }

    return hydrated;
  } catch {
    const tplId = mapDomainToTemplateId(dom);
    return generateCase({ templateId: tplId, seed: String(theSeed), level, source: "generated" });
  }
}

/* =========================
   ✅ Mode Import PDF (dossier réel → simulation)
========================= */
export async function importCaseFromDocumentText({
  documentText,
  filename = "document.pdf",
  domain = "",
  level = "Intermédiaire",
  seed = undefined,
  ai = true,
  apiBase,
  lang = "fr",
} = {}) {
  const text = String(documentText || "").trim();
  const textShort = text.replace(/\s+/g, " ").slice(0, 1500);

  const inferredSlug = domain ? slugDomain(domain) : inferDomainFromPrompt(text);
  const inferredLabel = normalizeDomainLabel(inferredSlug);

  const theSeed = seed ?? `DOC:${shortHash(filename)}:${Date.now()}`;

  if (ai) {
    const caseData = await generateCaseAIByDomain({
      domaine: inferredLabel,
      level,
      seed: String(theSeed),
      apiBase,
      timeoutMs: 25000,
      lang,
    });

    const merged = {
      ...caseData,
      resume: `📄 Import (${filename}) — extrait: ${textShort}\n\n${caseData.resume || ""}`.trim(),
      summary: `📄 Import (${filename}) — extrait: ${textShort}`.trim(),
      meta: {
        ...(caseData.meta || {}),
        source: "import",
        inferredDomain: inferredSlug,
        filename,
        excerpt: textShort,
      },
    };

    saveCaseToCache(merged);
    return toUiCase(merged);
  }

  const local = generateCase({
    templateId: mapDomainToTemplateId(inferredSlug),
    seed: String(theSeed),
    level,
    domain: inferredSlug,
    prompt: `📄 Import (${filename}) — extrait: ${textShort}`,
    source: "import",
  });

  return local;
}

/* =========================
   ✅ Mode Greffier: PV certifié
========================= */
function toLine(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function nowFR() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function summarizeJournal(journalEntries = []) {
  const arr = Array.isArray(journalEntries) ? journalEntries : [];
  const lines = [];
  for (const e of arr) {
    const t = toLine(e?.type || e?.action || "");
    const at = toLine(e?.at || e?.time || e?.ts || "");
    const label = toLine(e?.label || e?.title || e?.message || "");
    const detail = toLine(e?.detail || e?.content || "");
    const stamp = at ? `[${at}] ` : "";
    const head = [t, label].filter(Boolean).join(" — ");
    const tail = detail ? ` : ${detail}` : "";
    if (head) lines.push(`${stamp}${head}${tail}`.trim());
  }
  return lines.slice(0, 140);
}

export function buildGreffierPV({ caseData, runData, journalEntries, greffierName = "Le Greffier" } = {}) {
  const cd = caseData || {};
  const meta = cd?.meta || {};
  const parties = cd?.parties || {};
  const lines = summarizeJournal(journalEntries);

  const tribunal = meta?.tribunal || "Tribunal";
  const chambre = meta?.chambre || "Chambre";
  const ville = meta?.city || DEFAULT_CITY;

  const header = [
    "RÉPUBLIQUE DÉMOCRATIQUE DU CONGO",
    "———",
    `PROCÈS-VERBAL D’AUDIENCE (PV) — CERTIFIÉ`,
    `Juridiction : ${tribunal}`,
    `Chambre : ${chambre}`,
    `Ville : ${ville}`,
    `Date/heure : ${nowFR()}`,
    `Référence dossier : ${cd.caseId || "—"}`,
    `Intitulé : ${cd.titre || "—"}`,
    "",
  ].join("\n");

  const partiesTxt = [
    "PARTIES / QUALITÉS",
    `- Partie 1 : ${toLine(parties?.demandeur?.nom || parties?.demandeur?.name || parties?.demandeur || parties?.prevenu?.nom || parties?.prevenu?.name || "—")}`,
    `- Partie 2 : ${toLine(parties?.defendeur?.nom || parties?.defendeur?.name || parties?.defendeur || parties?.victime?.nom || parties?.victime?.name || "—")}`,
    parties?.parquet ? `- Ministère public : ${toLine(parties?.parquet?.nom || parties?.parquet)}` : "",
    "",
  ].filter(Boolean).join("\n");

  const pieces = Array.isArray(cd?.pieces) ? cd.pieces : [];
  const piecesTxt = [
    "PIÈCES PRODUITES (résumé)",
    ...pieces.slice(0, 12).map((p) => `- ${p.id} — ${toLine(p.title)} ${p.isLate ? "(tardive)" : ""} — fiabilité: ${p.reliability ?? "—"}%`),
    "",
  ].join("\n");

  const body = [
    "DÉROULEMENT / MENTIONS",
    lines.length ? lines.map((x) => `- ${x}`).join("\n") : "- (Aucune mention consignée)",
    "",
  ].join("\n");

  const certification = [
    "CERTIFICATION",
    `Je soussigné(e), ${greffierName}, certifie exact et conforme le présent procès-verbal.`,
    `Fait à ${ville}, le ${nowFR()}.`,
    "",
    "SIGNATURES",
    `Le Greffier : _______________________ (${greffierName})`,
    "Le Président / Juge : _______________________",
    "",
  ].join("\n");

  const pvText = [header, partiesTxt, piecesTxt, body, certification].join("\n");

  return {
    pvText,
    meta: {
      type: "PV_CERTIFIE",
      createdAt: new Date().toISOString(),
      greffierName,
      caseId: cd.caseId,
      runId: runData?.runId || runData?.id || null,
    },
  };
}

/* =========================
   ✅ Mode Examen: notation magistrature
========================= */
function countIncidents(journalEntries = []) {
  const arr = Array.isArray(journalEntries) ? journalEntries : [];
  return arr.filter((e) => /incident|nullit|renvoi|jonction|disjonction|communication/i.test(String(e?.label || e?.title || e?.message || ""))).length;
}
function hasDecisionLikeText(decisionText) {
  const t = String(decisionText || "").toLowerCase();
  return /par ces motifs|statuant|attendu que|dispositif|rejette|accueille|ordonne/i.test(t);
}
function scoreFromRun(runData) {
  const s = Number(runData?.scored?.scoreGlobal ?? runData?.ai?.scoreGlobal);
  return Number.isFinite(s) ? s : null;
}

export function gradeMagistratureExam({ caseData, runData, journalEntries, decisionText } = {}) {
  const cd = caseData || {};
  const baseScore = scoreFromRun(runData);

  let procedure = 15;   // /30
  let motivation = 15;  // /30
  let conduite = 10;    // /20
  let deontologie = 6;  // /10
  let redaction = 6;    // /10

  const incidents = countIncidents(journalEntries);
  procedure += clamp(incidents * 2, 0, 10);

  const pieces = Array.isArray(cd?.pieces) ? cd.pieces : [];
  const hasLate = pieces.some((p) => p.isLate);
  if (hasLate) procedure += 3;

  if (hasDecisionLikeText(decisionText)) motivation += 10;

  const jCount = Array.isArray(journalEntries) ? journalEntries.length : 0;
  conduite += clamp(Math.floor(jCount / 6), 0, 10);

  const badWords = /(corromp|argent|cadeau|menace|pression)/i;
  const joined = (Array.isArray(journalEntries) ? journalEntries : []).map((e) => `${e?.label || ""} ${e?.detail || ""}`).join(" ");
  if (!badWords.test(joined)) deontologie += 2;

  const dt = String(decisionText || "");
  if (dt.length > 600) redaction += 2;
  if (dt.length > 1200) redaction += 2;

  let total = procedure + motivation + conduite + deontologie + redaction;
  total = clamp(total, 0, 100);

  if (baseScore !== null) total = clamp(Math.round(total * 0.7 + baseScore * 0.3), 0, 100);

  const appreciation =
    total >= 85 ? "Excellent — niveau magistrature confirmé"
    : total >= 70 ? "Très bon — solide, quelques ajustements"
    : total >= 55 ? "Moyen — lacunes à corriger"
    : "Insuffisant — reprise complète recommandée";

  return {
    score: total,
    appreciation,
    rubric: {
      procedure: { score: clamp(procedure, 0, 30), max: 30 },
      motivation: { score: clamp(motivation, 0, 30), max: 30 },
      conduiteAudience: { score: clamp(conduite, 0, 20), max: 20 },
      deontologie: { score: clamp(deontologie, 0, 10), max: 10 },
      redaction: { score: clamp(redaction, 0, 10), max: 10 },
    },
    meta: {
      caseId: cd.caseId || null,
      domaine: cd.domaine || null,
      tribunal: cd?.meta?.tribunal || null,
      chambre: cd?.meta?.chambre || null,
      usedEngineScore: baseScore !== null,
    },
    recommandations: [
      "Motiver toute décision d’incident en 2–6 phrases (faits → règle → application).",
      "Tracer au PV: demandes, objections, décisions, pièces admises/écartées.",
      "Gérer explicitement les pièces tardives (communication + délai).",
      "Soigner le dispositif: clair, exécutoire, cohérent avec la motivation.",
    ],
  };
}

/* =========================
   ✅ Dossiers générés (cache) — uniquement non-base
========================= */
export function listGeneratedCases({ limit = 24 } = {}) {
  const cache = loadCaseCache();
  const arr = Object.values(cache || []).filter((c) => c?.meta?.source && c.meta.source !== "base");
  const sorted = arr.sort((a, b) => {
    const ta = new Date(a?.meta?.generatedAt || 0).getTime();
    const tb = new Date(b?.meta?.generatedAt || 0).getTime();
    return tb - ta;
  });
  return sorted.slice(0, Math.max(0, Number(limit) || 24)).map((c) => toUiCase(c));
}

/* =========================
   ✅ 24 dossiers locaux VARIÉS (TOUS DIFFÉRENTS)
   - pas un “pack par niveaux”
   - seeds BASE:* pour garantir non-collision avec IA
========================= */
function buildBaseCases24() {
  const combos = [
    // Pénal (variations + niveaux mélangés)
    ["TPL_PENAL_DETENTION", "débutant", "Affaire de vol simple + contestation PV"],
    ["TPL_PENAL_DETENTION", "intermédiaire", "Détention préventive + preuve numérique tardive"],
    ["TPL_PENAL_DETENTION", "avancé", "Nullité d’acte + débat contradictoire renforcé"],

    // Foncier (3 dossiers distincts)
    ["TPL_FONCIER_TITRE_COUTUME", "intermédiaire", "Double vente + titres concurrents"],
    ["TPL_FONCIER_TITRE_COUTUME", "avancé", "Bornage contesté + descente sur les lieux"],
    ["TPL_FONCIER_TITRE_COUTUME", "débutant", "Occupation paisible + coutume vs acte"],

    // Travail (3 dossiers distincts)
    ["TPL_TRAVAIL_LICENCIEMENT", "débutant", "Licenciement sans procédure + indemnités"],
    ["TPL_TRAVAIL_LICENCIEMENT", "intermédiaire", "Abandon de poste contesté + certificat tardif"],
    ["TPL_TRAVAIL_LICENCIEMENT", "avancé", "Heures sup + primes + charge de preuve"],

    // OHADA (3 dossiers distincts)
    ["TPL_OHADA_INJONCTION_PAYER", "débutant", "Factures + contestation réception"],
    ["TPL_OHADA_INJONCTION_PAYER", "intermédiaire", "Opposition tardive + délais OHADA"],
    ["TPL_OHADA_INJONCTION_PAYER", "avancé", "Compensation + expertise qualité"],

    // Constitutionnel (3 dossiers distincts)
    ["TPL_CONSTITUTIONNEL_DROITS_FONDAMENTAUX", "débutant", "Limitation réunion publique + base légale"],
    ["TPL_CONSTITUTIONNEL_DROITS_FONDAMENTAUX", "intermédiaire", "Mesure provisoire + urgence"],
    ["TPL_CONSTITUTIONNEL_DROITS_FONDAMENTAUX", "avancé", "Contrôle proportionnalité structuré"],

    // Administratif (3 dossiers distincts)
    ["TPL_ADMIN_PERMIS_SANCTION", "débutant", "Retrait permis commerce + motivation"],
    ["TPL_ADMIN_PERMIS_SANCTION", "intermédiaire", "Sanction sans audition + nullité"],
    ["TPL_ADMIN_PERMIS_SANCTION", "avancé", "Délais recours + mesure provisoire"],

    // Famille (3 dossiers distincts)
    ["TPL_FAMILLE_GARDE_PENSION", "débutant", "Garde + droit visite + tensions"],
    ["TPL_FAMILLE_GARDE_PENSION", "intermédiaire", "Pension alimentaire + revenus contestés"],
    ["TPL_FAMILLE_GARDE_PENSION", "avancé", "Enquête sociale + mesures provisoires"],

    // Variété haute (3 dossiers distincts)
    ["TPL_FISCAL_REDRESSEMENT", "intermédiaire", "Redressement fiscal + pièces comptables tardives"],
    ["TPL_DOUANIER_CONTENTIEUX", "débutant", "Saisie douanière + mainlevée sous garantie"],
    ["TPL_MINIER_TITRE_CONCESSION", "avancé", "Concession vs coop artisanale + ordre public"],
  ];

  // ✅ 24 items exact
  const list = combos.slice(0, 24);

  return list.map(([tplId, lvl, hint], i) =>
    generateCase({
      templateId: tplId,
      seed: `BASE:${i + 1}:${tplId}:${shortHash(hint)}`,
      level: lvl,
      source: "base",
      prompt: "", // local = pas besoin prompt (le template suffit)
    })
  );
}

export const CASES = buildBaseCases24();
