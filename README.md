# AEGIS × ULYSSE — investir selon son propre profil

Application d'investissement agentique et auto-explicative (Datathon PolyFinances 2026 · AlphaForge AI, Banque Nationale × AWS).
Chacun crée son compte, répond au questionnaire « Connaître son client », connecte ses placements, puis dit en français ce
qu'il veut faire de son argent. Des agents analysent, vérifient chaque chiffre et proposent des ordres ; rien n'est fait sans
l'accord de la personne.

Cette branche réunit les deux projets de l'équipe :

- **AEGIS** : l'interface, les comptes (Amazon Cognito), les données des utilisateurs (DynamoDB), le profil de risque,
  le mandat agentique (agents Bedrock + gouvernance), Léa (assistante), le déploiement AWS (CDK).
- **ULYSSE** : le moteur de signaux de marché, branché dans l'interface d'AEGIS :
  - **climat de marché** (calme / agité / tendu, mélange gaussien sur des mesures hebdomadaires) — page d'accueil ;
  - **attention inhabituelle** sur un titre (vues Wikipédia et volume vs. son propre historique, forêt d'isolement) —
    page d'accueil (sur vos placements), page d'un placement, et raison supplémentaire dans le mandat d'achat ;
  - **mesures avancées** d'un placement (très mauvais mois, plus long passage sous un sommet, risque récent).
  Chaque signal décrit le présent à partir de données publiques à la date affichée ; aucun ne prédit.

Simulation éducative : aucune transaction réelle, pas un conseil financier personnalisé.

## Comptes de démonstration (jury)

Version en ligne : https://d2p220whqnshao.cloudfront.net — boutons « Entrer » sur la page de connexion, ou :

| Compte | Courriel | Mot de passe | Ce qu'on y voit |
|---|---|---|---|
| Amira | `amira@demo.aegis-finance.ca` | `AegisDemo2026!` | profil élevé, trop concentré en technologie et en NVIDIA |
| Mateo | `mateo@demo.aegis-finance.ca` | `AegisDemo2026!` | profil modéré, portefeuille conforme : « rien à changer » + idées |
| Robert | `robert@demo.aegis-finance.ca` | `AegisDemo2026!` | profil faible à modéré, trop d'actions populaires : rééquilibrage |

Ce sont de vrais comptes ordinaires (mêmes écrans, mêmes agents, réponses modifiables). Leurs données sont recréées à la première
connexion et après « Tout effacer et recommencer » (Profil). On peut aussi créer son propre compte : il est confirmé tout de suite.

## Démarrage local

Prérequis : Python 3.12+, Node 20+.

```bash
make setup      # environnement Python (AEGIS + ULYSSE), interface, CDK
make data       # jeu de données officiel (data/active) + datapack ULYSSE (data/build), depuis le kit dans context/
make test       # 87 tests backend (AEGIS + ULYSSE), sans AWS ni réseau
make api        # API sur http://127.0.0.1:8000
make web        # interface sur http://localhost:5173 (autre terminal)
```

Copiez `.env.example` en `.env` et remplissez les clés AWS (les lignes `export KEY=…` copiées d'un portail AWS sont acceptées).
Avec la section « Comptes et base de données » remplie, le serveur local utilise les mêmes comptes Cognito et la même table
DynamoDB que la version déployée ; sans elle, il démarre en mode bac à sable (sans connexion, fichiers JSON locaux).
Les clés temporaires d'un atelier AWS expirent après quelques heures : recollez-en de nouvelles dans `.env` et relancez l'API.

## Parcours : un mandat d'investissement agentique

1. **Connaître son client** (~20 questions) : tolérance, capacité, connaissances ; la plus basse fixe le profil. Chaque réponse
   reste modifiable une à une (Profil → Vos réponses), avec le nouveau profil prévisualisé avant d'enregistrer.
2. **Vos placements** : connexion simulée d'un compte de courtage (prix historiques réels) ou saisie manuelle.
3. **« Que voulez-vous faire ? »** en français libre : « J'ai 10 000 $ à investir », « Je veux 2 000 $ de NVIDIA »,
   « Rééquilibre mon portefeuille ». Les agents travaillent en direct (`backend/app/agents/mandate.py`) :
   Profil → Superviseur (comprend la demande, retrouve un titre mal écrit) → Données → Recherche (SEC EDGAR, nouvelles) →
   Analyste (ordres concrets) → Gouvernance (vérifie chaque ordre) → Scénarios (rejeu 2022 + chocs) →
   Opportunités / Risques (Bedrock, en parallèle, délai borné) → Gouvernance (audit de chaque chiffre) → Explicabilité.
4. **La proposition**, en images : verdict, zone du profil, problèmes trouvés, plan groupé (vendre / alléger / acheter),
   ce que ça change, et l'analyse complète repliée (raisons, contrôles, scénarios, pour et contre, trace des agents).
5. **Point de contrôle humain** : Approuver (simulation) · Modifier · Refuser.

## Architecture

```
frontend/                React + Vite + Tailwind + Framer Motion (interface AEGIS)
backend/app/             API FastAPI (/api/v1) : comptes, profil, placements, mandats, agents, gouvernance
backend/ulysse/          moteur ULYSSE : datapack « à date », climat de marché, attention inhabituelle, mesures avancées
backend/tests*/          tests AEGIS (tests_aegis) et ULYSSE (tests)
infrastructure/          AWS CDK : CloudFront + S3, API Gateway + Lambda (API, worker), Cognito, DynamoDB, Bedrock, CloudWatch
scripts/                 import du jeu de données, build Lambda, comptes de démonstration
context/Datathon2026/    énoncé et kit de départ officiels
```

- Comptes : l'interface parle directement à Cognito ; l'API ne reçoit que le jeton d'accès, qu'elle fait valider par Cognito
  (cache 5 min). Un compte = une partition DynamoDB (`PK = USER#u-<sub Cognito>`).
- Signaux ULYSSE : calculés en direct en local ; sur AWS, précalculés au build (`make lambda`) pour ne pas embarquer
  scikit-learn/SciPy dans la Lambda. Sans moteur ni fichier, l'interface les omet simplement.
- Tous les chiffres viennent de calculs Python testés ; les LLM rédigent et argumentent, un validateur rejette tout chiffre
  non traçable.

## Déployer

```bash
make deploy     # paquet Lambda + interface + `cdk deploy` + comptes de démonstration (clés AWS dans .env)
```
