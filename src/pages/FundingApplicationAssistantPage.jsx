import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { generationHeaders } from "../utils/generationClient.js";

const DEFAULT_API_BASE = "https://businessplan-v9yy.onrender.com";
const API_BASE = String(import.meta.env.VITE_BP_API_BASE || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");

const DEMO_QUESTIONS = [
  "Quel probleme votre projet resout-il ?",
  "Pourquoi votre organisation est-elle capable d'executer ce projet ?",
  "Quels resultats mesurables seront atteints en 12 mois ?",
];

const DEMO_ANSWERS = [
  {
    question: DEMO_QUESTIONS[0],
    answer:
      "Le projet vise a reduire l'ecart d'acces a une formation professionnelle utile pour les jeunes et les femmes en RDC. Il combine identification des besoins locaux, formation pratique, accompagnement post-formation et suivi des resultats afin que l'appui finance produise des effets observables.",
  },
  {
    question: DEMO_QUESTIONS[1],
    answer:
      "L'organisation dispose d'une equipe locale, d'une connaissance du terrain et d'une capacite de mobilisation communautaire. Les informations qui manquent, comme les references legales, les partenaires confirmes et les resultats historiques chiffres, doivent etre ajoutees avant soumission afin d'eviter toute affirmation non verifiee.",
  },
  {
    question: DEMO_QUESTIONS[2],
    answer:
      "Les resultats attendus doivent etre exprimes en indicateurs simples : nombre de beneficiaires formes, taux d'achevement, nombre de projets accompagnes, partenariats signes et mecanisme de suivi. Les cibles exactes restent a valider a partir du budget, de la duree et de la capacite operationnelle.",
  },
];

const INITIAL_FORM = {
  lang: "fr",
  companyProfile:
    "Nom de l'organisation :\nPays : RDC\nSecteur :\nExperience :\nEquipe :\nPartenaires confirmes :\nResultats deja obtenus :",
  opportunity:
    "Nom de l'appel ou du bailleur :\nObjectif de l'appel :\nMontant disponible :\nDeadline :\nLien source :",
  questions: DEMO_QUESTIONS.join("\n"),
};

export default function FundingApplicationAssistantPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const questions = useMemo(
    () => String(form.questions || "").split("\n").map((x) => x.trim()).filter(Boolean),
    [form.questions]
  );

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!questions.length) {
      setError("Ajoute au moins une question du formulaire du bailleur.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/generate-grants-management/application-assistant`, {
        method: "POST",
        headers: generationHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          lang: form.lang,
          companyProfile: textToObject(form.companyProfile),
          opportunity: textToObject(form.opportunity),
          questions,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.details || json?.error || "Impossible de generer le brouillon.");
      }
      setResult(json?.result || null);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const answers = Array.isArray(result?.answers) ? result.answers : [];
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const missing = Array.isArray(result?.missingProfileFields) ? result.missingProfileFields : [];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-slate-950">
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-900/10 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.22),transparent_28%),linear-gradient(135deg,#10251f,#0f172a_52%,#7c2d12)] px-5 py-8 text-white shadow-sm sm:px-8 lg:px-10">
        <div className="max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-200">Priorite 1</p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">Assistant de candidature aux financements</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-amber-50/90">
            Transformez un appel a projets, une opportunite de financement ou un formulaire bailleur en reponses claires,
            coherentes et pretes a retravailler. L'assistant ne doit pas inventer vos references : il signale les informations
            manquantes avant la soumission.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#assistant" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-50">
              Preparer une candidature
            </a>
            <a href="#exemple" className="rounded-full border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              Voir un exemple
            </a>
            <Link to="/grants" className="rounded-full border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              Trouver des opportunites
            </Link>
          </div>
        </div>
      </section>

      <section id="exemple" className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Ce que le client voit avant paiement</p>
          <h2 className="mt-2 text-2xl font-black">Exemple public, sans donnees confidentielles</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Avant de demander un engagement, DroitGPT montre le type de livrable : questions lues, brouillon de reponse,
            champs manquants et limites a verifier.
          </p>
          <div className="mt-5 space-y-3 text-sm">
            <Info label="Livrable" value="Brouillon de reponses + points a completer" />
            <Info label="Donnees requises" value="Profil, appel a projets, questions du formulaire" />
            <Info label="Formats" value="Texte editable aujourd'hui, export dossier ensuite" />
            <Info label="Limite" value="Aucune reference non fournie n'est inventee" />
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-800">Demo</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">A verifier avant depot</span>
          </div>
          <h3 className="mt-4 text-xl font-black">Programme entrepreneuriat jeunes et femmes</h3>
          <div className="mt-4 space-y-4">
            {DEMO_ANSWERS.map((item) => (
              <article key={item.question} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">{item.question}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="assistant" className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Assistant intelligent</p>
            <h2 className="mt-2 text-3xl font-black">Preparez les premieres reponses</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Collez le profil de l'organisation, le texte de l'opportunite et les questions du formulaire. Le resultat est un
              brouillon professionnel a relire, completer et adapter avant envoi officiel.
            </p>
            <div className="mt-5 rounded-3xl bg-slate-950 p-5 text-sm leading-6 text-slate-200">
              <p className="font-black text-white">Controle anti-invention</p>
              <p className="mt-2">Si une information manque, l'assistant doit l'indiquer au lieu de creer de faux partenaires, chiffres ou resultats.</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-black text-slate-700">Langue</span>
              <select
                value={form.lang}
                onChange={(event) => updateField("lang", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="fr">Francais</option>
                <option value="en">English</option>
              </select>
            </label>

            <Textarea label="Profil de l'organisation" value={form.companyProfile} onChange={(v) => updateField("companyProfile", v)} rows={7} />
            <Textarea label="Opportunite / appel a projets" value={form.opportunity} onChange={(v) => updateField("opportunity", v)} rows={6} />
            <Textarea label="Questions du formulaire bailleur" value={form.questions} onChange={(v) => updateField("questions", v)} rows={5} />

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Generation du brouillon..." : "Generer le brouillon de candidature"}
            </button>
          </form>
        </div>

        {answers.length || warnings.length || missing.length ? (
          <div className="mt-6 rounded-[2rem] border border-teal-100 bg-teal-50/60 p-5">
            <h3 className="text-xl font-black">Brouillon genere</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-3">
                {answers.map((item, index) => (
                  <article key={`${item.question || index}`} className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-black text-slate-900">{item.question || `Question ${index + 1}`}</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{item.answer || item.response || "A completer."}</p>
                  </article>
                ))}
              </div>
              <aside className="space-y-3">
                <ListBox title="Informations manquantes" items={missing} fallback="Aucune information manquante signalee." />
                <ListBox title="Alertes" items={warnings} fallback="Aucune alerte particuliere." />
              </aside>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Textarea({ label, value, onChange, rows = 5 }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-teal-500"
      />
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ListBox({ title, items, fallback }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-5 text-slate-600">
        {(items.length ? items : [fallback]).map((item) => (
          <li key={item} className="rounded-xl bg-slate-50 px-3 py-2">{item}</li>
        ))}
      </ul>
    </div>
  );
}

function textToObject(text) {
  const out = {};
  String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const parts = line.split(":");
      if (parts.length > 1) {
        const key = parts.shift().trim();
        out[key || `champ_${index + 1}`] = parts.join(":").trim();
      } else {
        out[`note_${index + 1}`] = line;
      }
    });
  return out;
}
