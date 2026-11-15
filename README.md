# AEGIS — investir selon son propre profil

Application d'investissement agentique (Datathon PolyFinances 2026 · AlphaForge AI). L'utilisateur s'inscrit comme à la banque
(objectif, horizon, baisse tolérable, situation, préférences). AEGIS en déduit son profil et ses limites, puis répond à
« puis-je investir X $ dans Y ? » par **oui**, **oui jusqu'à tel montant** ou **non**, avec les raisons chiffrées.
Chacun crée son compte (Amazon Cognito), répond au questionnaire et connecte ses placements. Pour le jury, trois comptes de
démonstration reprennent les investisseurs de l'énoncé, avec leurs réponses et un portefeuille déjà connectés.

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

```bash
# 1. Données officielles du datathon → data/active (jamais commité)
cd backend && python3.11 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python ../scripts/import_datathon_zip.py ~/Datathon2026/alphaforge_starter   # ou le chemin du .zip

# 2. API (http://localhost:8000/docs)
.venv/bin/uvicorn app.main:app --port 8000

# 3. Interface (http://localhost:5173)
cd ../frontend && npm install && npm run dev
```

Copiez `.env.example` en `.env` et remplissez les clés AWS (les lignes `export KEY=…` copiées d'un portail AWS sont acceptées).
Avec la section « Comptes et base de données » remplie, le serveur local utilise les mêmes comptes Cognito et la même table
DynamoDB que la version déployée. Sans elle, il démarre en mode bac à sable (sans connexion, fichiers JSON locaux).

Les clés temporaires d'un atelier AWS expirent après quelques heures : si les agents ou la connexion échouent, recollez-en de
nouvelles dans `.env` et redémarrez l'API.

## Parcours : un mandat d'investissement agentique

1. **Connaître son client** (~20 questions) : tolérance, capacité, connaissances; la plus basse fixe le profil.
2. **Vos placements** : chaque personne entre son propre portefeuille (aucun profil ni portefeuille n'est pré-chargé).
3. **« Que voulez-vous faire ? »** en français libre : « J'ai 10 000 $ à investir », « Je veux 2 000 $ de NVIDIA »,
   « Analyse et rééquilibre mon portefeuille ». Les agents travaillent en direct (`backend/app/agents/mandate.py`) :
   Profil → Superviseur (comprend la demande) → Données → Recherche (SEC EDGAR, nouvelles, si un titre est demandé) →
   Analyste (ordres concrets) → Gouvernance (vérifie chaque ordre, ajuste ou bloque) → Scénarios (rejeu 2022 + chocs) →
   Opportunités / Risques (Bedrock, en parallèle) → Gouvernance (audit de chaque chiffre cité) → Explicabilité (Bedrock, audité).
4. **La proposition** : ordres d'achat/vente, demande initiale acceptée / réduite / refusée et pourquoi, avant/après, contrôles,
   scénarios, arguments vérifiés (✓/✗), explication dont chaque chiffre est relié à sa méthode, sources, trace des agents.
5. **Point de contrôle humain** : Approuver (simulation) · Modifier · Refuser. Léa (bulle) connaît la dernière proposition.

Règles notables : l'argent neuf comble d'abord ce qui manque (stabilité ou croissance) sans rien vendre; une demande trop
grosse pour une limite de taille est combinée avec des fonds diversifiés (ex. crypto ≤ 10 % du total); un dépassement qui ne
se corrige qu'en vendant est signalé.

## Comment le verdict est calculé (déterministe, `backend/app/services/invest_service.py`)

1. Préférences déclarées : pas de part spéculative → pas de crypto ; secteurs exclus.
2. Horizon : argent nécessaire dans moins de 3 ans → aucun placement à risque élevé.
3. Limites du profil recalculées après l'ajout (part en actions, poids d'une entreprise, d'un secteur, part spéculative,
   baisses passées) et niveau de risque du portefeuille comparé au niveau permis.
4. Si le montant est trop élevé : recherche du plus grand montant qui ne crée ni n'aggrave aucun dépassement.

Le profil vient de `backend/app/analytics/profile_builder.py` : règles versionnées dans `backend/app/methodology.py`
(`profile_builder`). L'âge n'est jamais utilisé pour déduire la tolérance au risque. Tous les chiffres viennent de calculs
Python testés ; les LLM rédigent et argumentent, un validateur rejette tout chiffre non traçable.

## Données et sources

- Jeu de départ officiel (Yahoo Finance, Banque du Canada, FRED), 2021-11-12 → 2026-11-12, converti en $ CA.
- En direct : SEC EDGAR (dépôts et états financiers des émetteurs US), GDELT, CoinGecko, Banque du Canada.
- Indisponible = affiché « indisponible », jamais inventé ni remplacé par zéro.

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q          # 70 tests (formules, profils KYC, verdicts, mandats agentiques, API, gouvernance)
cd frontend && npx playwright install chromium && AEGIS_URL=http://localhost:5173 npx playwright test   # parcours complet
```

## AWS

`infrastructure/` (CDK TypeScript) : S3 + CloudFront (interface), API Gateway + Lambda (API et agents), **Cognito** (comptes),
**DynamoDB** (toutes les données des utilisateurs : profils, réponses, portefeuilles, mandats, conversations), Bedrock,
EventBridge, SNS, CloudWatch.

- Comptes : l'interface parle directement à Cognito ; l'API ne reçoit que le jeton d'accès, qu'elle fait valider par Cognito
  à chaque requête (mis en cache 5 min). Les mots de passe ne passent jamais par nos serveurs. Un compte = une partition
  DynamoDB (`PK = USER#u-<sub Cognito>`) : personne ne lit les données d'un autre.
- Déployer :

```bash
PATH="$PWD/backend/.venv/bin:$PATH" bash scripts/build_lambda.sh        # paquet Lambda (uv requis : pip install uv)
cd frontend && npm run build && cd ../infrastructure && npm ci
npx cdk deploy --outputs-file cdk-outputs.json                          # avec les clés AWS dans l'environnement
cd .. && backend/.venv/bin/python scripts/seed_demo_accounts.py         # crée les 3 comptes de démonstration
```

Simulation uniquement : aucune transaction réelle, pas un conseil financier personnalisé.
