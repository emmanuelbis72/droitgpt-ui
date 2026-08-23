import React from "react";
import { Link } from "react-router-dom";

const sections = [
  {
    title: "Données collectées",
    items: [
      "Informations de compte, notamment l'adresse email.",
      "Données saisies pour générer un document : business plan, mémoire universitaire, projet ONG/fondation ou autre dossier.",
      "Informations de paiement Mobile Money nécessaires à la validation d'une transaction.",
      "Fichiers que l'utilisateur choisit volontairement d'envoyer.",
      "Documents générés, statut de génération et historique associé au compte utilisateur.",
    ],
  },
  {
    title: "Utilisation des données",
    items: [
      "Fournir les services demandés par l'utilisateur.",
      "Permettre la génération, le suivi et le téléchargement des documents.",
      "Vérifier les paiements avant de lancer une génération payante.",
      "Maintenir l'historique des documents dans l'espace utilisateur.",
      "Assurer la sécurité, le support et l'amélioration du service.",
    ],
  },
  {
    title: "Stockage et sécurité",
    items: [
      "L'application Android DOCGPT ne stocke pas localement les données sensibles de façon autonome.",
      "Les données sont gérées par la plateforme web et le backend de DOCGPT/DroitGPT.",
      "Les échanges avec la plateforme se font via HTTPS lorsque l'utilisateur accède à www.droitgpt.com.",
      "Les documents téléchargés peuvent être enregistrés sur l'appareil de l'utilisateur s'il lance volontairement un téléchargement.",
    ],
  },
  {
    title: "Partage des données",
    items: [
      "Les données des utilisateurs ne sont pas vendues.",
      "Certaines données peuvent être transmises à des prestataires techniques strictement nécessaires au fonctionnement du service : hébergement, paiement, envoi d'emails et maintenance.",
      "Les données peuvent être communiquées si la loi l'exige ou pour protéger la sécurité de la plateforme et de ses utilisateurs.",
    ],
  },
  {
    title: "Droits de l'utilisateur",
    items: [
      "L'utilisateur peut demander des informations sur les données associées à son compte.",
      "L'utilisateur peut demander la correction ou la suppression de certaines données, sous réserve des obligations techniques, légales ou comptables applicables.",
      "Pour toute demande, l'utilisateur peut contacter DOCGPT à l'adresse indiquée ci-dessous.",
    ],
  },
];

export default function Privacy() {
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="bg-slate-950 px-6 py-8 text-white md:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
          DOCGPT • DroitGPT
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
          Politique de confidentialité
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Dernière mise à jour : 23 août 2026.
        </p>
      </div>

      <div className="space-y-8 px-6 py-8 text-slate-800 md:px-10">
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
          <h2 className="text-lg font-extrabold text-slate-950">Présentation</h2>
          <p className="mt-3 text-sm leading-7">
            DOCGPT est une application mobile connectée à la plateforme{" "}
            <a
              className="font-semibold text-emerald-700 underline"
              href="https://www.droitgpt.com"
              target="_blank"
              rel="noreferrer"
            >
              www.droitgpt.com
            </a>
            . Elle permet d'accéder aux services de génération de documents
            professionnels, notamment business plans, mémoires universitaires et
            projets ONG/fondation.
          </p>
        </section>

        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-extrabold text-slate-950">
              {section.title}
            </h2>
            <ul className="mt-4 space-y-3">
              {section.items.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-xl font-extrabold text-slate-950">
            Contact
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            Pour toute question relative à cette politique de confidentialité,
            contactez-nous à l'adresse suivante :{" "}
            <a
              className="font-semibold text-emerald-700 underline"
              href="mailto:droitgptcongo@gmail.com"
            >
              droitgptcongo@gmail.com
            </a>
            .
          </p>
        </section>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Cette page s'applique à DOCGPT et aux services accessibles via DroitGPT.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
