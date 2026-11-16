# Skills UX/UI

> Phase 5. Recherche, vérification et installation d'au moins 5 skills au format SKILL.md (standard Agent Skills), dans `.claude/skills/` (dossier de skills de l'environnement Claude Code).
> Règle appliquée avant toute installation : éditeur reconnu, dépôt actif, lecture complète du SKILL.md et de tous les scripts, aucun script exécuté sans lecture, rejet de tout accès réseau, secret ou action sans rapport avec la fonction.

## Installés (5)

| Skill | Source (URL + commit) | Licence | Pourquoi | Vérification |
|---|---|---|---|---|
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064/skills/frontend-design) @ `1780c5e5` | Apache-2.0 | Direction visuelle, plan de jetons, revue contre les défauts « générés » | SKILL.md lu en entier ; aucun script |
| `webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills/tree/1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064/skills/webapp-testing) @ `1780c5e5` | Apache-2.0 | Piloter l'app dans un navigateur (Playwright) : captures, console, parcours | SKILL.md, `scripts/with_server.py` et les 3 exemples lus en entier : lancement de serveurs locaux et attente de port, aucun accès externe ni secret |
| `web-design-reviewer` | [github/awesome-copilot](https://github.com/github/awesome-copilot/tree/8ecd5b17f02fe5fbebf35eccd1867265eded811f/skills/web-design-reviewer) @ `8ecd5b17` | MIT | Revue visuelle : mise en page, réactivité, contraste, focus, cibles tactiles | SKILL.md et `references/visual-checklist.md` lus en entier, `framework-fixes.md` parcouru (extraits CSS) ; aucun script. Le serveur MCP Playwright qu'il suggère n'est pas installé |
| `web-design-guidelines` | enveloppe ULYSSE + règles [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md) @ `434b7f91` (skill d'origine : [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines) @ `1a2c79d4`) | MIT (règles) | Règles d'interface : accessibilité, focus, formulaires, animation, typographie, i18n, anti-patterns | Le skill d'origine va chercher ses règles **à l'exécution** sur une URL non figée (`main`) : **rejeté tel quel**. Règles lues en entier, figées au commit et chargées en local ; enveloppe réécrite par nous (le dépôt d'origine n'a pas de licence détectée) |
| `writing-guidelines` | enveloppe ULYSSE + règles [vercel-labs/writing-guidelines](https://github.com/vercel-labs/writing-guidelines/blob/83e2316b034cf572400513538e4e4da01c4cc742/command.md) @ `83e2316b` (skill d'origine : vercel-labs/agent-skills @ `1a2c79d4`) | MIT (règles) | Rédaction neutre et concrète : voix active, mots de remplissage ou promotionnels bannis, chiffres précis | Même traitement que ci-dessus (récupération distante non figée rejetée) ; sections propres à Vercel ignorées (liens de tableau de bord, chaînes de modèle, revue de PR) |

Complément de l'environnement (non issu de la recherche) : le skill `dataviz` d'Anthropic, fourni avec Claude Code, utilisé pour les graphiques.

## Rejetés

| Skill | Raison |
|---|---|
| `anti-ui-slop` (publié dans github/awesome-copilot par la société UIZZE) | Renvoie vers un MCP payant et des ressources externes : accès réseau sans rapport avec la fonction |
| `discernment-nudge` (anthropics/skills) | Utile, mais porte sur les réponses de l'assistant, pas sur l'UX/UI de l'app |
| `web-design-guidelines` et `writing-guidelines` **tels quels** | Instructions distantes non figées, récupérées à chaque exécution (risque de chaîne d'approvisionnement) : remplacés par des copies figées et lues |
| `react-best-practices`, `composition-patterns` (Vercel) | Pertinents pour la performance React, mais 76 fichiers de règles : coût de lecture complète disproportionné pour ce prototype |

## Ce que chacun a changé concrètement dans l'app

| Skill | Changements constatés |
|---|---|
| `frontend-design` | Tableau de revue « défauts génériques → décision » dans `docs/design.md` ; refus du fond crème + terracotta, du kit de cartes identiques, des capitales en sur-titre et de la chasse fixe pour les petits chiffres ; **une seule audace** : le halo de signal façon phare ; police Atkinson Hyperlegible Next choisie pour ses chiffres non ambigus ; casse de phrase partout ; un seul mouvement (« allumage » du halo) ; autocritique par captures, qui a produit les corrections ci-dessous |
| `webapp-testing` | Script Playwright de captures avant/après (`docs/captures/avant`, `docs/captures/apres`, ordinateur 1280 px et mobile 390 px) ; contrôle des erreurs de console (0) ; vérification que « Continuer quand même » est visible dans la pause de réflexion (il était hors écran avant correction) |
| `web-design-reviewer` | Liste de contrôle appliquée : en-tête mobile compacté (libellés visuellement masqués, toujours lus par les lecteurs d'écran) ; cibles tactiles ≥ 44 px ; anneau de focus visible mais retiré du conteneur principal focalisé par programme ; alignement du texte des preuves corrigé |
| `web-design-guidelines` | `aria-live` sur la vérification d'ordre en direct ; `<button>` pour les actions et liens pour la navigation ; libellé sur chaque champ ; lien d'évitement ; `prefers-reduced-motion` ; aucune `transition: all` ; « … » pour les états de chargement ; `tabular-nums` en colonnes ; `Intl.NumberFormat` et `Intl.DateTimeFormat` en fr-CA ; l'URL porte l'état (profil, date simulée) ; adaptation : casse de phrase française au lieu du Title Case |
| `writing-guidelines` | Textes neutres et concrets : chaque chiffre avec son unité et sa période ; messages d'erreur qui disent ce qui s'est passé et quoi faire ; pas de « facile », « simple », « rapide » ; formulations « selon tes règles », « les données montrent », « ce qui changerait le constat » |
| `dataviz` (environnement) | Palette des séries validée par script (`validate_palette.js` : PASS) ; lignes 2 px, barres ≤ 24 px à bout arrondi ; survol par défaut ; vue tableau et source sous chaque graphique ; statuts toujours avec icône et mot |
