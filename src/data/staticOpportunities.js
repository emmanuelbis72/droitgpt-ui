export const STATIC_OPPORTUNITIES_LAST_UPDATED = "2026-08-22";

export const STATIC_OPPORTUNITY_CATEGORIES = [
  { id: "all", label: "Toutes" },
  { id: "entrepreneurs", label: "Entrepreneurs" },
  { id: "tenders", label: "Appels d'offres" },
];

export const STATIC_OPPORTUNITIES = [
  {
    id: "ean-fellowship-2026",
    category: "entrepreneurs",
    status: "open",
    title: "Enterprise Africa Network Fellowship Programme Cohort 2 (2026/27)",
    organization: "Commission de l'Union africaine",
    type: "Fellowship / accélération",
    deadline: "2026-09-30T21:59:59.000Z",
    deadlineText: "30 septembre 2026",
    countries: ["RDC", "55 Etats membres de l'Union africaine"],
    sectors: ["Entrepreneuriat", "PME", "Femmes", "Jeunes", "Commerce intra-africain"],
    summary:
      "Programme d'accélération pour 100 MSME africaines, avec formation, mentorat, propriété intellectuelle, intelligence marché et accès aux réseaux africains.",
    eligibility:
      "Entreprises africaines prometteuses, avec attention particulière aux entreprises portées par les jeunes et les femmes. Vérifier les critères finaux sur la page source avant candidature.",
    amount: "Accompagnement non financier principal",
    sourceName: "Opportunities for Youth",
    sourceUrl:
      "https://opportunitiesforyouth.org/2026/08/19/enterprise-africa-network-ean-fellowship-programme-cohort-2-2026-27-100-entrepreneurship-fellowships-for-african-msmes/",
    verificationNotes:
      "Annonce publiée le 19 août 2026, couverture tous Etats membres de l'Union africaine, deadline future au 22 août 2026.",
  },
  {
    id: "africa-prize-engineering-2027",
    category: "entrepreneurs",
    status: "open",
    title: "Africa Prize for Engineering Innovation 2027",
    organization: "Royal Academy of Engineering",
    type: "Prix / accompagnement innovation",
    deadline: "2026-09-08T15:00:00.000Z",
    deadlineText: "8 septembre 2026, 16:00 UTC+1",
    countries: ["RDC", "Afrique subsaharienne"],
    sectors: ["Innovation", "Ingénierie", "Tech", "Impact"],
    summary:
      "Prix et accompagnement pour innovateurs africains développant des solutions d'ingénierie scalables répondant à des problèmes locaux.",
    eligibility:
      "Innovateurs d'Afrique subsaharienne âgés de 18 ans ou plus, avec solution d'ingénierie crédible. Vérifier les conditions détaillées sur le portail RAEng.",
    amount: "Prix jusqu'à 50 000 GBP pour le lauréat, selon la documentation du programme",
    sourceName: "Royal Academy of Engineering",
    sourceUrl: "https://africaprize.raeng.org.uk/about-the-prize/how-to-apply/",
    verificationNotes:
      "Source officielle RAEng consultée : les candidatures 2027 sont ouvertes avec deadline future au 22 août 2026.",
  },
  {
    id: "cfc-29th-call-2026",
    category: "entrepreneurs",
    status: "open",
    title: "Common Fund for Commodities - 29th Call for Proposals",
    organization: "Common Fund for Commodities",
    type: "Appel à projets / financement agriculture",
    deadline: "2026-10-01T21:59:59.000Z",
    deadlineText: "1er octobre 2026",
    countries: ["RDC", "Pays membres du CFC"],
    sectors: ["Agriculture", "Chaînes de valeur", "Coopératives", "PME", "Climat"],
    summary:
      "Financement de projets qui renforcent les chaînes de valeur agricoles, les petits producteurs, les coopératives et les entreprises rurales durables.",
    eligibility:
      "PME, coopératives, entreprises sociales, ONG et entités publiques/privées travaillant sur les chaînes de valeur des commodités. Les formulaires financiers peuvent exiger l'anglais.",
    amount: "Financement selon type de projet et évaluation CFC",
    sourceName: "Common Fund for Commodities",
    sourceUrl: "https://www.common-fund.org/call-for-proposals",
    verificationNotes:
      "Source officielle CFC : 29th Call for Proposals, deadline du 1er octobre 2026, future au 22 août 2026.",
  },
  {
    id: "fid-call-for-proposals-2026",
    category: "entrepreneurs",
    status: "continuous",
    title: "Fund for Innovation in Development - appel à projets innovation",
    organization: "Fund for Innovation in Development (FID)",
    type: "Appel à projets / financement innovation",
    deadline: null,
    deadlineText: "Ouvert toute l'année, nouvelle plateforme annoncée à partir du 1er septembre 2026",
    countries: ["RDC", "Pays en développement"],
    sectors: ["Santé", "Education", "Climat", "Agriculture", "Emploi", "Innovation sociale"],
    summary:
      "Financement d'innovations capables de réduire la pauvreté et les inégalités, depuis la préparation jusqu'au passage à l'échelle.",
    eligibility:
      "Organisations, chercheurs, gouvernements, ONG, entreprises sociales et innovateurs privés. Vérifier le niveau de financement et les pièces requises sur le portail officiel.",
    amount: "Jusqu'à plusieurs millions d'euros selon stade du projet",
    sourceName: "FID",
    sourceUrl: "https://fundinnovation.dev/en/launch-project",
    verificationNotes:
      "Source officielle : appel indiqué comme ouvert toute l'année; la plateforme de dépôt est annoncée en mise à jour jusqu'au 1er septembre 2026.",
  },
  {
    id: "div-vc4a-2026",
    category: "entrepreneurs",
    status: "review",
    title: "Development Innovation Ventures (DIV)",
    organization: "USAID / DIV via VC4A",
    type: "Grant innovation / scale-up",
    deadline: null,
    deadlineText: "Statut et calendrier à vérifier sur la page source",
    countries: ["RDC", "International"],
    sectors: ["Innovation sociale", "Santé", "Education", "Agriculture", "Pauvreté", "Impact"],
    summary:
      "Programme de financement par étapes pour tester et passer à l'échelle des solutions efficaces contre la pauvreté et les problèmes de développement.",
    eligibility:
      "Innovateurs, organisations et entreprises à impact. L'utilisateur doit vérifier l'ouverture effective et les exigences actuelles avant de préparer le dossier.",
    amount: "Financement par étapes, montants à confirmer sur la page source",
    sourceName: "VC4A",
    sourceUrl: "https://vc4a.com/usaid/development-innovation-ventures-div/",
    verificationNotes:
      "Entrée conservée comme source à vérifier : la page VC4A est disponible, mais la deadline n'est pas explicitement affichée dans les résultats consultés.",
  },
  {
    id: "vc4a-programs-africa",
    category: "entrepreneurs",
    status: "continuous",
    title: "VC4A - programmes ouverts pour startups africaines",
    organization: "VC4A",
    type: "Annuaire programmes / accélérateurs",
    deadline: null,
    deadlineText: "Mise à jour continue selon chaque programme",
    countries: ["RDC", "Afrique"],
    sectors: ["Startups", "Financement", "Accélération", "Innovation"],
    summary:
      "Portail de programmes pour startups, entrepreneurs et investisseurs en Afrique. Utile pour repérer les appels sectoriels ouverts à la RDC.",
    eligibility:
      "Variable selon le programme. Filtrer par Afrique et vérifier si la RDC figure dans les pays éligibles avant candidature.",
    amount: "Variable selon programme",
    sourceName: "VC4A",
    sourceUrl: "https://vc4a.com/programs/?lang=en-US",
    verificationNotes:
      "Source portail fiable à surveillance continue, utile pour enrichir manuellement l'annuaire DroitGPT.",
  },
  {
    id: "f6s-africa-programs",
    category: "entrepreneurs",
    status: "continuous",
    title: "F6S - programmes startups Afrique",
    organization: "F6S",
    type: "Annuaire programmes / concours",
    deadline: null,
    deadlineText: "Mise à jour continue selon chaque programme",
    countries: ["RDC", "Afrique", "International"],
    sectors: ["Startups", "Tech", "Accélérateurs", "Concours"],
    summary:
      "Base internationale de programmes startup, compétitions et accélérateurs. À utiliser pour identifier des programmes ouverts aux fondateurs basés en RDC.",
    eligibility:
      "Variable selon programme. Toujours confirmer pays éligibles, date limite et lien officiel avant candidature.",
    amount: "Variable selon programme",
    sourceName: "F6S",
    sourceUrl: "https://www.f6s.com/programs",
    verificationNotes:
      "Portail général retenu comme source de veille manuelle; ne pas assimiler chaque programme à une opportunité RDC sans vérification.",
  },
  {
    id: "ungm-lab-equipment-rdc-2026",
    category: "tenders",
    status: "open",
    title: "RFQ - Supply of Laboratory Diagnostic Equipment in DRC and other countries",
    organization: "UNOPS",
    type: "Appel d'offres / fournitures médicales",
    deadline: "2026-08-31T21:59:59.000Z",
    deadlineText: "31 août 2026",
    countries: ["RDC", "Rwanda", "Tanzania", "Ghana", "Kenya", "Malawi", "Seychelles", "Zambia"],
    sectors: ["Santé", "Equipements", "Laboratoire", "Fournitures"],
    summary:
      "Demande de cotation pour la fourniture d'équipements diagnostiques de laboratoire, avec la RDC parmi les territoires bénéficiaires.",
    eligibility:
      "Fournisseurs inscrits ou capables de répondre via UNOPS eSourcing/UNGM. Vérifier les documents, lots et spécifications techniques sur UNGM.",
    amount: "Non précisé",
    sourceName: "UNGM / UNOPS",
    sourceUrl: "https://www.ungm.org/Public/Notice/310358",
    verificationNotes:
      "Source UNGM : avis publié le 10 août 2026, deadline étendue au 31 août 2026, RDC listée comme bénéficiaire.",
  },
  {
    id: "ungm-pev-printing-rdc-2026",
    category: "tenders",
    status: "open",
    title: "Impression des outils de routine au profit du PEV en RDC",
    organization: "UNOPS",
    type: "Appel d'offres / impression",
    deadline: "2026-09-03T15:00:00.000Z",
    deadlineText: "3 septembre 2026, 15:00",
    countries: ["RDC"],
    sectors: ["Impression", "Santé", "Logistique", "Services"],
    summary:
      "Invitation à soumissionner pour l'impression des outils de routine au profit du Programme Elargi de Vaccination en RDC, répartis en trois lots.",
    eligibility:
      "Fournisseurs enregistrés ou capables de s'enregistrer sur UNGM comme fournisseurs UNOPS; soumission via UNOPS eSourcing.",
    amount: "Non précisé",
    sourceName: "UNGM / UNOPS",
    sourceUrl: "https://www.ungm.org/Public/Notice/311232",
    verificationNotes:
      "Source UNGM : référence ITB/2026/64120, publié le 17 août 2026, deadline future au 22 août 2026.",
  },
  {
    id: "unido-bamboo-kongo-central-2026",
    category: "tenders",
    status: "open",
    title: "Construction du Pôle industriel de Carbonisation de Bambou à Ngimbi",
    organization: "UNIDO / ONUDI",
    type: "Appel d'offres / construction",
    deadline: "2026-09-07T15:00:00.000Z",
    deadlineText: "7 septembre 2026, 17:00 CET",
    countries: ["RDC"],
    sectors: ["Construction", "Industrie", "Bambou", "Energie", "Kongo Central"],
    summary:
      "Marché ONUDI pour la construction d'un pôle industriel de carbonisation de bambou à Ngimbi, province du Kongo Central, dans le cadre du Programme AVENIR.",
    eligibility:
      "Entreprises de construction et prestataires capables de répondre aux exigences ONUDI. Vérifier la référence 7000008751 et les documents sur le portail officiel.",
    amount: "Non précisé",
    sourceName: "UNIDO",
    sourceUrl: "https://www.unido.org/get-involved/procurement/procurement-opportunities",
    verificationNotes:
      "Source officielle UNIDO consultée : avis RDC référence 7000008751, deadline 07.09.2026.",
  },
  {
    id: "unido-solar-kits-rdc-2026",
    category: "tenders",
    status: "open",
    title: "Acquisition de kits à énergie solaire",
    organization: "UNIDO / ONUDI",
    type: "Appel d'offres / fourniture énergie",
    deadline: "2026-09-11T21:00:00.000Z",
    deadlineText: "11 septembre 2026, 23:00 CET",
    countries: ["RDC", "Congo"],
    sectors: ["Energie solaire", "Fournitures", "Equipements", "Développement"],
    summary:
      "Demande de cotation ONUDI pour l'acquisition de kits à énergie solaire, avec la RDC listée dans le pays bénéficiaire.",
    eligibility:
      "Fournisseurs capables de répondre aux exigences ONUDI et de déposer l'offre via le portail e-procurement. Vérifier la référence 7000008764.",
    amount: "Non précisé",
    sourceName: "UNIDO",
    sourceUrl: "https://www.unido.org/get-involved/procurement/procurement-opportunities",
    verificationNotes:
      "Source officielle UNIDO consultée : avis 'Aquisition de Kit à energie Solaire', Dem. Rep. Congo DR; Congo, deadline 11.09.2026.",
  },
  {
    id: "ungm-rdc-current-notices",
    category: "tenders",
    status: "continuous",
    title: "UNGM - marchés actifs des agences des Nations Unies en RDC",
    organization: "United Nations Global Marketplace",
    type: "Portail appels d'offres",
    deadline: null,
    deadlineText: "Mise à jour continue; activer le filtre 'Only currently active'",
    countries: ["RDC"],
    sectors: ["Achats publics", "ONG", "Nations Unies", "Services", "Fournitures"],
    summary:
      "Portail officiel de passation des marchés des agences UN. Il permet de filtrer par pays bénéficiaire, organisation, type d'avis et deadline.",
    eligibility:
      "Créer un compte fournisseur UNGM, filtrer 'Congo, The Democratic Republic of the' et vérifier chaque avis avant soumission.",
    amount: "Variable selon avis",
    sourceName: "UNGM",
    sourceUrl: "https://www.ungm.org/Public/Notice",
    verificationNotes:
      "Source officielle de marchés UN; utilisée comme base de veille continue pour les appels d'offres RDC.",
  },
  {
    id: "worldbank-rdc-procurement",
    category: "tenders",
    status: "continuous",
    title: "Banque mondiale - avis de passation des marchés pour la RDC",
    organization: "World Bank",
    type: "Portail appels d'offres",
    deadline: null,
    deadlineText: "Mise à jour continue selon chaque avis",
    countries: ["RDC"],
    sectors: ["Infrastructure", "Services", "Consultance", "Education", "Santé", "Energie"],
    summary:
      "Portail de la Banque mondiale pour consulter les avis de passation de marchés liés aux projets financés en RDC.",
    eligibility:
      "Variable selon l'avis. Vérifier le projet, la méthode de passation, la date limite et les documents officiels.",
    amount: "Variable selon avis",
    sourceName: "World Bank",
    sourceUrl: "https://projects.worldbank.org/en/projects-operations/procurement",
    verificationNotes:
      "Portail officiel Banque mondiale; l'utilisateur doit filtrer par pays/projet RDC pour voir les avis ouverts.",
  },
  {
    id: "linkedin-rdc-opportunities-watch",
    category: "entrepreneurs",
    status: "review",
    title: "LinkedIn - veille opportunités entrepreneurs RDC/Afrique",
    organization: "LinkedIn",
    type: "Source de veille",
    deadline: null,
    deadlineText: "A vérifier annonce par annonce",
    countries: ["RDC", "Afrique"],
    sectors: ["Entrepreneuriat", "Startups", "Appels à projets", "Incubateurs"],
    summary:
      "Source utile pour repérer rapidement des appels publiés par incubateurs, bailleurs, fondations et réseaux d'entrepreneurs, mais chaque annonce doit être confirmée sur le lien officiel.",
    eligibility:
      "Ne pas candidater seulement depuis un post LinkedIn : ouvrir le formulaire officiel, vérifier deadline, pays éligibles et organisation porteuse.",
    amount: "Variable",
    sourceName: "LinkedIn",
    sourceUrl:
      "https://www.linkedin.com/search/results/content/?keywords=RDC%20entrepreneurs%20appel%20%C3%A0%20projets%20Afrique%202026",
    verificationNotes:
      "Ajouté comme source de veille demandée, pas comme opportunité confirmée. Les cartes LinkedIn restent en statut à vérifier.",
  },
];
