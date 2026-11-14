# AEGIS — investir selon son propre profil

Application d'investissement agentique (Datathon PolyFinances 2026 · AlphaForge AI). L'utilisateur s'inscrit comme à la banque
(objectif, horizon, baisse tolérable, situation, préférences). AEGIS en déduit son profil et ses limites, puis répond à
« puis-je investir X $ dans Y ? » par **oui**, **oui jusqu'à tel montant** ou **non**, avec les raisons chiffrées.
Rien n'est pré-chargé : aucun persona ni portefeuille n'est codé en dur. Les trois personas de l'énoncé (Amira, Mateo, Robert)
restent disponibles en « mode démo », uniquement sur demande explicite.

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

Pour activer l'assistant IA et le débat des agents (Amazon Bedrock) : copiez `.env.example` en `.env` et remplissez les clés AWS.
Sans elles, tout le reste fonctionne (profil, analyse du portefeuille, verdict « Investir », recherche SEC) et l'interface
indique clairement que l'IA générative n'est pas connectée.

## Parcours

1. **Accueil** : explique comment ça marche en 3 étapes.
2. **Inscription** (9 écrans, une question à la fois) → profil calculé, avec le « pourquoi » de chaque règle, à confirmer.
3. **Placements** : saisie, import CSV, ou départ de zéro.
4. **Investir** : verdict pour le profil + liste des placements adaptés / possibles en partie / non adaptés.
5. **Mon portefeuille** : limites respectées ou non (en langage clair), répartition, risque mesuré, historique.
6. **Assistant** : chat relié aux outils de calcul + débat Opportunités vs Risques, vérifié, puis conclusion du Superviseur.

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
cd backend && .venv/bin/python -m pytest -q          # 58 tests (formules, profils, verdicts, API, gouvernance)
cd frontend && npx playwright install chromium && AEGIS_URL=http://localhost:5173 npx playwright test   # parcours complet
```

## AWS

`infrastructure/` (CDK TypeScript) : S3 + CloudFront (interface), API Gateway + Lambda (API et agents), DynamoDB, Bedrock,
EventBridge, SNS. `scripts/build_lambda.sh` puis `cd infrastructure && npx cdk deploy`.

Simulation uniquement : aucune transaction réelle, pas un conseil financier personnalisé.
