import React from "react";
import { Link } from "react-router-dom";

const services = [
  {
    to: "/annuaire",
    eyebrow: "Nouveau",
    title: "Annuaire stratégique business",
    text: "Retrouvez les entreprises FEC, contacts miniers, investisseurs et partenaires utiles pour prospecter en RDC.",
    meta: "FEC, mines, fonds, investisseurs, contacts",
    tone: "border-amber-300 bg-amber-50",
  },
  {
    to: "/bp",
    eyebrow: "3 USD",
    title: "Business plan bancable",
    text: "Dossier structure pour banque, investisseur ou incubateur, avec hypotheses a valider et export PDF/DOCX selon le choix.",
    meta: "En moyenne 15 minutes pour un document professionnel",
    tone: "border-emerald-300 bg-emerald-50",
  },
  {
    to: "/ong",
    eyebrow: "3 USD",
    title: "Projet ONG / Fondation",
    text: "Narratif bailleur, logique d'intervention, resultats, budget, risques et suivi-evaluation.",
    meta: "Francais ou anglais",
    tone: "border-sky-300 bg-sky-50",
  },
  {
    to: "/memoire",
    eyebrow: "3 USD",
    title: "Memoire universitaire",
    text: "Plan, chapitres, methodologie et redaction academique avec controles de coherence du plan.",
    meta: "Licence, option droit congolais disponible",
    tone: "border-fuchsia-300 bg-fuchsia-50",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f1e6] text-slate-950">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_18%_12%,rgba(16,185,129,0.22),transparent_30%),linear-gradient(135deg,#061b18,#0f172a_58%,#431407)] p-6 text-white sm:p-9 lg:p-12">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">Plateforme IA professionnelle</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            Business plans, mémoires, projets ONG et annuaires stratégiques.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-200">
            DroitGPT structure vos dossiers, exploite vos brouillons, signale les informations manquantes et conserve les documents générés dans votre espace.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/bp" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-50">
              Générer un document
            </Link>
            <Link to="/annuaire" className="rounded-full border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              Explorer l'annuaire
            </Link>
            <Link to="/documents" className="rounded-full border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              Mes documents
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {services.map((service) => (
          <ServiceCard key={service.to} {...service} />
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Link to="/grants" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Annuaire</p>
          <h2 className="mt-2 text-2xl font-black">Opportunites en RDC</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Consultez les opportunites entrepreneuriales, appels d'offres, bourses, fonds d'investissement,
            incubateurs, accelerateurs et offres d'emploi valides pour la RDC.
          </p>
        </Link>

        <Link to="/annuaire" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">Annuaire stratégique</p>
          <h2 className="mt-2 text-2xl font-black">Contacts business RDC</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Recherchez des entreprises, investisseurs, opérateurs miniers, contacts FEC, ARSP et sources publiques utiles.
          </p>
        </Link>

        <Link to="/documents" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-700">Projet client</p>
          <h2 className="mt-2 text-2xl font-black">Mes documents</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Retrouvez les generations en cours ou terminees apres une coupure Internet, une reconnexion ou une relance.
          </p>
        </Link>
      </section>

      <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Assistant juridique</p>
            <h2 className="mt-2 text-2xl font-black">Chatbot juridique</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Posez des questions juridiques et obtenez une explication claire. Les dossiers confidentiels restent a traiter dans un compte utilisateur.
            </p>
          </div>
          <Link to="/chat" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
            Ouvrir le chatbot
          </Link>
        </div>
      </section>
    </div>
  );
}

function ServiceCard({ to, eyebrow, title, text, meta, tone }) {
  return (
    <Link to={to} className={`rounded-[2rem] border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-700">{text}</p>
      <p className="mt-5 rounded-full bg-white/80 px-4 py-2 text-xs font-black text-slate-700 ring-1 ring-black/5">{meta}</p>
    </Link>
  );
}
