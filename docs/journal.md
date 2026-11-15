# Journal de construction

Un bilan court par phase : ce qui est fait, vérifié comment, ce qui reste ouvert.

## Phase 0 — Cadrage (2026-11-14)

**Fait**
- Lu en entier : case officiel FR (19 p.) et ENG, présentation participants FR et EN (12 diapos + notes), atelier finance Banque Nationale (16 diapos + notes), méthode HTML en 10 niveaux, kit `alphaforge_starter` (README, script, métadonnées, avertissements, inspection des 5 CSV).
- `docs/00-cadrage.md` : 49 contraintes du PDF avec leur page, 9 compléments officiels (présentation, atelier), 7 écarts prompt ↔ fichiers, plan en 12 phases, risques.
- `docs/decisions.md` : 23 décisions (stack, adaptateurs local/AWS, LLM, région, données, méthodes, marque).
- Dépôt git initialisé (aucun commit), `.gitignore`.

**Vérifié**
- Comptes du kit relevés sur les fichiers : 40 049 lignes de prix, 658 opérations sur titres, 1 245 jours FX, 8 281 lignes macro, 9 séries macro ; `data_quality_warnings.txt` = « No warnings ».
- Anomalie CNQ présente : `2022-08-22, split 1.021` le même jour qu'un dividende de 0,75 $ ; vrai fractionnement 2:1 le 2024-06-11.
- Réseau : Wikimedia, GitHub, Yahoo, PyPI et npm répondent (HTTP 200). Pas d'identifiants AWS, pas de CLI AWS, pas de Docker sur la machine.

**Écart majeur relevé** : la démo « Robert en décembre 2021 » demande un historique antérieur au kit (E1 → D-006).

**Ouvert** : accès AWS (phase 7), date limite du datathon, commits git.

## Phase 1 — Données (2026-11-14)

**Fait**
- Environnement Python 3.12 (`backend/.venv`), paquet `ulysse` installable, `Makefile` (`make data`, `make test`).
- Pipeline reproductible `python -m ulysse.data.build` → `data/build/datapack/` (6,2 Mo, numpy + JSON) : calendrier maître de 2 783 jours (2016-01-04 → 2026-11-12), prix en devise locale et en CAD, masque des séances réelles, volumes, USD/CAD, 9 séries macro avec date de disponibilité, pages vues quotidiennes, compositions de FNB datées, opérations sur titres.
- Ajouts documentés : prolongation 2016 → 2021 (Yahoo, Banque du Canada dont le taux de midi 2016, FRED) ; pages vues Wikipedia de 22 articles (anciens titres inclus) ; SPY et carte sectorielle (SSGA) ; XIU (125 instantanés mensuels) et XBB (iShares Canada).
- Correction CNQ.TO prouvée par le communiqué de CNQ (SEC EDGAR).
- Chargeur `Datapack` + vue `AsOf` : seul accès aux données pour le moteur.
- Catalogue `docs/donnees.md` (9 sources, délais de publication, licences vérifiées, données non disponibles).

**Vérifié (exécution)**
- 15 tests verts (`make test`) : invariants du kit ; correction CNQ (rendement du 2022-08-22 ramené de +2,78 % à +0,62 %, faux fractionnement retiré, vrai 2:1 de 2024 conservé) ; jonction (écart ≤ 1 × 10⁻⁵ sur le chevauchement) ; calendrier ; report des prix et du change les jours fériés ; conversion CAD ; « as-of » sur 5 dates (aucune date future, IPC de novembre 2021 invisible le 2021-12-15, pas de composition SPY en 2021) ; aucun nom de persona dans le moteur.
- Le test CNQ a d'abord échoué : il a révélé que la convention d'`adj_close` de Yahoo est P/(P₋₁ − D) − 1 et non (P + D)/P₋₁ − 1 ; la correction suit la convention de Yahoo (D-028).

**Incidents**
- Wikimedia a limité nos appels (HTTP 429) : client HTTP corrigé (respect de `Retry-After`, 1 requête/s, pas de nouvel essai sur 404).
- Tentative refusée par le classificateur de sécurité : interroger des points d'accès non documentés d'Invesco et Vanguard avec un en-tête de navigateur imité. Abandonnée ; seuls les liens publics de téléchargement sont utilisés (D-025).

**Ouvert**
- Compositions de QQQ et d'ESGV : la voie propre est la SEC (N-PORT, historique trimestriel daté), qui exige un agent avec adresse de contact. Question posée.
- Preuves ESG (phase 3).

## Phase 2 — Moteur d'analyse (2026-11-14)

**Fait**
- Objet de preuve (`ulysse/evidence.py`) : clés du prompt (`id, mesure, valeur, unite, devise, periode, date_de_calcul, donnees_source, methode, parametres, version_du_code`) + `statut` (ok / données insuffisantes / non applicable), `note`, `reference`. Identifiant déterministe, valeurs arrondies de façon stable.
- Outils (code seulement, sur la vue « as-of ») : volatilité annualisée, pire baisse avec dates et récupération, CVaR historique, volatilité EWMA (λ = 0,94) et ratio au risque de l'année, rendement passé (descriptif), cours, dividendes 12 mois ; portefeuille : valeur, **transparence des FNB** (secteurs, pays, devises, titres, part couverte, fonds opaques déclarés), contributions au risque (Euler), nombre effectif de paris, **paris réels** (regroupement hiérarchique des corrélations hebdomadaires), rejeu d'épisodes (2022, COVID 2020, fin 2018 ; refusé si postérieur à la date simulée), scénarios rééchantillonnés (bootstrap stationnaire, graine fixe, « pas une prévision ») ; **engouement** (Isolation Forest par titre, réentraîné chaque mois sur son seul passé, + règle d'attention écrite) ; **climat de marché** (mélange gaussien à 3 composantes, profils des régimes publiés).
- Registre d'outils (`ulysse/analytics/tools.py`) : 15 outils, 9 modules ; paramètres validés (liste fermée de valeurs), aucun outil de prédiction.

**Vérifié (exécution)**
- 29 tests verts : cas synthétiques calculés à la main (volatilité ±1 % → 15,9 % ; pire baisse construite −40 % avec ses dates ; CVaR selon sa définition ; transparence d'un FNB 60/40 ; contributions qui somment à 100 % ; deux titres identiques = un seul pari ; rejeu refusé dans le futur ; bootstrap reproductible) ; garde-fous sur données réelles (pire baisse TSLA −71 % depuis le 2021-11-04 ; aucune preuve postérieure au 2021-12-15 en machine à remonter le temps ; engouement NVDA 2024-06-20 oui, PG 2023-06-15 non ; régime « tendu » au 2020-03-20).
- Deux tests échoués puis corrigés : tolérance (arrondi volontaire à 6 décimales) ; vrai défaut du registre (valeurs par défaut non appliquées).

**Constat utile pour la démo** : au 2026-11-12, le détecteur signale **NVDA** (pages vues ×10,8, volume ×4,2), pas TSLA (dernier épisode : avril 2025). La démo 1 suivra la donnée (D-034).

**Changement de cap demandé par l'équipe** : infrastructure simplifiée (SAM, une Lambda avec URL de fonction, pas d'API Gateway ni de Step Functions) ; `docs/aws.md` et décisions D-030 à D-035. Aucune ressource AWS n'avait été créée.

## Phase 3 — Contrat et règles (2026-11-14)

**Fait**
- Schéma du contrat (`ulysse/contract/schema.py`) : 12 types de clauses, origine « dit » / « défaut » (une valeur par défaut doit porter sa justification), clauses importantes, versions et historique des modifications avec leur contexte.
- Assistant de contrat générique (`defaults.py`) : réponses → profil + contrat ; valeurs par défaut documentées (`docs/hypotheses.md`) ; les trois personas sont de simples réponses pré-remplies (`ulysse/personas`).
- Évaluation de chaque clause avant/après une intention (`evaluate.py`) : exposition par entreprise via FNB, techno, crypto, actions, devises, très volatil, liquidités, perte en crise (épisodes passés disponibles à la date), horizon (pire résultat sur les périodes passées de même durée), ESG.
- ESG en code sur preuves citées (`esg.py`, `data/manual/esg_evidence.json`) : 4 sources vérifiées (fiche Vanguard ESGV, règles FTSE v5.0, 10-K de XOM, dépêche AP sur Line 5) ; dates de publication respectées.
- Contradictions K1–K7 ; politique de signal (`policy.py`) par **score de gravité** et règles nommées P1, P2, A1–A3, O1, N1, D1 ; modes discret / encadré / interruption ; alternatives (taille maximale par bissection, même exposition via un FNB) ; gouvernance de dossier (`governance.py`) avec contrôles visibles et informations manquantes.

**Vérifié (exécution)** : 53 tests verts, dont les 3 cas de référence du prompt (Robert + 20 % TSLA → ⛔ avec concentration et horizon dépassés ; Amira + 5 % BTC → pas de ⛔ ; Mateo + XOM → clause ESG évaluée, « données insuffisantes » avec preuve de contexte), ENB → controverse citée, source de 2026 invisible en 2021, proportionnalité (Amira NVDA 2 % → 5 % → 20 % : discret → encadré → ⛔), stabilité (5 exécutions identiques), latence < 300 ms, profil créé en direct, contradiction K1, gouvernance.

**Défauts trouvés et corrigés pendant la phase**
- Composition SPY invisible à la date des dernières données (publiée le lendemain) → « aujourd'hui » de l'app = 2026-11-14.
- Limite par entreprise évaluée sur un autre titre lors d'un ordre en crypto → « non applicable ».
- Politique trop sévère quand le portefeuille dérivait déjà (un ordre de 3 % déclenchait ⛔) → score de gravité et dépassements préexistants traités comme contexte.
- Clause d'horizon fondée sur la durée sous l'eau (un fonds obligataire déclenchait ⛔) → reformulée sur la pire perte par période d'horizon. Constat conservé : XBB a perdu 16,2 % sur sa pire période de 3 ans (2020-10 → 2023-10).
- Horizons plus longs que l'historique → fenêtre réduite et signalée « incertain ».

## Phase 4 — Agents (2026-11-14)

**Fait**
- Couche LLM (`ulysse/llm.py`) limitée à deux rôles (D-031) : **planifier** (choix des modules d'un dossier, sortie structurée validée) et **rédiger** (dossier à partir des seules preuves). `MockLLM` déterministe pour les tests ; `BedrockLLM` via le client Bedrock du SDK Anthropic officiel (`AnthropicBedrockMantle`, `messages.parse` avec schéma Pydantic, refus et sorties incomplètes gérés). Pas d'appel réel (aucun accès AWS avant la phase 7).
- Faits du dossier (`ulysse/dossier.py`) : statuts de clause, décision de la politique, alternatives et hypothèses du profil deviennent eux aussi des **objets de preuve** ; chaque preuve porte ses valeurs affichables en fr-CA, à copier telles quelles.
- **Vérificateur** (`ulysse/verifier.py`) : V1 étiquette, V2 preuves citées et existantes, V3 chaque chiffre et chaque année retrouvés dans les preuves citées (tolérance d'arrondi selon l'écriture), V4 formulations interdites (recommandation, promotion, prédiction, promesse), V5 cinq étapes. Défaut **nommé** précisément.
- **Orchestrateur** (`ulysse/orchestrator.py`) : contexte → planification → outils → gouvernance → signal → rédaction → vérification (2 essais, défaut renvoyé) → gabarit sans LLM si besoin → publication ; état écrit après chaque étape (affichage progressif, reprise, rejeu) ; un outil sans preuve est consigné en échec ; outils inventés par le planificateur rejetés et journalisés.
- **Vigie** (`ulysse/vigie.py`) : dérive, attention inhabituelle sur titres détenus ou surveillés, changement de climat, paquets de signaux « Pour toi » pré-calculés (31 titres par profil), notifications selon la préférence et sans répétition sur 7 jours ; à la demande et **rejouable à une date passée** (`python -m ulysse.vigie --as-of …`).
- API unique (`ulysse/api/routes.py`, 25 routes) servie par le serveur local FastAPI et par le point d'entrée Lambda (URL de fonction, événement planifié, invocation asynchrone des dossiers) ; adaptation au profil par caractéristiques ; glossaire à deux niveaux ; mode démo (`/api/demo/reinitialiser`).

**Vérifié (exécution)**
- 71 tests verts. Balayage de 38 dossiers réels (19 situations × rédaction normale et défaut injecté) : 38/38 publiés avec un texte accepté par le vérificateur ; chaque défaut injecté est rejeté, nommé (« V3 CHIFFRE_SANS_PREUVE : « 46,0 » … ») puis corrigé au second essai (démo 6).
- Latences locales : vérification d'ordre 12–15 ms ; dossier complet ~0,3–0,7 s avec le LLM simulé ; Vigie 1,7 s pour 3 profils une fois les modèles entraînés (6 s au premier passage).

**Défauts trouvés par le vérificateur (et corrigés)**
- Deux preuves différentes (portefeuille avant/après l'ordre) partageaient le même identifiant : le texte pouvait citer le mauvais chiffre. Identifiant désormais calculé sur le contenu.
- Le gabarit écrivait des chiffres non portés par une preuve (exposition via FNB, décompte de règles, paramètres de clause) : ajoutés aux preuves.
- Le test « aucun nom de persona dans le moteur » a attrapé deux fuites (listes de surveillance du mode démo, exemple de commande) : déplacées dans les fixtures.

## Phase 5 — Design (2026-11-14)

**Fait**
- Recherche de skills SKILL.md chez des éditeurs reconnus (Anthropic, Vercel, GitHub) ; 5 installés dans `.claude/skills/` après lecture complète, commits figés et licences vérifiées ; 4 rejetés ou écartés avec leur raison (`docs/skills.md`).
- Plan de design selon `frontend-design` : revue explicite contre les défauts « générés », jetons (couleurs, typographie, espacements, rayons, mouvement), composants, maquettes ASCII des écrans clés (`docs/design.md`).
- Palette des graphiques validée par le script du skill `dataviz` (PASS) ; contraste de tous les jetons de texte calculé (≥ 4,8:1 sur le fond papier).

## Phase 6 — Interface complète (2026-11-14)

**Fait**
- Application React 19 + TypeScript (Vite) : 13 écrans (Accueil, Marché/recherche, Tendances, Fiche titre avec ordre simulé, Portefeuille, Comparer, Surveillance, Mon contrat, Nouveau profil, Journal, Dossier, Fiabilité, Démo), coquille avec profil, date simulée (machine à remonter le temps), langue (fr-CA par défaut, en pour l'interface), cloche de la Vigie et bandeau « Simulation, pas un conseil financier » toujours visible.
- Le **geste du signal** partout : halo + pastille (icône + mot), panneau de 2–3 faits avec preuves et options ; **pause de réflexion** en boîte de dialogue native (focus piégé, Échap) ; **chiffres prouvés** cliquables ouvrant le tiroir de preuve (source, date, période, devise, méthode, paramètres, version du code) ; dossier avec étapes affichées pendant le calcul, phrases étiquetées, curseurs de sensibilité (taille de position, horizon) ; graphique de cours avec bandes d'épisodes : leur survol calcule l'impact pour le profil, en $ et par rapport à l'objectif.
- Adaptation par caractéristiques du profil : métriques détaillées pour un profil avancé, lentille ESG si l'ESG compte, ordre des modules selon l'horizon.

**Vérifié (exécution)**
- `tsc` sans erreur ; build de production 392 Ko (123 Ko compressés).
- Parcours piloté dans Chromium (skill `webapp-testing`), 9 écrans × ordinateur et mobile + parcours ordre → pause → dossier : **0 erreur de console**. Captures dans `docs/captures/avant` et `docs/captures/apres`.
- 7 défauts trouvés à la revue visuelle et corrigés : cadre de focus sur la zone principale ; pause de réflexion plus haute que l'écran (le bouton « Continuer quand même » était hors vue, donc un piège) ; en-tête mobile sur 3 lignes ; icône ✅ utilisée pour une simple info ; « plus inhabituelle que 100 % » ; secteurs en anglais ; FNB non détenus présentés comme une exposition (« dont une partie via SPY » pour Mateo, qui ne détient pas SPY).

**Ordre des phases suivantes** : la phase 7 exige des accès AWS, donc une réponse de l'équipe. Pour ne pas rester bloqué, je prépare d'abord tout ce qui ne demande pas AWS (infrastructure SAM écrite et paquet Lambda construit, banc d'essai local, validation UX, livrables), puis je demande les accès, je déploie et je relance le banc d'essai sur AWS.

## Phase 7 (préparation, sans déploiement) — 2026-11-14

- `infra/template.yaml` (SAM) : une Lambda Python arm64 avec URL de fonction (authentification IAM), DynamoDB à la demande, deux buckets privés chiffrés, CloudFront avec OAC vers le bucket de l'interface et vers l'URL de fonction (`/api/*`), EventBridge Scheduler horaire vers la Vigie, budget AWS avec alertes par courriel, journaux Lambda conservés 14 jours. **Validé localement par `cfn-lint` : 0 erreur, 0 avertissement.**
- Paquet Lambda construit **sans Docker** (`infra/build_lambda.sh`) : 210 Mo décompressés (limite 250 Mo).
- `AwsStore` (DynamoDB + S3, même interface que le stockage local), chargement du datapack depuis S3 au démarrage à froid, plafond quotidien de dépense LLM (au-delà : gabarit sans LLM, consigné), script `infra/deploy.sh`.
- **Rien n'est déployé ; aucune clé n'a été demandée.**

## Phase 8 — Banc d'essai (local) — 2026-11-14

- `bench/run_bench.py` (`make bench`) → `bench/resultats/fiabilite.json` (page Fiabilité) et `rapport.md`.
- Résultats : signaux attendus 22/22 (IC Wilson 95 % : 85,1–100 %) ; fausses alertes 0/12 (0–24,3 %) ; stabilité 8/8 ; proportionnalité 496/496 ; aucune preuve postérieure à la date simulée 1 984/1 984 ; dossiers entièrement prouvés 16/16 ; latence du signal p50 9 ms, p95 13 ms (local) ; dossier 189 ms (LLM simulé).
- Limites écrites dans le rapport : scénarios étiquetés par l'auteur du moteur (biais possible) ; Bedrock, coût et latences AWS à mesurer en phase 7.

## Phase 9 — Validation UX (2026-11-14)

- axe-core sur 30 vues : 3 règles graves trouvées (dont une introduite par une correction) puis corrigées → **0 violation**.
- Lighthouse : de 82 à **97–98** en performance après découpage du code par écran et compression ; accessibilité et bonnes pratiques **100** ; LCP 2,0–2,3 s.
- Heuristiques de Nielsen écran par écran, 6 parcours de démo pilotés dans Chromium, clics des parcours clés mesurés (2, 1, 4, 4) : `docs/ux/validation.md`.
- Défauts corrigés : pause de réflexion qui cachait « Continuer quand même », définitions du glossaire lues dans les titres, et ceux de la phase 6.

## Phase 10 — Livrables (2026-11-14)

- `README.md` (démarrage, configuration, architecture, limites), `docs/technique.md` (méthodes et références, exclusions motivées, exemple réel phrase → preuves → données → trace), `docs/one-pager.md`, `docs/video-script.md`, `docs/pitch.md`.
- Chiffres du pitch vérifiés sur les sources primaires accessibles : Indice 2024 des ACVM (PDF officiel lu : 53 %, 82 % chez les 18–24 ans), CVMO 2025 (site d'éducation de la CVMO : « About 35% »), OCRI 12 mars 2026 (texte lu dans une reprise ; site de l'OCRI inaccessible à nos outils, déclaré).
- **Erreur évitée** : le script vidéo disait « ce qui a suivi : −71 % » pour TSLA après le 15 décembre 2021. C'est faux à partir de cette date (−71 % mesure la baisse depuis le sommet du 4 novembre 2021). Valeurs vérifiées : −65 % au pire point, +35 % au 2026-11-12. Corrigé. Le contre-exemple NVDA (pause au 15 décembre 2022, puis +928 %) est vérifié.
- Empreinte du datapack ajoutée à la version du code de chaque preuve (`ulysse-0.1.0+dp1-d8fb7edf`).

## Phase 11 — Audit (provisoire)

- `docs/audit.md` : tous les critères sont couverts **sauf** le déploiement AWS (condition d'admissibilité), les mesures avec Bedrock et la vidéo à tourner. **Prochaine étape bloquante : accès AWS.**
