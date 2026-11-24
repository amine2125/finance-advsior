# Validation UX (phase 9)

> Méthodes : évaluation heuristique (10 heuristiques de Nielsen) écran par écran ; parcours des 6 scénarios de démo pilotés dans Chromium (Playwright, skill `webapp-testing`) ; audit d'accessibilité automatisé axe-core 4.14 (WCAG 2.0/2.1/2.2 A et AA + bonnes pratiques) ; Lighthouse 12 (mobile simulé). Captures : `docs/captures/avant/`, `docs/captures/apres/`, `docs/captures/parcours/`.

## 1. Résultats mesurés

| Contrôle | Avant corrections | Après corrections |
|---|---|---|
| axe-core, 30 vues (14 écrans × ordinateur et mobile + pause + dossier) | 0 critique ; 2 règles graves : nom accessible ≠ texte visible (WCAG 2.5.3) sur les chiffres prouvés, attribut ARIA interdit sur les bandes du graphique ; puis 1 règle grave introduite par la correction (contrôle imbriqué dans un SVG « image ») | **0 violation** (`docs/ux/axe-apres.json`) |
| Lighthouse, accueil | Performance 82, Accessibilité 100, Bonnes pratiques 100 (LCP 3,8 s) | **98 / 100 / 100** (LCP 2,0 s) après découpage du code par écran et compression |
| Lighthouse, fiche titre | 82 / 100 / 100 (LCP 4,0 s) | **97 / 100 / 100** (LCP 2,3 s) |
| Lighthouse, portefeuille | — | **97 / 100 / 100** (LCP 2,2 s) |
| Erreurs de console (14 écrans, ordinateur et mobile, parcours complets) | 0 | 0 |
| Bouton « Continuer quand même » visible dans la pause de réflexion | **non** (hors écran) | oui |

## 2. Clics des parcours clés (mesurés par script)

| Parcours | Clics |
|---|---|
| Consulter un titre depuis l'accueil (via Tendances) | 2 |
| Lire un dossier depuis une fiche | 1 |
| Préparer un ordre : vérifier, appliquer l'alternative, revérifier, décider | 4 (la vérification en direct pendant la saisie ne demande aucun clic) |
| Créer un contrat (profil créé en direct avec les valeurs proposées) | 4 |

## 3. Évaluation heuristique

Heuristiques : H1 visibilité de l'état, H2 langage du monde réel, H3 contrôle et liberté, H4 cohérence, H5 prévention des erreurs, H6 reconnaître plutôt que se souvenir, H7 flexibilité, H8 design minimaliste, H9 récupération des erreurs, H10 aide.

| Écran | Ce qui respecte les heuristiques | Problèmes trouvés → correction |
|---|---|---|
| Coquille (tous écrans) | H1 bandeau permanent « Simulation » + date des données, bandeau ambre en machine à remonter le temps ; H3 « Revenir au présent » ; H4 même navigation partout ; H7 l'URL porte le profil et la date (lien partageable) | H8 grand cadre de focus autour de la zone principale à chaque navigation → retiré pour le focus programmatique ; H8 en-tête mobile sur 3 lignes → libellés masqués visuellement (toujours lus par les lecteurs d'écran) |
| Accueil | H1 une phrase + un chiffre, puis le statut des règles ; H2 « ta règle », pas de jargon | H4 icône ✅ pour une simple info de la Vigie → puce neutre « ℹ Info » ; H2 « plus inhabituelle que 100 % » → « que tous les jours passés de ce titre » ; H2 « vocabulaire detaille » → libellés français |
| Marché | H6 résultats annotés (déjà détenu, selon tes règles) ; H9 titre hors univers dit « non couvert » | — |
| Tendances | H2 « attention inhabituelle », jamais « opportunité » ; H10 définition au survol | — |
| Fiche titre | H1 vérification en direct annoncée (`aria-live`) ; H5 avant l'ordre, pas après ; H6 « Pour toi » résume ce qui compte | H2 secteur en anglais → traduit ; **H5/H2 « dont une partie via SPY » affiché pour Mateo, qui ne détient pas SPY** → seuls les FNB détenus sont listés ; texte d'une preuve centré → aligné à gauche |
| Ordre simulé et pause | H3 « Continuer quand même », « Modifier ma règle », « Revenir », de même poids ; H5 alternative chiffrée applicable en un clic | **H3 la pause dépassait l'écran : « Continuer quand même » était hors vue (piège involontaire)** → hauteur maximale, défilement interne, actions collantes ; H8 4 règles listées → les 3 plus graves, le reste replié |
| Portefeuille | H6 « tes N lignes = K paris réels » ; H8 barres avec vue tableau | — |
| Comparer | H2 « pour toi », jamais un classement universel | — |
| Surveillance | H9 état vide qui invite à agir | — |
| Mon contrat | H3 aperçu de l'effet avant de valider ; modification consignée avec son contexte ; H1 origine de chaque clause | — |
| Nouveau profil | H5 valeurs par défaut proposées et justifiées ; contradictions affichées tout de suite | — |
| Dossier | H1 étapes affichées pendant le calcul ; H10 les 4 questions ; chaque chiffre ouvre sa preuve | Lecteurs d'écran : les définitions du glossaire étaient lues **dans** les titres → infobulle réellement masquée tant qu'elle n'est pas affichée (elle reste la description du terme) |
| Journal, Fiabilité, Démo | H1 chaque intervention datée ; « Rejouer » ; métriques avec échantillon | — |

## 4. Parcours par persona (navigateur, 2026-11-14)

| Scénario | Résultat observé |
|---|---|
| 1. Robert | Tendances : NVDA en tête (attention réelle) → fiche « Pour toi » ⚠ → ordre de 170 000 $ → pause (4 règles) → alternative 18 300 $ appliquée → décision consignée (Journal : 6 entrées) |
| 2. Amira | Mêmes clics : à 2 000 $, ⚠ discret (sa limite par entreprise et sa techno) ; à 25 %, pause selon ses propres règles (banc d'essai) |
| 3. Mateo | XOM : clause « controverses » en « données insuffisantes » + exclusion sectorielle documentée ; ENB : « dépassée », dépêche AP citée |
| 4. Profil créé en direct | « Prudent, achat prochain » créé en 4 clics ; ordre de 7 000 $ sur NVDA → pause ; vocabulaire simple, liquidités en premier |
| 5. Machine à remonter le temps | Au 15 décembre 2021, bandeau ambre, données et compositions de l'époque seulement ; pause pour TSLA ; contre-exemple NVDA au 15 décembre 2022 |
| 6. Vérificateur | Essai 1 rejeté : « V3 CHIFFRE_SANS_PREUVE : « 46,0 »… valeurs les plus proches : 45,64 » ; essai 2 accepté |

## 5. Reste à faire

- Test avec de vrais utilisateurs (5 personnes par profil) : non réalisé.
- Lecteur d'écran réel (VoiceOver, NVDA) : non testé ; seulement l'audit automatisé.
- Mode sombre : non proposé (thème clair seulement).
