// « Apprendre » : short lessons for people who have never invested. Plain words, no promise: every number is a definition,
// a documented hypothesis, or an illustration computed with a rate the reader chooses (never a forecast, PDF p. 18).

export interface Lecon { id: string; titre: string; court: string; minutes: number; paragraphes: string[]; retenir: string; calculateur?: boolean }

export const LECONS: Lecon[] = [
  {
    id: "investir", titre: "C'est quoi, investir ?", court: "Faire travailler l'argent dont tu n'as pas besoin tout de suite.", minutes: 2,
    paragraphes: [
      "Investir, c'est confier une partie de ton argent à des entreprises ou à des gouvernements pour qu'il puisse grandir. En échange, tu acceptes que sa valeur monte et descende en chemin.",
      "Épargner, c'est le garder de côté, au calme. C'est essentiel, mais un compte qui rapporte moins que la hausse des prix perd du pouvoir d'achat : c'est l'inflation.",
      "Avant d'investir, deux réflexes : garder un coussin de 3 à 6 mois de dépenses, et rembourser une carte de crédit (souvent autour de 20 % d'intérêt par an, plus que ce qu'un placement rapporte à coup sûr).",
    ],
    retenir: "On investit l'argent dont on n'aura pas besoin avant plusieurs années, après avoir mis son coussin de côté.",
  },
  {
    id: "briques", titre: "Actions, obligations, FNB", court: "Les briques avec lesquelles on construit un portefeuille.", minutes: 2,
    paragraphes: [
      "Une action, c'est une petite part d'une entreprise. Sa valeur suit les résultats de l'entreprise, et les humeurs du marché.",
      "Une obligation, c'est un prêt fait à un gouvernement ou à une entreprise, qui verse des intérêts. Elle bouge en général beaucoup moins qu'une action.",
      "Un FNB (fonds négocié en bourse) est un panier tout fait : en un seul achat, tu détiens des dizaines ou des centaines de titres. ULYSSE ouvre ces paniers pour te montrer ce qu'ils contiennent vraiment.",
      "Les cryptoactifs sont très spéculatifs : par le passé, ils ont déjà perdu plus de la moitié de leur valeur en quelques mois.",
    ],
    retenir: "Pour débuter, un ou deux FNB diversifiés sont plus simples à suivre qu'une liste d'actions choisies une à une.",
  },
  {
    id: "risque", titre: "Risque et rendement vont ensemble", court: "Plus on peut gagner, plus on peut perdre. Toujours.", minutes: 2,
    paragraphes: [
      "Un placement qui peut rapporter beaucoup peut aussi baisser beaucoup. Il n'existe pas de placement à la fois très rentable et sans risque : si on t'en promet un, méfie-toi.",
      "Ton profil dit combien de hauts et de bas tu peux vivre sans vendre au pire moment. Il dépend de ton horizon, de ta situation et de ce que tu supportes vraiment : c'est pour ça que le questionnaire retient la plus basse des trois mesures.",
      "ULYSSE parle de baisses concrètes (« la pire baisse passée », « si 2022 se répétait ») parce qu'un montant perdu est plus parlant qu'un pourcentage abstrait.",
    ],
    retenir: "Le bon placement est celui avec lequel tu dors bien, même pendant une mauvaise année.",
  },
  {
    id: "diversifier", titre: "Ne pas mettre tous ses œufs dans le même panier", court: "Répartir pour qu'une mauvaise nouvelle ne fasse pas tout tomber.", minutes: 2,
    paragraphes: [
      "Si tout ton argent est dans une seule entreprise, une seule mauvaise nouvelle peut te faire perdre beaucoup. Réparti sur des centaines d'entreprises, la même nouvelle pèse très peu.",
      "On diversifie entre entreprises, mais aussi entre secteurs, entre pays et entre types de placements : actions et obligations ne réagissent pas pareil.",
      "Attention aux faux amis : dix lignes qui montent et baissent ensemble ne font qu'un seul pari. La radiographie d'ULYSSE compte tes « paris réels ».",
    ],
    retenir: "Diversifier ne supprime pas le risque, mais évite qu'un seul accident te coûte très cher.",
  },
  {
    id: "temps", titre: "Le temps, ton meilleur allié", court: "Les gains produisent à leur tour des gains : les intérêts composés.", minutes: 3, calculateur: true,
    paragraphes: [
      "Quand un placement rapporte, ce gain s'ajoute à ton argent et rapporte à son tour. Sur des années, cet effet « boule de neige » peut devenir plus important que ce que tu as versé.",
      "Les marchés ont déjà connu de fortes baisses (2020, 2022). Par le passé, ils se sont repris avec le temps, mais personne ne peut garantir quand ni comment : c'est pour ça que l'horizon compte autant.",
      "Investir un petit montant chaque mois évite d'avoir à deviner « le bon moment » : tu achètes parfois cher, parfois moins cher, et tu gardes le rythme.",
    ],
    retenir: "Commencer tôt, même avec peu, compte plus que de viser le moment parfait.",
  },
  {
    id: "emotions", titre: "L'engouement, la panique et les frais", court: "Les trois pièges les plus coûteux, et comment les éviter.", minutes: 2,
    paragraphes: [
      "L'engouement : quand tout le monde parle d'un titre, on a peur de rater le train. ULYSSE signale l'attention inhabituelle (pages vues, volume échangé) pour que tu décides à froid.",
      "La panique : vendre pendant une chute transforme une baisse temporaire en perte réelle. Des règles écrites à l'avance, comme ton contrat, aident à tenir.",
      "Les frais : 1 ou 2 % par an semblent petits, mais ils se composent eux aussi, année après année.",
    ],
    retenir: "Décide avec un plan, pas sous le coup de l'émotion, et regarde toujours les frais.",
  },
  {
    id: "ulysse", titre: "Comment ULYSSE t'aide", court: "Tes règles à froid, une vérification à chaud, toi qui décides.", minutes: 2,
    paragraphes: [
      "Ulysse s'est fait attacher au mât pour résister au chant des sirènes. Ici, les sirènes sont l'engouement du marché ; le mât, ce sont tes règles, écrites à froid dans ton contrat.",
      "Quand tu prépares un ordre, le Mât le compare à tes règles en quelques millisecondes, en code. S'il s'en écarte nettement, une pause de réflexion s'affiche : tu gardes le dernier mot.",
      "Le dossier de décision réunit les données, tes règles, deux agents qui argumentent pour et contre, et une explication. Chaque chiffre vient d'un calcul prouvé : un vérificateur rejette toute phrase qu'il ne peut pas justifier.",
      "La Vigie surveille ton portefeuille en continu et ne parle que lorsqu'elle a quelque chose de pertinent. Tout est simulé : l'argent est fictif et aucune transaction réelle n'a lieu.",
    ],
    retenir: "ULYSSE ne décide pas à ta place : il te montre, preuves à l'appui, si une idée respecte les règles que tu t'es fixées.",
  },
];

export const leconParId = (id: string) => LECONS.find((l) => l.id === id);
