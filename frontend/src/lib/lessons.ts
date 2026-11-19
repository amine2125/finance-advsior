import { APP_NAME } from "./brand";

// « Apprendre » : short lessons for people who have never invested. Plain words, no jargon without an explanation,
// no promise: every number is either a definition, a computed illustration labelled as such, or a figure from the app.

export type Visual = "inflation" | "bricks" | "riskReturn" | "diversify" | "compound" | "fees" | "agents";
export type Lesson = { id: string; title: string; short: string; minutes: number; visual: Visual; paragraphs: string[]; takeaway: string };

export const LESSONS: Lesson[] = [
  {
    id: "investir", title: "C'est quoi, investir ?", short: "Faire travailler l'argent dont vous n'avez pas besoin tout de suite.", minutes: 2, visual: "inflation",
    paragraphs: [
      "Investir, c'est confier une partie de son argent à des entreprises ou à des gouvernements pour qu'il puisse grandir. En échange, on accepte que sa valeur monte et descende en chemin.",
      "Épargner, c'est le garder de côté, au calme. C'est essentiel, mais un compte qui rapporte 1 % par année perd du terrain quand les prix montent de 3 % : c'est l'inflation.",
      "Avant d'investir, deux réflexes : garder un coussin de 3 à 6 mois de dépenses, et rembourser une carte de crédit (environ 20 % d'intérêt par année, plus que ce qu'un placement rapporte de façon sûre).",
    ],
    takeaway: "On investit l'argent dont on n'aura pas besoin avant plusieurs années, après avoir mis son coussin de côté.",
  },
  {
    id: "briques", title: "Actions, obligations, FNB", short: "Les briques avec lesquelles on construit un portefeuille.", minutes: 2, visual: "bricks",
    paragraphs: [
      "Une action, c'est une petite part d'une entreprise, par exemple la Banque Royale ou Apple. Sa valeur suit les résultats de l'entreprise, et les humeurs du marché.",
      "Une obligation, c'est un prêt fait à un gouvernement ou à une entreprise, qui vous verse des intérêts. Elle bouge beaucoup moins qu'une action.",
      "Un FNB (fonds négocié en bourse) est un panier tout fait : en un seul achat, vous détenez des dizaines ou des centaines de titres. Par exemple, XIU regroupe les 60 plus grandes entreprises canadiennes.",
      "Les cryptoactifs (Bitcoin, Ether) sont très spéculatifs : ils peuvent perdre plus de la moitié de leur valeur en quelques mois.",
    ],
    takeaway: "Pour débuter, un ou deux FNB diversifiés valent souvent mieux qu'une liste d'actions choisies une à une.",
  },
  {
    id: "risque", title: "Risque et rendement vont ensemble", short: "Plus on peut gagner, plus on peut perdre. Toujours.", minutes: 2, visual: "riskReturn",
    paragraphs: [
      "Un placement qui peut rapporter beaucoup peut aussi baisser beaucoup. Il n'existe pas de placement à la fois très rentable et sans risque : si on vous en promet un, méfiez-vous.",
      "Votre profil (prudent, modéré, élevé…) dit combien de hauts et de bas vous pouvez vivre sans vendre au pire moment. Il dépend de votre horizon, de votre situation et de ce que vous supportez vraiment.",
      `C'est pour ça que ${APP_NAME} vous a posé des questions sur des baisses concrètes : « il resterait 7 000 $ sur 10 000 $ », c'est plus parlant qu'un pourcentage.`,
    ],
    takeaway: "Le bon placement est celui avec lequel vous dormez bien, même pendant une mauvaise année.",
  },
  {
    id: "diversifier", title: "Ne pas mettre tous ses œufs dans le même panier", short: "Répartir pour qu'une mauvaise nouvelle ne fasse pas tout tomber.", minutes: 2, visual: "diversify",
    paragraphs: [
      "Si tout votre argent est dans une seule entreprise, une seule mauvaise nouvelle peut vous faire perdre beaucoup. Réparti sur 500 entreprises, la même nouvelle pèse très peu.",
      "On diversifie entre entreprises, mais aussi entre secteurs (banques, technologie, énergie…), entre pays, et entre types de placements (actions et obligations ne réagissent pas pareil).",
      `${APP_NAME} vérifie ces limites pour vous : le poids maximum d'une seule entreprise (FNB compris), la part en actions, en cryptoactifs ou en technologies permise par votre profil, et ce que votre portefeuille aurait perdu dans les crises passées.`,
    ],
    takeaway: "Diversifier ne supprime pas le risque, mais évite qu'un seul accident vous coûte très cher.",
  },
  {
    id: "temps", title: "Le temps est votre meilleur allié", short: "Les gains produisent à leur tour des gains : les intérêts composés.", minutes: 3, visual: "compound",
    paragraphs: [
      "Quand votre placement rapporte, ce gain s'ajoute à votre argent et rapporte à son tour. Sur des années, cet effet « boule de neige », qu'on appelle les intérêts composés, devient plus important que ce que vous avez versé.",
      "Les marchés ont déjà connu de fortes baisses (mars 2020, 2022). Par le passé, ils se sont repris avec le temps, mais personne ne peut garantir quand ni comment. D'où l'importance de l'horizon.",
      "Investir un petit montant chaque mois évite d'avoir à deviner « le bon moment » : on achète parfois cher, parfois moins cher, et on garde le rythme.",
    ],
    takeaway: "Commencer tôt, même avec peu, compte plus que de viser le moment parfait.",
  },
  {
    id: "emotions", title: "Les émotions, l'engouement et les frais", short: "Les trois pièges les plus coûteux, et comment les éviter.", minutes: 2, visual: "fees",
    paragraphs: [
      `L'engouement : quand tout le monde parle d'un titre, on a peur de manquer le train. ${APP_NAME} signale ces attentions inhabituelles (pages vues, volume échangé) pour que vous décidiez à froid.`,
      "La panique : vendre pendant une chute transforme une baisse temporaire en perte réelle. Un plan décidé à l'avance aide à tenir.",
      "Les frais : 1 ou 2 % par année semblent petits, mais ils se composent eux aussi, année après année.",
    ],
    takeaway: "Décidez avec un plan, pas sous le coup de l'émotion, et regardez toujours les frais.",
  },
  {
    id: "ulysse", title: `Comment ${APP_NAME} vous aide`, short: "Vos règles fixées à froid, une vérification à chaud, vous qui décidez.", minutes: 2, visual: "agents",
    paragraphs: [
      "Votre profil vient de vos réponses au questionnaire : il fixe vos règles (perte acceptée en cas de crise, part en actions, poids d'une seule entreprise, cryptoactifs). Vous pouvez changer une règle à tout moment : le changement est daté et gardé.",
      "Vous écrivez ce que vous voulez faire, en français. Des agents se relaient : lire votre profil, choisir les analyses utiles, calculer, vérifier chacune de vos règles, décider du niveau du signal, peser le pour et le contre, l'expliquer.",
      "Chaque chiffre vient d'un calcul vérifié ; l'IA peut rédiger, mais un vérificateur rejette toute phrase dont un chiffre n'est pas prouvé. Le niveau (compatible, à regarder, pause de réflexion) est décidé par des règles écrites, jamais par l'IA.",
      "Tout est simulé : l'argent est fictif et aucune transaction réelle n'a lieu. Et rien n'est fait sans votre accord : vous gardez toujours le dernier mot.",
    ],
    takeaway: `${APP_NAME} ne décide pas à votre place : il vous montre, chiffres prouvés à l'appui, si une idée respecte les règles que vous avez fixées.`,
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
export const ESSENTIALS = ["investir", "risque", "diversifier"];
