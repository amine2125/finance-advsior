# Documentation technique — AEGIS × ULYSSE

> Document synthétique demandé par l'énoncé (p. 15) : méthodes et justification ; sources, actifs, traitements et hypothèses ;
> mécanisme d'explicabilité avec un exemple réel ; validations, limites et améliorations. Version du 2026-11-15, branche `fusion`.

## 1. Question traitée

Les investisseurs ont accès à beaucoup d'informations ; leur difficulté est de les **relier à leur propre situation** (énoncé p. 3).
AEGIS répond à une question précise :

> « Ce que je veux faire de mon argent est-il compatible avec le profil que j'ai déclaré, et sur quels chiffres vérifiables repose
> la réponse ? »

La personne décrit sa situation (questionnaire « Connaître son client »), connecte un portefeuille simulé, puis formule une demande
en français : « J'ai 10 000 $ à investir », « Je veux 2 000 $ de NVIDIA », « Rééquilibre mon portefeuille ». Des agents produisent
une **proposition simulée** qu'elle approuve, modifie ou refuse. Aucune transaction réelle, aucun conseil personnalisé (p. 17),
aucune prédiction de rendement (p. 18).

## 2. Architecture agentique

Principe : **le code calcule et décide ; le modèle de langage argumente et rédige ; un validateur vérifie chaque chiffre écrit**.
Chaque étape de la trace indique ce qui a fait le travail : « Calcul Python », « IA (Bedrock) » ou « Calcul + IA ».

| # | Agent | Rôle | Moteur | Ce qu'il n'a pas le droit de faire |
|---|---|---|---|---|
| 1 | Profil | lit les limites du profil, le solde, les préférences (ESG, secteurs exclus) | calcul | modifier les limites |
| 2 | Superviseur | extrait montant, titre et intention ; retrouve un nom mal écrit dans la liste fermée des 31 actifs | calcul + IA | inventer un titre hors liste |
| 3 | Données | valide prix, devises et taux ; signale les données douteuses | calcul | combler un trou |
| 4 | Recherche | si un titre est demandé : dépôts SEC, nouvelles dédupliquées, attention inhabituelle (ULYSSE) | calcul + IA | tenir une manchette pour une preuve |
| 5 | Analyste | construit les ordres : comble ce qui manque, ou corrige au minimum un dépassement | calcul | proposer un actif hors limites |
| 6 | Gouvernance (ordres) | accepte, réduit au montant permis ou bloque chaque ordre ; avertit (ESG, qualité des données) | calcul | être contournée : un ordre bloqué est retiré |
| 7 | Scénarios | rejoue 2022 et des chocs hypothétiques, avant et après | calcul | présenter un choc comme une prévision |
| 8 | Opportunités / Risques | arguments pour et contre, en parallèle, délai borné | IA | calculer ; citer un chiffre absent du registre |
| 9 | Gouvernance (audit) | vérifie chaque chiffre et chaque formulation des arguments | calcul | accepter un chiffre non traçable |
| 10 | Explicabilité | rédige la réponse à partir du dossier ; phrases corrigées si l'audit les rejette | IA | recommander, prédire |
| 11 | La personne | approuve, modifie ou refuse | humain | — |

Code : `backend/app/agents/mandate.py` (orchestration, liste `STEPS`), `backend/app/governance/validator.py` (audit).
Si Bedrock est lent ou absent, les étapes 8 et 10 sont marquées « échec » ou « ignorée » et une explication déterministe les remplace :
la proposition reste complète.

**Léa** (assistante) suit le même principe avec des outils fermés (`check_investment`, `model_portfolio`, `portfolio_xray`,
`hype_research`…) ; sa réponse est auditée avant affichage, et réécrite une fois si l'audit la rejette.

## 3. Méthodes et justification

| Question | Méthode | Référence |
|---|---|---|
| Ce titre est-il risqué ? | volatilité annualisée (√252, √365 pour la crypto), pire baisse sur 5 ans, niveau faible / moyen / élevé par seuils gelés (`docs/hypotheses.md` §4) | Bacon (2008) |
| Que pèserait-il dans le portefeuille ? | ajout hypothétique, recalcul de toutes les limites, montant maximal compatible par dichotomie | code maison, testé |
| Le portefeuille est-il diversifié ? | parts par émetteur, secteur et thème, FNB ouverts quand leur composition est publiée ; contributions au risque ; corrélations en période de stress | Maillard, Roncalli & Teïletche (2010) |
| Et si une crise revenait ? | rejeu de 2022 avec les poids actuels ; chocs hypothétiques explicites | — |
| Le risque monte-t-il ? | EWMA λ = 0,94 rapportée à la volatilité sur un an ; CVaR historique 95 % sur 20 séances | RiskMetrics (1996) ; Acerbi & Tasche (2002) |
| « Tout le monde en parle » ? | Isolation Forest par titre, entraîné sur son seul passé (pages vues de la veille, volume, ampleur du mouvement), puis règle écrite : 5 % les plus inhabituels **et** vues ou volume ≥ 1,5 × l'habituel | Liu, Ting & Zhou (2008) |
| Quel climat de marché ? | mélange gaussien à 3 états (calme, agité, tendu) sur des mesures hebdomadaires S&P 500, TSX 60 et pentes de taux 10 ans − 2 ans | Bishop (2006), ch. 9 |
| Le profil | quatre mesures (tolérance, comportement, capacité, connaissances) ; la plus basse fixe le niveau | `docs/hypotheses.md` §2 |

**Volontairement exclus** : prédiction de prix (p. 18) ; classement par meilleur rendement passé (p. 3) ; Markowitz « pur »
(allocations extrêmes et instables, qui ressembleraient à une recommandation) ; VaR paramétrique normale seule (queues sous-estimées) ;
classifieur « convient / ne convient pas » (aucune donnée étiquetée, et la décision appartient aux règles explicites).

## 4. Données, actifs, traitements, hypothèses

- **Univers** : les 31 actifs du kit (10 actions canadiennes, 10 américaines, 9 FNB dont un FNB ESG, Bitcoin et Ether). Il couvre les
  tests des personas : technologie et crypto pour Amira, ESG et énergie pour Mateo, titres médiatisés pour Robert.
- **Sources** : `docs/donnees.md` (S1 à S12), avec origine, période, traitement, limites et conditions de chaque source.
- **Cohérence temporelle** (p. 14) : délais de publication prudents pour la macro, pages vues et compositions utilisables le
  lendemain, états financiers SEC lus « à date ». Les prix peuvent être prolongés après le 2026-11-12 avec le script officiel du kit
  (S10) ; quand les nouvelles lues sont plus récentes que les prix, l'écran l'affiche.
- **Hypothèses** : `docs/hypotheses.md` (seuils, limites par profil, chocs, comptes de démonstration, ESG).

## 5. Mécanisme d'explicabilité, avec un exemple réel

Chaîne : **donnée publique → calcul Python → registre de métriques (valeur, méthode, période, source) → règle du profil →
phrase → audit → trace**. Les modèles de langage n'écrivent que des identifiants de métriques ; l'interface affiche les vraies valeurs.

**Exemple** exécuté le 2026-11-15 sur le compte de démonstration de Robert (jeu officiel, données au 2026-11-12, modèle de langage
désactivé pour montrer le chemin déterministe). Demande : « Je veux 3 000 $ de Tesla ».

1. **Conclusion affichée** : « Hors de vos limites : 3 000 $ dans Tesla ne respecte pas votre profil. Alternative simulée : la même
   somme dans un portefeuille faible à modéré. »
2. **Raisons**, chacune calculée :
   - « Tesla a un risque élevé : il varie typiquement de ± 59,6 % par année, et sa pire baisse sur 5 ans a été de −73,0 %. »
     → métriques `mnd.asset.vol` (volatilité historique 5 ans) et `mnd.asset.mdd` (perte maximale 5 ans), source `prices_daily.csv` ;
   - « Votre portefeuille a déjà trop d'actions et de cryptos (86,0 % ; votre zone : 30,0 % à 45,0 %). » → limite `growth_min/max`
     du niveau « faible à modéré » ;
   - « Tesla pèserait 10,2 % de votre portefeuille ; la limite de votre profil par entreprise est 5,0 %. »
3. **Gouvernance** : « Demande « Tesla » refusée » (bloquée) ; montant maximal compatible `mnd.request.max` = 0 $.
4. **Proposition** : XBB.TO 1 605 $ et AGG 1 395 $ (obligations), pour la même somme.
5. **Trace** (extrait) :
   `profile.read` Calcul Python · « Profil Faible à modéré · actions entre 30,0 % et 45,0 % · max 5,0 % par entreprise… » ;
   `supervisor.understand` Calcul + IA · « Acheter 3 000 $ de TSLA » ;
   `quant.proposal` Calcul Python · « 2 ordre(s) : achats 3 000 $ » ;
   `scenario.stress` Calcul Python · « 2022 rejoué : −22,1 % → −21,9 % » ;
   `opportunity.r1` / `risk.r1` IA (Bedrock) · « Indisponible : IA générative non connectée ».

Avec Bedrock connecté, les agents Opportunités et Risques ajoutent leurs arguments ; chaque chiffre qu'ils citent doit exister dans le
registre (tolérance d'arrondi), sinon la phrase est rejetée et corrigée. Le raisonnement interne des modèles n'est jamais affiché (p. 17).

## 6. Validations

| Validation | Résultat |
|---|---|
| Tests automatisés (`make test`) | 108 tests verts, dont 10 qui demandent le datapack ULYSSE (`make data` d'abord) : formules financières, profil, verdicts, mandats, solde, validateur (formulations interdites, conseil personnalisé, chiffres non traçables), ESG, dates de recherche, signaux ULYSSE, absence d'information future |
| Prolongation des prix (`make data-refresh`) | clôtures identiques au kit sur le chevauchement (écart maximal 0,000 % le 2026-11-15) ; contrôles du kit sans avertissement |
| Parcours en navigateur (`make e2e`, Playwright) | inscription, questionnaire, deux mandats, approbation, leçon ; à relancer avant la remise |
| Trois comptes de démonstration (exécution locale du 2026-11-15) | Robert : Tesla refusée, alternative obligataire ; Amira : rééquilibrage, volatilité 24,9 % → 12,9 %, rejeu 2022 −24,3 % → −6,8 % ; Mateo : « rien à corriger » |

## 7. Limites

- Simulation : argent fictif, aucune transaction, aucun lien avec un vrai courtier.
- Seuils et limites par profil : heuristiques lisibles, pas des règles réglementaires.
- ESG : filtre sectoriel sourcé, pas de note ESG ni de vérification des controverses par entreprise.
- Données Yahoo non certifiées ; biais du survivant ; compositions de QQQ et d'ESGV non disponibles.
- Nouvelles : couverture GDELT ; dépôts SEDAR+ non connectés.
- Le passé ne prédit pas l'avenir : rejeux et chocs décrivent un fait passé ou une hypothèse explicite.

## 8. Améliorations envisagées

1. Compositions N-PORT (SEC) pour ouvrir QQQ et ESGV.
2. Dépôts SEDAR+ pour les émetteurs canadiens, et extraits ESG documentés par entreprise avec revue humaine.
3. Mise à jour quotidienne des prix sur AWS (EventBridge) plutôt qu'au déploiement, avec recalcul des signaux ULYSSE.
4. Calibrage des limites par profil avec des utilisateurs.
