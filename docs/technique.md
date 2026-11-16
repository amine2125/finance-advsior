# Documentation technique — ULYSSE

> Document synthétique exigé par le PDF (p. 15) : méthodes et justification ; sources, actifs, traitements, hypothèses ; mécanisme d'explicabilité avec un exemple réel ; validations, limites, améliorations. Version du 2026-11-14.

## 1. Problème et question utile

L'écart à combler est celui entre l'information (« tout le monde parle de NVIDIA ») et la décision personnelle (« est-ce cohérent avec **ma** situation ? »). ULYSSE répond à une seule question :

> « Cette intention est-elle cohérente avec les règles que j'ai moi-même fixées à froid, et sur quels faits vérifiables repose la réponse ? »

Il ne recommande jamais et ne prédit aucun rendement (PDF p. 17–18).

## 2. Architecture agentique

Chaque composant a un rôle, des outils limités et des interdits explicites. Le LLM n'intervient que pour **planifier** et **rédiger** (décision D-031).

| Composant | Nature | Rôle | N'a pas le droit de | Pourquoi il existe |
|---|---|---|---|---|
| Contrat | code + LLM (rédaction optionnelle) | réponses → clauses typées, origine, versions ; contradictions K1–K7 en code | calculer ; décider un niveau | rendre explicites les règles « à froid » |
| Politique de signal | code | à chaque intention : aucun / ✅ / ⚠ / ⛔ par règles nommées (P1, P2, A1–A3, O1, N1, D1) | appeler un LLM | décision rapide (~10 ms), déterministe, testée |
| Planificateur | LLM (Bedrock) | choisir des modules d'analyse **en plus** des modules de base imposés par le code | calculer ; inventer un outil (rejeté et journalisé) | adapter l'analyse au contexte (ESG, crypto, horizon court, profil avancé) |
| Outils d'analyse | code | 15 outils → objets de preuve | utiliser une donnée future (vue « as-of ») | le code calcule, jamais le LLM |
| Gouvernance | code | statut de chaque clause, conflits, informations manquantes, contrôles visibles | juger sans preuve (ESG : preuves citées sinon « données insuffisantes ») | PDF p. 9 : contrôles visibles |
| Explication | LLM (Bedrock) | rédiger le dossier à partir des **seules** preuves fournies, phrase par phrase étiquetée | accéder aux outils ; recommander ; prédire | rendre le résultat compréhensible |
| Vérificateur | code | V1 étiquette, V2 preuves citées et existantes, V3 chaque chiffre retrouvé dans les preuves citées (tolérance d'arrondi), V4 formulations interdites, V5 cinq étapes ; défaut **nommé** renvoyé (2 essais), puis gabarit | être contourné : le texte non vérifié n'est jamais publié | aucune justification inventée |
| Vigie | code (+ plan LLM au changement de contrat) | dérive, attention inhabituelle, climat, pré-calcul des signaux, notifications sans répétition | parler à chaque heure : seulement le nouveau et le pertinent | prévenir sans harceler |

Principes de la méthode en 10 niveaux appliqués : règles qui nomment leur cas et leur limite (docstrings de `policy.py`) ; agents à outils limités (registre fermé, paramètres à valeurs autorisées) ; modules chargés selon le cas ; le code calcule ; garde-fous qui bloquent (vérificateur) ; l'orchestrateur vérifie que chaque étape a produit sa preuve ; état écrit après chaque étape (reprise, rejeu) ; défaut nommé renvoyé au rédacteur ; tout se mesure (banc d'essai).

## 3. Méthodes et justification

| Question | Méthode retenue | Référence publique |
|---|---|---|
| Ce titre est-il risqué ? | volatilité annualisée (√252) ; pire baisse avec dates et durée de récupération ; CVaR historique 95 % sur 20 séances | Bacon (2008) ; Acerbi & Tasche (2002), J. Banking & Finance 26(7) |
| Le risque monte-t-il ? | EWMA λ = 0,94, rapportée à la volatilité sur un an | J.P. Morgan/Reuters, RiskMetrics Technical Document (1996) |
| Combien pèse ce titre dans le risque ? | contributions d'Euler (covariance hebdomadaire, 3 ans) | Maillard, Roncalli & Teïletche (2010), JPM 36(4) |
| Le portefeuille est-il diversifié ? | transparence des FNB par compositions publiées ; regroupement hiérarchique sur la distance √((1−ρ)/2) (« paris réels ») ; inverse de l'indice de Herfindahl des parts de risque | López de Prado (2016), JPM 42(4) ; Meucci (2009), Risk 22(5) |
| Et si une crise revenait ? | rejeu des épisodes passés (fin 2018, COVID 2020, 2022) avec les poids actuels ; bootstrap stationnaire (blocs moyens de 20 séances, graine fixe), queue basse seulement | Politis & Romano (1994), JASA 89(428) |
| « Tout le monde en parle » ? | Isolation Forest par titre, réentraîné chaque mois sur son seul passé (pages vues de la veille, volume, ampleur du mouvement, volatilité relative) + règle d'attention écrite | Liu, Ting & Zhou (2008), IEEE ICDM |
| Quel climat de marché ? | mélange gaussien à 3 composantes (rendements et volatilités S&P 500 / TSX 60, pentes 10 ans − 2 ans avec délai de publication), descriptif | Bishop (2006), PRML ch. 9 |
| Est-ce cohérent avec le profil ? | règles explicites d'une politique de placement (objectifs datés, perte maximale, horizon par périodes glissantes, concentration, liquidités, ESG documenté) ; score de gravité | code maison, testé |

**Volontairement exclus**, et pourquoi :
- un ML qui prédit les prix : le PDF l'exclut (p. 18) et ce serait une fausse précision ;
- un classement par meilleur rendement passé : le passé ne prédit pas, et l'énoncé l'exclut (p. 3) ;
- un Markowitz « pur » : il est instable face aux erreurs d'estimation et produit des allocations extrêmes qui ressembleraient à une recommandation ;
- une VaR paramétrique normale seule : elle sous-estime les queues épaisses (cf. 2020, 2022) ; on lui préfère la CVaR historique et les rejeux ;
- un classifieur « convient / ne convient pas » : aucune donnée étiquetée n'existe, et la décision appartient aux règles de l'utilisateur.

Toutes les procédures aléatoires utilisent la graine 20261114. Chaque preuve porte la version du code et l'empreinte du datapack (ex. `ulysse-0.1.0+dp1-d8fb7edf`).

## 4. Données, actifs, traitements, hypothèses

- **Univers** : les 31 actifs du jeu de départ (10 actions canadiennes, 10 américaines, 9 FNB, 2 cryptoactifs). Il couvre les tests des personas : énergie pour Mateo, titres médiatisés pour Robert, crypto pour Amira.
- **Traitements** (détail dans `docs/donnees.md`) : rendements sur `adj_close` ; prolongation 2016–2021 jointe par rendements chaînés (écart ≤ 1,3 × 10⁻⁶ sur le chevauchement) ; calendrier maître des jours ouvrables (prix reportés quand un marché est fermé ; crypto échantillonnée à la ligne UTC) ; conversion en CAD avec le taux de la Banque du Canada reporté les jours fériés ; correction de CNQ (faux fractionnement de 1,021 du 2022-08-22, prouvé par le communiqué de CNQ) ; délais de publication prudents pour la macro ; pages vues de la veille.
- **Cohérence temporelle** : un seul accès aux données, la vue `AsOf`, testé sur 1 984 évaluations sans aucune donnée postérieure à la date simulée.
- **Hypothèses** (`docs/hypotheses.md`) : capital et portefeuilles fictifs des personas ; valeurs par défaut des clauses par tolérance ; seuils de la politique ; définition d'une controverse « importante ».

## 5. Mécanisme d'explicabilité, avec un exemple réel

Chaîne : **donnée publique → outil (code) → objet de preuve → statut de clause (code) → niveau (politique écrite) → phrase étiquetée (LLM ou gabarit) → vérificateur → trace**.

Exemple tiré d'un dossier exécuté le 2026-11-14 (`D-20261114-221606-10f5d4`) : Robert prépare un ordre simulé de 160 000 $ sur TSLA.

1. **Phrase publiée** (section Analyse, étiquette MESURÉ) : « Ta règle « Pas plus de 5 % de mon portefeuille dans une seule entreprise (FNB compris). » : dépassée. TSLA pèserait 17,8 % du portefeuille (direct + via FNB), pour une limite de 5 %. »
2. **Preuves citées** : `ev-eba8e341afc9` (statut de la clause : dépassée, valeur après 17,83 %, limite 5 %, origine « valeur par défaut », causée par l'intention) et `ev-1b057acc5bf8` (exposition à TSLA avant 0,14 %, après 17,83 %, méthode « transparence des FNB », sources : positions fictives, cours de clôture, compositions SSGA et iShares Canada, données au 2026-11-12).
3. **Vérificateur** : « 5 », « 17,8 » et « 5 » sont retrouvés dans ces deux preuves (17,83 arrondi à 17,8) ; essai 1 accepté.
4. **Trace** : gouvernance → `C-CONCENTRATION-TITRE : depassee` ; politique de signal → `pause` (règles P1 et P2, gravité 10,7) ; planification → 5 modules de base imposés par le code et 8 ajoutés ; outils → « Composition des FNB ✓ (7 preuves) », etc.

Dans l'interface, chaque chiffre de cette phrase est un bouton qui ouvre le tiroir de preuve (source, date, période, devise, méthode, paramètres, version du code). Le raisonnement interne du modèle n'est jamais affiché (PDF p. 17).

## 6. Validations

| Validation | Résultat (mesuré) |
|---|---|
| Tests automatisés (`make test`) | 71 verts : données, outils sur cas calculables à la main, contrat, politique (chaque règle nommée), vérificateur (chaque défaut), orchestrateur (trace, défaut corrigé, repli sans LLM, outil inventé rejeté), Vigie (pas de répétition, rejeu dans le passé), API = Lambda |
| Banc d'essai (`make bench`, local, LLM simulé) | signaux attendus 22/22 (IC 95 % 85–100 %) ; fausses alertes 0/12 (0–24 %) ; stabilité 8/8 ; proportionnalité 496/496 ; aucune information future 1 984/1 984 ; dossiers entièrement prouvés 16/16 ; latence du signal p50 9 ms, p95 13 ms |
| Accessibilité (axe-core, 30 vues, WCAG 2.2 A/AA) | 0 violation après correction de 3 règles |
| Lighthouse (mobile simulé) | Performance 97–98, Accessibilité 100, Bonnes pratiques 100 (3 écrans) |
| Parcours en navigateur (6 scénarios de démo) | de bout en bout, 0 erreur ; clics : consulter un titre 2, préparer un ordre 4, créer un contrat 4, lire un dossier 1 |

## 7. Limites

Voir le README (section « Limites »). Les principales : déploiement AWS et mesures Bedrock en attente des accès ; compositions de QQQ et ESGV non disponibles ; preuves ESG sur quelques titres seulement ; scénarios du banc d'essai écrits par l'auteur du moteur ; valeurs par défaut non normatives ; données historiques non certifiées et biais du survivant.

## 8. Améliorations envisagées

1. Compositions N-PORT (SEC) avec historique trimestriel daté, pour ouvrir QQQ et ESGV et rendre la transparence exacte dans le passé.
2. Base ESG élargie (dépôts SEDAR+ et EDGAR, rapports de durabilité), avec revue humaine des extraits.
3. Scénarios du banc d'essai écrits par des tiers (conseillers, utilisateurs) et mesure en double aveugle.
4. Seuils de la politique calibrés avec des utilisateurs (fatigue des alertes) ; préférences de notification plus fines.
5. Univers élargi à la demande, avec la même rigueur documentaire.
