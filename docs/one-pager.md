# AEGIS — chaque idée d'investissement confrontée à votre propre profil, chiffres à l'appui

**Simulation éducative, pas un conseil financier personnalisé.** Datathon AlphaForge AI 2026 (Banque Nationale × AWS × PolyFinances).

**Le problème.** L'information abonde, mais la décision reste personnelle : un portefeuille finit souvent par ressembler aux titres
dont tout le monde parle, plutôt qu'à la personne. Environ 35 % des investisseurs particuliers canadiens sondés par la CVMO (2025)
disent avoir pris une décision financière à la suite d'un influenceur ; 53 % des Canadiens s'informent sur l'investissement par les
réseaux sociaux, 82 % chez les 18–24 ans (Indice des investisseurs 2024 des ACVM). La question à éclairer : « est-ce compatible avec
**ma** situation, et sur quoi repose la réponse ? »

**L'approche agentique.** La personne remplit un questionnaire « Connaître son client » (la plus basse de quatre mesures fixe son
profil), connecte un portefeuille simulé, puis écrit sa demande en français. Onze étapes s'enchaînent sous ses yeux : Profil,
Superviseur, Données, Recherche (SEC EDGAR, nouvelles, attention inhabituelle), Analyste, Gouvernance, Scénarios, Opportunités
contre Risques, audit de chaque chiffre, Explicabilité. Elle approuve, modifie ou refuse. **Le code calcule et décide ; le modèle de
langage (Claude sur Amazon Bedrock) argumente et rédige ; un validateur rejette tout chiffre non traçable**, toute prédiction et toute
formule de conseil personnalisé.

**Originalité.** (1) Des agents adverses (pour / contre) audités par la gouvernance, au lieu d'une seule voix convaincante.
(2) Des signaux de marché qui décrivent sans prédire (moteur ULYSSE) : climat de marché par mélange gaussien, attention inhabituelle
par Isolation Forest sur les pages vues Wikipédia et le volume. (3) Une trace qui dit, étape par étape, ce qui vient d'un calcul et
ce qui vient d'un modèle de langage.

**Trois profils, trois réponses.** Robert (faible à modéré) demande 3 000 $ de Tesla : refusé, avec une alternative obligataire, car
son portefeuille compte déjà 86 % d'actions pour une zone de 30 à 45 %. Amira (élevée) demande un rééquilibrage : la volatilité
passerait de 24,9 % à 12,9 %, sans renoncer à la croissance. Mateo (modéré, ESG) : portefeuille conforme, rien à corriger ; un titre
pétrolier est refusé, car il a lui-même exclu l'énergie (sans cette exclusion, le filtre ESG sourcé le signale).

**Données.** Jeu officiel AlphaForge (31 actifs, 2021–2026), prolongé vers le passé (2016) et jusqu'à la veille du déploiement avec le
script et les sources du kit ; Banque du Canada, FRED ; pages vues Wikipédia ; compositions de FNB (SSGA, iShares) ; SEC EDGAR, GDELT,
CoinGecko en direct ; règle d'exclusion de l'indice d'ESGV (prospectus SEC). Chaque source est cataloguée : origine, date,
traitement, limites, conditions.

**Explicabilité.** Chaque chiffre vient d'un registre (valeur, méthode, période, source) ; chaque proposition affiche ses raisons,
ses contrôles, ses scénarios, ses arguments pour et contre, ses limites, et la trace des agents. Si l'IA est indisponible, la
proposition reste complète avec une explication déterministe.

**Sur AWS.** CloudFront, S3, Cognito, API Gateway, deux Lambda (API et agents asynchrones), DynamoDB (une partition par compte),
Bedrock, CloudWatch ; tout décrit en CDK et déployé en une commande. 108 tests automatisés.

**Bénéfice.** Moins de décisions prises à chaud contre ses propres objectifs ; des explications vérifiables pour apprendre ; pour une
institution, un outil d'aide à la décision qui informe sans se substituer à un conseiller.
