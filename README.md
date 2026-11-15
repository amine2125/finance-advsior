# ULYSSE

**Une application de placement simulée qui vérifie tes intentions contre les règles que tu as toi-même fixées, faits à l'appui.**
Datathon PolyFinances 2026 « AlphaForge AI » (Banque Nationale × AWS × PolyFinances).

> **Simulation, pas un conseil financier.** Aucune transaction réelle. ULYSSE ne dit jamais « achète », « vends » ou « tu devrais » : il montre si une intention est cohérente avec ton contrat, avec des preuves vérifiables. Profils et portefeuilles fictifs ; données publiques uniquement.

Ulysse s'est fait attacher au mât pour résister au chant des sirènes. Ici, les sirènes sont l'engouement du marché ; le mât, ce sont tes règles, écrites à froid.

## Ce que fait l'app

- **Le Contrat (à froid)** : tes règles (perte maximale en crise, horizon, concentration, techno, crypto, liquidités, ESG…), chacune avec son origine (« tu l'as dit » ou « valeur par défaut, hypothèse documentée »), versionnées ; les contradictions sont relevées.
- **Le Mât (à chaud)** : pendant la saisie d'un ordre simulé, chaque règle est vérifiée en code en ~10 ms ; selon la gravité : ✅ discret, ⚠ encadré ou ⛔ pause de réflexion, toujours avec « Continuer quand même » et « Modifier ma règle ».
- **La Vigie (en continu)** : chaque heure (ou à la demande, ou rejouée à une date passée), elle surveille la dérive du portefeuille, l'attention inhabituelle sur les titres suivis et le climat de marché, puis pré-calcule les signaux.
- **Le signal** : partout dans l'app, l'élément concerné s'allume (halo + pastille) ; un clic ouvre 2–3 faits, leurs preuves et des options.
- **Le dossier de décision** : Données → Constats → Analyse → Options → Explication ; chaque phrase étiquetée (MESURÉ, DOCUMENTÉ, HYPOTHÈSE, INCERTAIN) ; chaque chiffre cliquable vers sa preuve ; un vérificateur en code rejette tout chiffre sans preuve.
- **La machine à remonter le temps** : toute l'app à une date passée, avec seulement l'information publiée à cette date.

## Démarrage (local, sans AWS)

Prérequis : Python 3.12, Node 20+ (testé avec Node 26), macOS ou Linux.

```bash
make setup        # environnement Python + dépendances de l'interface
make data         # construit le datapack (télécharge une fois les sources publiques manquantes)
make test         # 71 tests, sans AWS ni réseau, LLM simulé
make web-build    # construit l'interface
make api          # serveur local : http://127.0.0.1:8000
make demo         # (autre terminal) remet la démo dans un état connu
make bench        # banc d'essai -> page Fiabilité
```

Développement de l'interface avec rechargement : `make api` puis `make web` (http://localhost:5173).

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `ULYSSE_LLM` | `simule` | `simule` (déterministe), `simule_defaut` (démo du vérificateur) ou `bedrock` |
| `ULYSSE_BEDROCK_MODEL` | `anthropic.claude-opus-5-5` | modèle ou profil d'inférence Bedrock (planifier et rédiger seulement) |
| `ULYSSE_ASOF` | `2026-11-14` | « aujourd'hui » de l'app (démo reproductible) |
| `ULYSSE_STORE` | local | `aws` : DynamoDB + S3 |
| `ULYSSE_KIT_DIR`, `ULYSSE_DATA_DIR`, `ULYSSE_DATAPACK_DIR`, `ULYSSE_STATE_DIR` | dossiers du dépôt | emplacements des données et de l'état |
| `ULYSSE_LLM_LIMITE_JOUR_USD` | 0 (aucun) | au-delà, rédaction par gabarit sans LLM, consignée |

Aucun secret dans le code ni dans le dépôt.

## Architecture

```
frontend/ (React + TypeScript)  ──/api──>  backend/ulysse (Python, une seule base de code)
                                             ├─ data/        datapack + vue « as-of » (aucune information future)
                                             ├─ analytics/   outils : risque, transparence des FNB, paris réels, rejeux, bootstrap, engouement, régimes
                                             ├─ contract/    contrat, évaluation des clauses, contradictions, ESG sur preuves
                                             ├─ policy.py    politique de signal (règles nommées, score de gravité)
                                             ├─ governance.py, verifier.py, writer.py, llm.py, orchestrator.py, vigie.py
                                             └─ api/         routes communes au serveur local et à la Lambda
infra/ (AWS SAM)   CloudFront → S3 (interface) + URL de fonction Lambda ; DynamoDB ; S3 (données, preuves, traces) ;
                   EventBridge Scheduler (Vigie horaire) ; Bedrock ; budget AWS — voir docs/aws.md
bench/             banc d'essai (scénarios étiquetés, propriétés, latence)
```

Le LLM ne fait que **planifier** (choisir des modules d'analyse) et **rédiger** (à partir des seules preuves). Tout calcul, toute règle et tout niveau de signal sont du code testé.

## Données

Jeu de départ AlphaForge (31 actifs, 2021-11-12 → 2026-11-12) + ajouts documentés : prolongation historique 2016–2021 (mêmes sources), pages vues Wikipedia (CC0), compositions de FNB (SSGA, iShares Canada), preuves ESG citées (fiche Vanguard, règles FTSE, 10-K de XOM, dépêche AP). Correction de l'anomalie CNQ du 2022-08-22 prouvée par le communiqué de CNQ. Catalogue complet : [docs/donnees.md](docs/donnees.md).

## Documentation

| Document | Contenu |
|---|---|
| [docs/technique.md](docs/technique.md) | Méthodes et justification, données, hypothèses, explicabilité avec un exemple réel, validations, limites, améliorations |
| [docs/one-pager.md](docs/one-pager.md) | Le projet en une page |
| [docs/video-script.md](docs/video-script.md) | Script de la vidéo (~5 min) |
| [docs/pitch.md](docs/pitch.md) | Plan, messages clés, chiffres sourcés |
| [docs/aws.md](docs/aws.md) | Architecture AWS, rôle et raison de chaque service, coût estimé |
| [docs/donnees.md](docs/donnees.md), [docs/hypotheses.md](docs/hypotheses.md) | Catalogue des sources ; hypothèses |
| [docs/design.md](docs/design.md), [docs/skills.md](docs/skills.md), [docs/ux/validation.md](docs/ux/validation.md) | Système de design, skills UX/UI, validation UX |
| [docs/decisions.md](docs/decisions.md), [docs/journal.md](docs/journal.md), [docs/audit.md](docs/audit.md) | Décisions, journal par phase, audit final |

## Limites (honnêtes)

- **AWS pas encore déployé** : l'infrastructure (SAM) est écrite et validée localement (`cfn-lint`) et le paquet Lambda est construit, mais le déploiement attend les accès de l'équipe (phase 7). Les mesures avec Bedrock (taux de rejet réel du vérificateur, durée et coût par dossier, latence sur AWS) ne sont donc **pas encore mesurées**.
- Le LLM réel n'a pas encore été appelé : les dossiers de démonstration locale sont rédigés par un LLM simulé déterministe (gabarit), vérifiés par le même vérificateur.
- Compositions de QQQ et d'ESGV non disponibles (pas de téléchargement automatisable chez les émetteurs ; les dépôts N-PORT de la SEC exigent une adresse de contact déclarée) : ces fonds sont traités comme des blocs opaques, et l'app le dit.
- Composition historique de SPY non publiée par l'émetteur : en mode machine à remonter le temps, SPY est opaque avant novembre 2026.
- Preuves ESG limitées à quelques titres (XOM, ENB, ESGV) ; ailleurs « données insuffisantes ».
- Univers limité aux 31 actifs du jeu de départ ; un titre hors univers est signalé « non couvert ».
- Valeurs par défaut des clauses et seuils de la politique : hypothèses lisibles, pas une norme réglementaire.
- Scénarios du banc d'essai étiquetés par l'auteur du moteur après sa conception : biais possible.
- Biais du survivant (univers choisi en 2026) ; données Yahoo non certifiées ; valeurs FRED révisées.
- Anglais : interface seulement ; les textes générés et les explications restent en français.
- Les explications ne sont pas un avis juridique ; la ligne directrice de l'OCRI citée dans le pitch est une piste.

## Licences

Code : à définir par l'équipe. Skills tiers dans `.claude/skills/` : Apache-2.0 (Anthropic) et MIT (GitHub, Vercel), licences jointes. Données : conditions de chaque source dans [docs/donnees.md](docs/donnees.md) ; les téléchargements bruts restent dans un cache local non versionné.
