# 00 — Cadrage ULYSSE (Datathon AlphaForge AI 2026)

> Phase 0. Rédigé le 2026-11-14 après lecture complète des fichiers fournis.
> Document de référence n° 1 : `context/Datathon2026/Datathon - Case Officiel 2026 FR.pdf` (19 pages, version ENG identique sur le fond).
> Quand ce cadrage cite « p. N », il s'agit de la page du PDF FR. « Prés. N » = diapositive N de `Presentation_AlphaForge_AI_Participants.pptx` (FR et EN identiques). « Atelier N » = diapositive N de `Comprendre l'investisseur avant de bâtir la solution_V1.pptx`.

## 1. Fichiers lus

| Fichier | Lu | Ce qu'on en retient |
|---|---|---|
| Case officiel FR (19 p.) + ENG | en entier | Énoncé, personas, données, livrables, cadre responsable, grille (annexe 1) |
| Présentation participants FR + EN V2 (12 diapos + notes) | en entier | AWS = **condition d'admissibilité** (diapo 7) ; grille détaillée (diapo 10) ; « pourquoi cet agent existe ? » (diapo 5) |
| Atelier finance Banque Nationale (16 diapos + notes) | en entier | Cadre Données → Constats → Analyse → Proposition → Explication et 4 questions (diapo 12) ; horizon ≠ âge ≠ tolérance (diapo 7) ; tolérance ≠ capacité (diapo 8) ; diversification = expositions (diapo 9) |
| `de-la-consigne-au-pipeline-en.html` | en entier (texte + notes) | 10 niveaux : règle qui nomme son cas, agents spécialisés à outils limités, skills à la demande, le code compte, garde-fous qui bloquent, l'orchestrateur lit le disque, pipeline qui reprend, défaut nommé, tout se mesure |
| `alphaforge_starter/` (README, 5 CSV, métadonnées, script, avertissements) | en entier ; CSV inspectés | 31 actifs, 40 049 lignes de prix, 658 opérations sur titres, 1 245 jours FX, 8 281 lignes macro (9 séries) ; « No warnings » ; anomalie CNQ 2022-08-22 confirmée dans `corporate_actions.csv` |

## 2. Contraintes du PDF (une ligne par contrainte)

| # | Page | Contrainte |
|---|---|---|
| C01 | p. 1 | Solution **agentique auto-explicative**, fondée sur des **données financières publiques**, qui éclaire la décision d'investissement et rend ses résultats compréhensibles selon contextes et profils |
| C02 | p. 2 | Trois profils servent de situations de référence ; actifs, cas d'usage et architecture sont libres |
| C03 | p. 2 | Produire des résultats utiles **et** en expliquer sources, hypothèses et limites |
| C04 | p. 3 | Aider à sélectionner les données, les mettre en relation et en tirer des conclusions compréhensibles pour des contextes personnels différents |
| C05 | p. 3 | Reconnaître les incertitudes et les limites des résultats |
| C06 | p. 3 | Orientation agentique : agents qui mobilisent données et outils, coordonnent des tâches, adaptent l'analyse au contexte |
| C07 | p. 3 | Le but n'est **pas** de sélectionner le portefeuille au meilleur rendement ; démarche crédible, innovante, utile |
| C08 | p. 4 | Expliquer comment l'approche tient compte de chaque contexte de persona **et de ses limites** |
| C09 | p. 5 | Amira (26 ans, risque élevé, 15 ans+, expérience intermédiaire, croissance long terme, IA/techno, crypto, veut éviter de miser exclusivement sur la techno). Test : « risque élevé » ≠ « tout est acceptable » |
| C10 | p. 6 | Mateo (41 ans, modéré, 8–12 ans, intermédiaire, ESG important, éviter les controverses environnementales ou sociales importantes, équilibre croissance/stabilité, peu intéressé par le très spéculatif). Test : intégrer autre chose que rendement et risque |
| C11 | p. 7 | Robert (59 ans, faible à modéré, 3–5 ans, expérience avancée, retraite proche, préserver le capital, entreprises établies, peu intéressé par la crypto, tenté par un titre médiatisé). Test : remettre en question une demande incohérente, expliquer les risques, ne pas acquiescer automatiquement |
| C12 | p. 8 | Formuler une question utile (le besoin ou la décision éclairée) |
| C13 | p. 8 | Préciser rôle des agents, données et outils mobilisés, coordination et **points de contrôle** |
| C14 | p. 8 | Tenir compte du contexte : personas et autres objectifs, préférences ou contraintes explicites |
| C15 | p. 8 | Mettre les résultats à l'épreuve : sensibilité aux hypothèses, aux données, aux scénarios |
| C16 | p. 8 | Relier les résultats aux sources, hypothèses, **étapes observables** et limites ; l'utilisateur peut comprendre **et vérifier** |
| C17 | p. 8 | Approche simple, focalisée, vérifiable ; ni la sophistication ni le nombre d'agents ne sont des fins en soi |
| C18 | p. 8 | Une comparaison de deux situations d'investisseurs contrastées peut illustrer l'adaptabilité |
| C19 | p. 9 | Explicabilité : synthétiser ce qui soutient le résultat, citer les données, expliciter hypothèses et incertitudes |
| C20 | p. 9 | Gouvernance : vérifier le respect des contraintes de l'investisseur et des limites de la simulation, signaler conflits et informations manquantes, **rendre les contrôles visibles** |
| C21 | p. 10 | Le kit est facultatif ; on peut le compléter ou le remplacer par d'autres données publiques |
| C22 | p. 10 | Documenter sources, dates, traitements et conditions d'utilisation |
| C23 | p. 10 | Aucun actif obligatoire ; expliquer la pertinence et les sources des actifs retenus |
| C24 | p. 10 | Aucune transaction réelle ; dérivés et marge non exigés |
| C25 | p. 11 | Familles de données combinables (prix, opérations sur titres, sociétés, FNB, taux, macro, devises, nouvelles, ESG, crypto, profils) ; disponibilité et licences variables |
| C26 | p. 12 | Kit : 31 actifs, ~40 000 lignes de prix, opérations sur titres, FX Banque du Canada, 9 séries macro ; **aucune cote ESG, nouvelle ni donnée fondamentale** — à ajouter et documenter si besoin |
| C27 | p. 13 | Pour chaque source ajoutée : pertinence, origine, date, traitements, limites, conditions d'accès et de réutilisation |
| C28 | p. 14 | Période du kit 2021-11-12 → 2026-11-12 (inclut 2022) ; préciser dates et fréquences de toute donnée ajoutée |
| C29 | p. 14 | Traçabilité : source, date, devise, traitements |
| C30 | p. 14 | Cohérence temporelle : date d'observation ≠ date de publication ; aucune information non encore accessible dans une simulation |
| C31 | p. 14 | Comparabilité : dividendes, fractionnements, biais de sélection, données manquantes, conversions CAD/USD |
| C32 | p. 14 | Licences : conditions d'accès, de conservation et de redistribution |
| C33 | p. 14 | Aucune donnée client réelle ni renseignement bancaire confidentiel ; profils et portefeuilles fictifs |
| C34 | p. 14 | Mises en situation possibles : prudent préparant un achat prochain ; équilibré multi-objectifs ; audacieux long terme |
| C35 | p. 15 | Prototype démontrable : un cas d'utilisation complet + explication accessible (sources, hypothèses, principaux facteurs, limites) |
| C36 | p. 15 | Dépôt de code + README (dépendances, sources de données, configuration, démarrage ou reproduction) |
| C37 | p. 15 | Vidéo ~5 min : problème, rôle des agents, données et outils, résultat et explication de bout en bout |
| C38 | p. 15 | Documentation technique : méthodes et justification ; sources, actifs, traitements, hypothèses ; mécanisme d'explicabilité **avec un exemple reliant une conclusion aux données ou aux traces** ; validations ; limites ; améliorations |
| C39 | p. 15 | Outils, infrastructure, modèles au choix « sauf indication contraire dans les règles techniques officielles » (→ Prés. 7 : AWS obligatoire) |
| C40 | p. 16 | One-pager d'**une page maximum** : problématique, approche agentique, originalité, sources, explicabilité, bénéfices concrets |
| C41 | p. 16 | Dates limites, plateformes de dépôt, formats et exigences d'infrastructure : à confirmer dans les consignes logistiques (non fournies) |
| C42 | p. 17 | Évaluation de la valeur globale (pas les rendements simulés ni le nombre de modèles) : pertinence, solidité, créativité, qualité de réalisation, utilité |
| C43 | p. 17 | Une démonstration convaincante et des explications fidèles aux données et aux actions observables comptent plus que la complexité |
| C44 | p. 17 | Simulation uniquement : aucune transaction réelle ; ne pas se présenter comme un conseil financier personnalisé |
| C45 | p. 17 | Distinguer faits, hypothèses et scénarios fictifs ; présenter les incertitudes importantes de façon compréhensible |
| C46 | p. 17 | Explications synthétiques, vérifiables, fidèles aux sources et actions observables ; **aucune justification inventée** ; **ne pas exposer les raisonnements internes détaillés des modèles** |
| C47 | p. 18 | Données historiques pour décrire les actifs et éclairer l'adéquation (rendement, volatilité sur une période explicitée) ; la volatilité n'est qu'un indicateur (horizon, diversification, préférences comptent) |
| C48 | p. 18 | **Aucune prédiction de rendements futurs** ; expliquer indicateurs, limites, incertitudes ; ne pas assimiler automatiquement un profil à un actif |
| C49 | p. 19 | Grille : Solution 20 % · Agentique et explicabilité 20 % · Données 20 % · UX/UI 10 % · AWS 15 % · Présentation, business, marketing 15 % |

### Compléments officiels hors PDF

| # | Source | Contrainte |
|---|---|---|
| P1 | Prés. 7 | **AWS = condition d'admissibilité** : contribution réelle et démontrable ; sans intégration effective, projet non admissible. Justifier chaque service, ne pas en multiplier pour impressionner ; bonnes pratiques sécurité, accès, données, ressources |
| P2 | Prés. 5 | Chaque agent doit répondre à « Pourquoi cet agent existe-t-il et quelle valeur apporte-t-il ? » ; éviter la complexité décorative |
| P3 | Prés. 4 | Démontrer au moins deux situations contrastées |
| P4 | Prés. 6 | Pour chaque donnée : pourquoi, quelle source, quelle transformation, quelles limites |
| P5 | Prés. 8 | « Changez une hypothèse, un scénario, un profil : la solution reste-t-elle cohérente ? » |
| P6 | Prés. 10 | Sous-critères : Solution (pertinence, innovation, créativité, prototype) ; Agentique (architecture, explicabilité) ; Données (rigueur, validation, **visualisation**) ; UX/UI (intuition, ergonomie, clarté) ; AWS (qualité de l'intégration) ; Pitch (présentation, business, marketing) |
| P7 | Prés. 11 | Si une donnée ne permet pas de conclusion solide, la solution doit le dire |
| W1 | Atelier 12 | Données → Constats → Analyse → Proposition → Explication ; 4 questions : Quelles données ? Pourquoi ce choix ? Quelles limites ? Qu'est-ce qui changerait la réponse ? |
| W2 | Atelier 7–10 | Horizon ≠ âge ; un portefeuille peut porter plusieurs objectifs datés ; tolérance ≠ capacité ; diversifier = varier les expositions ; « les contraintes fixent les limites, les préférences orientent à l'intérieur » |

## 3. Écarts entre le prompt et les fichiers (le PDF gagne)

| # | Écart ou tension | Traitement |
|---|---|---|
| E1 | Démo 5 : « dossier de Robert daté de décembre 2021 ». Le kit commence le 2021-11-12 : à cette date il n'y a qu'environ 25 séances d'historique, insuffisant pour une volatilité, une pire baisse ou un modèle d'engouement crédibles | Prolonger l'historique vers l'arrière avec **les mêmes sources** (Yahoo via yfinance, Banque du Canada, FRED), autorisé par p. 10 et p. 14 à condition de documenter. Le kit reste la référence pour 2021-11-12 → 2026-11-12. Voir D-006 |
| E2 | Le prompt fixe 8 composants dont 5 rôles LLM ; le PDF (p. 8) et la Prés. 5 et 8 insistent sur « simple, focalisée, vérifiable » et « évitez la complexité décorative » | Pas une contradiction, mais un risque de notation. Chaque composant aura sa fiche « pourquoi il existe / ce qu'il n'a pas le droit de faire / ce qui se passe sans lui » (mesuré au banc d'essai). Le LLM n'est utilisé que là où il faut comprendre ou rédiger ; tout le reste est du code |
| E3 | Le prompt interdit toute recommandation ; le PDF (p. 3) cite « proposer une allocation fictive » comme piste possible | Compatible : le PDF laisse le choix. On garde l'interdiction (plus prudent vis-à-vis de C44). L'étape « Proposition » de l'atelier devient « Options » (alternatives factuelles, jamais « tu devrais ») |
| E4 | « AWS condition d'admissibilité » vient de la Prés. 7, pas du PDF (p. 15–16 renvoie aux consignes logistiques) | Cohérent : la présentation est une règle technique officielle (C39). Traité comme non négociable |
| E5 | Compositions de FNB « des sites des émetteurs, avec la date » : ce sont des compositions **actuelles** | Cohérence temporelle (C30) : en mode « machine à remonter le temps », la transparence des FNB est désactivée et l'app affiche « composition historique non disponible » plutôt que d'utiliser une donnée future. Voir D-014 |
| E6 | Chiffres du pitch (CVMO 2025, Indice ACVM 2024, ligne directrice OCRI du 12 mars 2026) absents des fichiers | À vérifier sur les sources primaires avant usage (phase 10). Non vérifié = non cité |
| E7 | Le prompt mentionne des « nouvelles » ; le kit n'en contient aucune (C26) | Phase 1 : l'écran « Tendances » repose d'abord sur des signaux mesurables (volume, rendement, audience Wikipedia). Des nouvelles datées ne seront ajoutées que si une source publique, datée et réutilisable est trouvée ; sinon c'est déclaré en limite |

## 4. La question utile (C12)

> « Cette intention d'investissement est-elle cohérente avec **les règles que j'ai moi-même fixées à froid** — et sur quels faits vérifiables repose la réponse ? »

ULYSSE ne dit jamais quoi acheter. Il compare une intention (ordre simulé, ajout à la liste de surveillance) au contrat de l'utilisateur, avec des preuves cliquables.

## 5. Plan par phases

Chaque phase se termine par : tests relancés, vérification par exécution réelle, bilan dans `docs/journal.md` et dans la conversation.

| Phase | Contenu | « Fait » veut dire |
|---|---|---|
| 0 Cadrage | Lecture, ce document, `decisions.md`, `journal.md` | Ce document existe et liste les écarts |
| 1 Données | Environnement Python ; chargement du kit ; conversion CAD ; calendrier maître ; contrôles (CNQ 2022-08-22, fractionnements, jours fériés) ; prolongation historique ; audience Wikipedia ; compositions de FNB ; preuves ESG ; délais de publication macro ; « datapack » reproductible ; catalogue `docs/donnees.md` | `make data` reconstruit tout ; tests de données verts ; chaque source au catalogue |
| 2 Moteur d'analyse | Objets de preuve ; volatilité, pire baisse, CVaR historique, EWMA, contribution au risque, transparence FNB, regroupement des corrélations et nombre effectif de paris, rejeu 2022, bootstrap par blocs, détecteur d'engouement, régimes ; tout avec date « as-of » | Tests unitaires verts ; valeurs vérifiées à la main sur des cas simples ; graines fixées |
| 3 Contrat et règles | Schéma de contrat versionné ; contradictions ; politique de signal ✅/⚠/⛔ ; gouvernance (clauses) | Cas Robert/Amira/Mateo du §11 du prompt passent en tests ; aucune référence à un nom de persona dans le moteur (test automatique) |
| 4 Agents | Interface LLM (simulée / Bedrock) ; Contrat, Planificateur, Gouvernance qualitative, Explication, Vérificateur, Vigie ; orchestrateur avec traces rejouables | Démo 6 (vérificateur) fonctionne en local avec LLM simulé ; traces complètes |
| 5 Design | ≥ 5 skills UX/UI vérifiés et installés ; système de design ; maquettes des écrans clés | `docs/skills.md` ; jetons de design ; maquettes |
| 6 Interface | Tous les points d'intervention ; adaptation au profil ; fr-CA (+ en) ; démo locale | Les 6 scénarios de démo jouables en local |
| 7 AWS | CDK ; Bedrock, Step Functions, Lambda, API Gateway, EventBridge Scheduler, DynamoDB, S3, CloudWatch ; budget et alarmes | Les scénarios tournent sur AWS sans intervention manuelle — **arrêt pour demander les accès** |
| 8 Banc d'essai | Scénarios × mesures ; page Fiabilité (intervalles de Wilson) | Chaque métrique affichée provient d'une exécution |
| 9 Validation UX | Heuristiques de Nielsen, parcours par persona, axe, Lighthouse, captures avant/après | Zéro erreur critique d'accessibilité |
| 10 Livrables | README, technique, one-pager, script vidéo, mode démo, pitch (chiffres vérifiés) | Livrables relus contre la grille |
| 11 Audit final | Tableau critère → où dans l'app → preuve | Aucun critère non couvert ou chaque trou déclaré |

Ordre de construction à l'intérieur des phases : d'abord une **tranche verticale** (Robert + TSLA, démo 1) traversant données → outils → règles → agents → écran, puis élargissement. Cela réduit le risque principal (volume de travail).

## 6. Risques principaux

| Risque | Effet | Parade |
|---|---|---|
| Volume (14 écrans, 8 composants, AWS) | Livrer large mais fragile | Tranche verticale d'abord ; chaque écran réutilise les mêmes composants « signal » et « preuve » |
| Modèles Claude non activés ou absents de `ca-central-1` | Bedrock indisponible | Vérification en phase 7 ; profil d'inférence inter-régions documenté si nécessaire |
| Taille des paquets Lambda (numpy, scipy, scikit-learn) sans Docker | Déploiement bloqué | Roues manylinux téléchargées par `pip --platform` ; calculs lourds isolés dans la Vigie |
| Sites d'émetteurs FNB ou sources ESG inaccessibles | Transparence ou ESG incomplets | Dire « inaccessible » et « données insuffisantes » ; ne rien inventer |
| Chiffres inventés par le LLM | Perte de confiance | Vérificateur en code, 2 essais, puis gabarit sans LLM |
| Fuite d'information future dans la machine à remonter le temps | Simulation biaisée | Toute donnée porte une date de publication ; filtre « as-of » unique et testé |

## 7. Questions

**Aucune question bloquante à ce stade.** Les décisions prises par défaut sont dans `docs/decisions.md`.

À préparer **avant la phase 7** (non bloquant maintenant) :

1. Accès AWS : compte, méthode de connexion (profil SSO ou clés temporaires, jamais écrites dans le code), accès aux modèles Anthropic activé dans Bedrock, plafond de budget, adresse pour les alertes de coût.
2. Date limite de remise du datathon (C41) : elle fixe la priorisation si le temps manque.
3. Git : souhaites-tu un commit à la fin de chaque phase ? (dépôt initialisé, aucun commit fait).
