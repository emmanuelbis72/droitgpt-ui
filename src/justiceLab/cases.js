// src/justiceLab/cases.js
// V6 — Production-ready (dossiers dynamiques, pédagogique, IDs stables, multi-templates)
// Compatible: export const CASES = [...]
//
// Exports:
// - export const CASE_TEMPLATES
// - export function generateCase({ templateId, seed, level })
// - export function listGeneratedCases()
// - export const CASES

const DEFAULT_CITY = "Lubumbashi";

// ---------- RNG seeded ----------
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
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
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
  const base = pick(rng, [250, 400, 600, 900, 1200, 2000, 3500, 5000, 12000]) || 600;
  const mult = pick(rng, [1, 1, 1, 2, 3]) || 1;
  return `${base * mult} USD`;
}

function idPiece(i) {
  return `P${i}`;
}

// ---------- Seed + Hash helpers (prod) ----------
function normalizeSeed(seed) {
  if (seed === null || seed === undefined) return "0";
  // string stable
  return String(seed).trim() || "0";
}

function shortHash(input) {
  // hash court base36 (stable)
  const h = xmur3(String(input))();
  return (h >>> 0).toString(36).slice(0, 8);
}

function mkCaseId(templateId, seedNorm) {
  // caseId court, URL safe, unique, stable (template + seed)
  const h = shortHash(`${templateId}:${seedNorm}`);
  // ex: RDC-PEN-8f3k1a2b
  const dom = (templateId || "TPL").replace("TPL_", "").split("_")[0].slice(0, 3).toUpperCase();
  return `RDC-${dom}-${h}`;
}

// ---------- Didactique ----------
function buildPedagogy({ domaine, level }) {
  const commonSkills = [
    "Identifier les questions litigieuses et les qualifier juridiquement",
    "Structurer une motivation (faits → droit → application → conclusion)",
    "Garantir le contradictoire et l’égalité des armes",
    "Gérer la preuve (recevabilité, pertinence, tardiveté)",
    "Maîtriser la gestion d’audience (incidents, police de l’audience, décisions motivées)",
  ];

  const domainSkills = {
    "Pénal": [
      "Contrôle des droits de la défense et de la régularité des actes",
      "Apprécier la détention / mesures alternatives et garanties",
      "Répondre aux nullités / exceptions et incidents d’audience",
    ],
    "Foncier": [
      "Apprécier force probante du titre et pièces cadastrales",
      "Gérer l’expertise/bornage et mesures d’instruction",
      "Arbitrer conflit titre vs occupation coutumière",
    ],
    "Travail": [
      "Qualifier la rupture (faute, préavis, indemnités)",
      "Apprécier preuves (contrat, bulletins, avertissements, attestations)",
      "Concilier réparation, proportionnalité, et équité",
    ],
  };

  const pitfalls = [
    "Motiver trop court / sans répondre aux moyens des parties",
    "Trancher une objection sans entendre l’autre partie (contradictoire)",
    "Admettre une pièce tardive sans justification",
    "Écarter une pièce clé sans base procédurale claire",
    "Négliger les délais / formalités essentielles",
  ];

  const checklist = [
    "Ai-je résumé l’incident de façon neutre ?",
    "Ai-je entendu les parties sur l’incident (oui/non) ?",
    "Ma décision est-elle motivée en 2–5 phrases ?",
    "Ai-je noté l’impact sur les pièces (admise/écartée) ?",
    "Ai-je identifié le risque d’appel (faible/moyen/élevé) ?",
  ];

  const skills = [...commonSkills, ...(domainSkills[domaine] || [])];
  const lvl = level || "Intermédiaire";

  return {
    level: lvl,
    objectifs: skills.slice(0, 7),
    erreursFrequentes: pitfalls,
    checklistAudience: checklist,
  };
}

// ---------- Templates ----------
export const CASE_TEMPLATES = [
  {
    templateId: "TPL_PENAL_DETENTION",
    domaine: "Pénal",
    baseTitle: "Détention préventive & droits de la défense",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "prevenu", statut: "Prévenu", poolNames: ["M. K.", "M. N.", "M. S.", "M. T."] },
      { key: "victime", statut: "Victime", poolNames: ["Mme B.", "Mme L.", "Mme R."] },
      { key: "parquet", statut: "Parquet", poolNames: ["Ministère public"] },
    ],
    factsVariants: [
      "Le prévenu est maintenu en détention au-delà des délais. L’accès au conseil est contesté. Le dossier est incomplet.",
      "Une arrestation a eu lieu dans des conditions discutées. La défense invoque une irrégularité et un dépassement de délai.",
      "Des déclarations contradictoires existent au PV. La défense conteste la régularité d’un acte essentiel.",
      "Une pièce technique arrive tardivement et l’autre partie invoque une atteinte au contradictoire.",
    ],
    legalIssuesPool: [
      "Contrôle de la détention préventive",
      "Droits de la défense et contradictoire",
      "Recevabilité des pièces tardives",
      "Motivation et cohérence du dispositif",
      "Nullités et exceptions de procédure",
    ],
    piecesPool: [
      { type: "PV", titlePool: ["PV d'audition", "PV de constat", "PV d'interpellation"], contentPool: ["Déclarations contradictoires…", "Mention d’horaire discutée…", "Signature manquante…"] },
      { type: "Note", titlePool: ["Note du commissariat", "Rapport d’enquête", "Note de service"], contentPool: ["Demande de prolongation…", "Informations incomplètes…", "Mention d’un témoin non entendu…"] },
      { type: "Requête", titlePool: ["Demande de mise en liberté provisoire", "Exception de nullité", "Demande d’audience rapide"], contentPool: ["Délais, garanties, santé…", "Atteinte aux droits de la défense…", "Contradictoire non respecté…"] },
      { type: "Certificat", titlePool: ["Certificat médical", "Attestation", "Constat"], contentPool: ["État de santé invoqué…", "Suivi recommandé…", "Compatibilité avec la détention discutée…"] },
      { type: "Preuve", titlePool: ["Capture WhatsApp", "Photo", "Rapport technique"], contentPool: ["Horodatage contesté…", "Origine incertaine…", "Chaîne de custody discutée…"] },
    ],
    eventsDeckPool: [
      { title: "Témoin se rétracte", impact: "Une déclaration clé devient incertaine." },
      { title: "Nouvelle preuve tardive", impact: "Une pièce arrive au dernier moment." },
      { title: "Nullité soulevée", impact: "La défense conteste la régularité d'un acte." },
      { title: "Témoin indisponible", impact: "Un renvoi est demandé pour entendre un témoin." },
    ],
    objectionPool: [
      {
        by: "Avocat",
        title: "Nullité pour atteinte aux droits de la défense",
        statement: "La défense soutient une atteinte au contradictoire/assistance effective et demande la nullité.",
        effects: {
          onAccueillir: { dueProcessBonus: 2, addTask: { type: "NOTE", label: "Motiver la nullité (2–5 phrases)", detail: "Faits → principe → application." } },
          onRejeter: { risk: "MEDIUM", appealRiskPenaltyOnWrong: 2 },
          onDemander: { clarification: { type: "QUESTION", label: "Préciser l’acte irrégulier et son impact", detail: "Quel acte ? Quelle atteinte ? Quelle conséquence ?" }, dueProcessBonus: 1 },
        },
      },
      {
        by: "Procureur",
        title: "Recevabilité d’une pièce tardive",
        statement: "Une pièce produite tardivement est contestée. Faut-il l’admettre ?",
        effects: {
          onAccueillir: { admitLatePieceIds: ["P4"], dueProcessBonus: 1 },
          onRejeter: { excludePieceIds: ["P4"], dueProcessBonus: 1 },
          onDemander: { clarification: { type: "QUESTION", label: "Justifier tardiveté / utilité", detail: "Pourquoi tardif ? Quelle utilité ? Préjudice pour l’autre partie ?" } },
        },
      },
      {
        by: "Avocat",
        title: "Demande de mise en liberté provisoire (incident)",
        statement: "Incident d’audience : demande immédiate de mise en liberté provisoire au vu des délais/garanties.",
        effects: {
          onAccueillir: { dueProcessBonus: 2, addTask: { type: "DECISION", label: "Fixer garanties/conditions", detail: "Caution, résidence, présentation..." } },
          onRejeter: { risk: "MEDIUM" },
          onDemander: { clarification: { type: "QUESTION", label: "Préciser garanties proposées", detail: "Adresse, caution, engagement, antécédents." }, dueProcessBonus: 1 },
        },
      },
    ],
  },

  {
    templateId: "TPL_FONCIER_TITRE_COUTUME",
    domaine: "Foncier",
    baseTitle: "Conflit titre foncier vs droit coutumier",
    levels: ["Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "demandeur", statut: "Demandeur", poolNames: ["Société K. Immobilier", "Société L. Habitat", "Société M. Invest"] },
      { key: "defendeur", statut: "Défendeur", poolNames: ["Famille M.", "Famille K.", "Collectif N."] },
      { key: "parquet", statut: "Parquet", poolNames: ["Ministère public"] },
    ],
    factsVariants: [
      "Deux parties revendiquent la même parcelle : l’une a un titre, l’autre invoque une occupation coutumière ancienne.",
      "Le titre existe mais le bornage est contesté. La défense évoque une occupation paisible et continue.",
      "Une vente est contestée : authenticité du plan, limites, et témoignages coutumiers.",
      "Le plan cadastral est ambigu : zone grise, empiètement allégué et expertise privée produite.",
    ],
    legalIssuesPool: [
      "Force probante du titre",
      "Valeur des attestations coutumières",
      "Mesures d’instruction (expertise/bornage)",
      "Recevabilité d’une expertise privée",
      "Délimitation, empiètement et dommages",
    ],
    piecesPool: [
      { type: "Titre", titlePool: ["Titre de propriété", "Certificat d’enregistrement"], contentPool: ["Mentions cadastrales…", "Référence administrative…", "Historique de mutation…"] },
      { type: "PV", titlePool: ["PV de bornage", "PV de constat"], contentPool: ["Bornage contesté…", "Signature discutée…", "Limites imprécises…"] },
      { type: "Attestation", titlePool: ["Attestation coutumière", "Déclaration du chef coutumier"], contentPool: ["Occupation ancienne…", "Reconnaissance locale…", "Frontières traditionnelles…"] },
      { type: "Plan", titlePool: ["Plan cadastral", "Croquis de parcelle"], contentPool: ["Zone grise…", "Empiètement allégué…", "Divergence de limites…"] },
      { type: "Expertise", titlePool: ["Expertise privée", "Rapport topographique"], contentPool: ["Méthode discutée…", "Point de repère incertain…", "Mesures contradictoires…"] },
    ],
    eventsDeckPool: [
      { title: "Expertise contestée", impact: "Une expertise privée est produite et contestée." },
      { title: "Conflit de limites", impact: "Le plan cadastral montre une zone grise." },
      { title: "Témoignage clé", impact: "Un chef coutumier demande à être entendu." },
      { title: "Renvoi demandé", impact: "Une partie demande un renvoi pour produire une pièce." },
    ],
    objectionPool: [
      {
        by: "Avocat",
        title: "Contestation du PV de bornage (authenticité)",
        statement: "Authenticité / régularité du PV contestée. Demande de mise à l’écart.",
        effects: {
          onAccueillir: { excludePieceIds: ["P2"], dueProcessBonus: 1 },
          onRejeter: { risk: "LOW" },
          onDemander: { clarification: { type: "QUESTION", label: "Préciser l’irrégularité", detail: "Signature ? date ? compétence ? procédure de bornage ?" }, dueProcessBonus: 1 },
        },
      },
      {
        by: "Procureur",
        title: "Demande d’expertise / renvoi pour instruction",
        statement: "Proposition : expertise/bornage judiciaire + renvoi pour compléter l’instruction.",
        effects: {
          onAccueillir: { addTask: { type: "INSTRUCTION", label: "Ordonnance d’expertise", detail: "Objet, mission, délais, consignation." }, dueProcessBonus: 1 },
          onRejeter: { risk: "MEDIUM" },
          onDemander: { clarification: { type: "QUESTION", label: "Préciser mission d’expertise", detail: "Questions techniques: limites, empiètement, concordance titre/plan." } },
        },
      },
      {
        by: "Avocat",
        title: "Recevabilité attestation coutumière",
        statement: "Recevabilité/force probante discutée. Quelle valeur accorder ?",
        effects: {
          onAccueillir: { dueProcessBonus: 1 },
          onRejeter: { risk: "MEDIUM" },
          onDemander: { clarification: { type: "QUESTION", label: "Identifier signataires et contexte", detail: "Qui signe ? Quel fondement ? Quel lien avec la parcelle ?" }, dueProcessBonus: 1 },
        },
      },
    ],
  },

  // ✅ NOUVEAU template “Travail” (utile pour magistrats & inspection)
  {
    templateId: "TPL_TRAVAIL_LICENCIEMENT",
    domaine: "Travail",
    baseTitle: "Licenciement contesté & indemnités",
    levels: ["Débutant", "Intermédiaire", "Avancé"],
    partiesSchema: [
      { key: "employe", statut: "Employé", poolNames: ["Mme K.", "M. B.", "M. L.", "Mme S."] },
      { key: "employeur", statut: "Employeur", poolNames: ["Entreprise M.", "Société K.", "Agence L."] },
      { key: "inspection", statut: "Inspection/Autorité", poolNames: ["Inspection du travail"] },
    ],
    factsVariants: [
      "Un licenciement est contesté : l’employé invoque absence de motif et irrégularités de procédure.",
      "L’employeur invoque faute grave ; l’employé conteste et demande réintégration ou indemnités.",
      "Des avertissements existent mais leur réalité est discutée ; un préavis est contesté.",
      "Un accord verbal est allégué ; preuve documentaire incomplète, témoins contradictoires.",
    ],
    legalIssuesPool: [
      "Motif du licenciement et charge de la preuve",
      "Procédure disciplinaire / contradictoire",
      "Indemnités, préavis, dommages-intérêts",
      "Valeur probante des avertissements",
    ],
    piecesPool: [
      { type: "Contrat", titlePool: ["Contrat de travail", "Avenant", "Offre d’embauche"], contentPool: ["Clauses discutées…", "Fonction et salaire…", "Date d’entrée en service…"] },
      { type: "Bulletin", titlePool: ["Bulletin de paie", "Relevé de paiement"], contentPool: ["Salaire de base…", "Retenues…", "Paiement irrégulier allégué…"] },
      { type: "Lettre", titlePool: ["Lettre de licenciement", "Mise en demeure"], contentPool: ["Motif contesté…", "Date et signature…", "Procédure discutée…"] },
      { type: "Avertissement", titlePool: ["Avertissement", "Note disciplinaire"], contentPool: ["Faits reprochés…", "Réception contestée…", "Absence de contradictoire…"] },
      { type: "Attestation", titlePool: ["Attestation de collègue", "Témoignage"], contentPool: ["Version divergente…", "Contexte de travail…", "Pression alléguée…"] },
    ],
    eventsDeckPool: [
      { title: "Témoin salarié", impact: "Un collègue apporte une version opposée." },
      { title: "Document manquant", impact: "Une pièce clé (contrat/paie) est incomplète." },
      { title: "Conciliation proposée", impact: "Une partie propose un règlement amiable." },
      { title: "Tardiveté de production", impact: "Une pièce arrive après clôture des débats." },
    ],
    objectionPool: [
      {
        by: "Avocat",
        title: "Recevabilité d’un avertissement contesté",
        statement: "Un avertissement est produit, mais l’employé conteste sa réception et sa régularité.",
        effects: {
          onAccueillir: { dueProcessBonus: 1 },
          onRejeter: { excludePieceIds: ["P4"], dueProcessBonus: 1 },
          onDemander: { clarification: { type: "QUESTION", label: "Établir réception / contradictoire", detail: "Preuve de réception ? audition ? date ? signature ?" }, dueProcessBonus: 1 },
        },
      },
      {
        by: "Inspection",
        title: "Proposition de conciliation",
        statement: "L’autorité propose une conciliation : indemnité + attestation de travail.",
        effects: {
          onAccueillir: { addTask: { type: "NOTE", label: "Protocole de conciliation", detail: "Montant, délais, quittance, attestation." }, dueProcessBonus: 1 },
          onRejeter: { risk: "LOW" },
          onDemander: { clarification: { type: "QUESTION", label: "Préciser montant & modalités", detail: "Indemnité ? échéancier ? attestation ? clause de confidentialité ?" } },
        },
      },
      {
        by: "Employeur",
        title: "Pièce tardive de paie / heures",
        statement: "L’employeur produit tardivement des relevés (paie/horaires) contestés.",
        effects: {
          onAccueillir: { admitLatePieceIds: ["P2"], dueProcessBonus: 1 },
          onRejeter: { excludePieceIds: ["P2"], dueProcessBonus: 1 },
          onDemander: { clarification: { type: "QUESTION", label: "Justifier tardiveté & utilité", detail: "Pourquoi tardif ? utilité ? préjudice ?" } },
        },
      },
    ],
  },
];

// ---------- Generation helpers ----------
function buildParties(rng, schema) {
  const out = {};
  for (const s of schema || []) {
    const nom = pick(rng, s.poolNames) || s.poolNames?.[0] || "Partie";
    out[s.key] = { nom, statut: s.statut };
  }
  return out;
}

function buildPieces(rng, pool, count = 5) {
  const maxWanted = Math.max(4, count);
  const items = pickN(rng, pool, clamp(maxWanted, 4, (pool?.length || 6)));
  const pieces = items.map((it, idx) => {
    const id = idPiece(idx + 1);
    return {
      id,
      type: it.type,
      title: pick(rng, it.titlePool) || it.type,
      content: `${pick(rng, it.contentPool) || "Contenu…"} (réf. ${id})`,
    };
  });

  // assure min 4 pièces (P4 existe souvent pour "tardive")
  while (pieces.length < 4) {
    const it = pick(rng, pool);
    const id = idPiece(pieces.length + 1);
    pieces.push({
      id,
      type: it?.type || "Pièce",
      title: pick(rng, it?.titlePool) || `Pièce ${id}`,
      content: `${pick(rng, it?.contentPool) || "Contenu…"} (réf. ${id})`,
    });
  }
  return pieces.slice(0, 6); // garde compact (UI + payload)
}

function injectDynamicEffects(objection, pieces) {
  // map P2/P4 -> ids réels
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

function computeTribunal(domaine) {
  if (domaine === "Pénal") return { tribunal: "Tribunal de paix", chambre: "Audience publique" };
  if (domaine === "Foncier") return { tribunal: "Tribunal de grande instance", chambre: "Chambre foncière" };
  if (domaine === "Travail") return { tribunal: "Tribunal du travail", chambre: "Audience de conciliation / jugement" };
  return { tribunal: "Tribunal", chambre: "Audience" };
}

// ---------- API ----------
export function generateCase({ templateId, seed, level } = {}) {
  const tpl = CASE_TEMPLATES.find((t) => t.templateId === templateId) || CASE_TEMPLATES[0];

  const seedNorm = normalizeSeed(seed ?? "0");
  const rng = rngFromSeed(`${tpl.templateId}:${seedNorm}`);

  const lvlChoices = Array.isArray(tpl.levels) && tpl.levels.length ? tpl.levels : ["Intermédiaire"];
  const lvl = level || pick(rng, lvlChoices) || "Intermédiaire";

  const parties = buildParties(rng, tpl.partiesSchema);
  const facts = pick(rng, tpl.factsVariants) || "";
  const legalIssues = pickN(rng, tpl.legalIssuesPool, 3).filter(Boolean);

  const pieces = buildPieces(rng, tpl.piecesPool, 5);

  const events = pickN(rng, tpl.eventsDeckPool, 3).map((e, i) => ({
    id: `E${i + 1}`,
    title: e.title,
    impact: e.impact,
  }));

  // objections (2–4)
  const rawObs = pickN(rng, tpl.objectionPool, clamp(Math.floor(2 + rng() * 3), 2, 4));
  const objections = rawObs.map((o, i) => {
    const domTag = (tpl.domaine || "DOM").slice(0, 3).toUpperCase();
    const objId = `${domTag}_OBJ_${i + 1}`;

    return {
      id: objId,
      by: o.by,
      title: o.title,
      statement: o.statement,
      options: ["Accueillir", "Rejeter", "Demander précision"],
      // bestChoiceByRole aide l’UI “instant feedback”
      bestChoiceByRole: {
        Juge: "Demander précision",
        Procureur: o.by === "Procureur" ? "Accueillir" : "Rejeter",
        Avocat: o.by === "Avocat" ? "Accueillir" : "Rejeter",
      },
      effects: o.effects,
    };
  });

  const objectionTemplates = objections.map((o) => injectDynamicEffects(o, pieces));

  const city = pick(rng, ["Kinshasa", "Lubumbashi", "Goma", "Kolwezi", "Bukavu"]) || DEFAULT_CITY;
  const { tribunal, chambre } = computeTribunal(tpl.domaine);

  const caseId = mkCaseId(tpl.templateId, seedNorm);
  const titre = `${tpl.baseTitle} — ${pick(rng, ["Dossier A", "Dossier B", "Dossier C", "Cas pratique", "Affaire"])}`;

  const resume = `${facts} Montant/enjeu indicatif: ${fmtMoney(rng)}. Ville: ${city}.`;

  const pedagogy = buildPedagogy({ domaine: tpl.domaine, level: lvl });

  return {
    caseId,
    domaine: tpl.domaine,
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
      seed: seedNorm, // on conserve le seed original normalisé
      city,
      tribunal,
      chambre,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function listGeneratedCases() {
  // Catalogue “stable” (utile pour proposer des cas sans cliquer Générer)
  // ⚠️ Seeds courts + variété de domaines
  return [
    generateCase({ templateId: "TPL_PENAL_DETENTION", seed: "1", level: "Intermédiaire" }),
    generateCase({ templateId: "TPL_PENAL_DETENTION", seed: "2", level: "Avancé" }),
    generateCase({ templateId: "TPL_PENAL_DETENTION", seed: "3", level: "Débutant" }),
    generateCase({ templateId: "TPL_FONCIER_TITRE_COUTUME", seed: "7", level: "Avancé" }),
    generateCase({ templateId: "TPL_FONCIER_TITRE_COUTUME", seed: "9", level: "Intermédiaire" }),
    generateCase({ templateId: "TPL_TRAVAIL_LICENCIEMENT", seed: "5", level: "Intermédiaire" }),
    generateCase({ templateId: "TPL_TRAVAIL_LICENCIEMENT", seed: "11", level: "Avancé" }),
  ];
}

// ✅ Compatibilité avec l’existant : ton UI peut continuer à faire CASES.find(...)
export const CASES = listGeneratedCases();
