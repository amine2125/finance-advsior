# AWS — architecture ULYSSE

> État : **conçue, non déployée**. Aucune ressource AWS n'existe à ce jour (2026-11-14). Le déploiement a lieu en phase 7, après obtention des accès.
> Description de l'infrastructure : **AWS SAM (YAML)**, fichier `infra/template.yaml` (créé en phase 7).
> Région visée : `ca-central-1` (voir « Région et modèle »).

## 1. Schéma

```mermaid
flowchart LR
  U[Navigateur] -->|HTTPS| CF[CloudFront]
  CF -->|/* (OAC)| S3UI[(S3 « interface »<br/>privé)]
  CF -->|/api/* (OAC, signé)| L[Lambda « ulysse »<br/>URL de fonction, Python]
  SCH[EventBridge Scheduler<br/>toutes les heures] -->|événement « vigie »| L
  L -->|planifier, rédiger| BR[Amazon Bedrock<br/>Claude]
  L <--> DDB[(DynamoDB<br/>profils, contrats,<br/>pré-calculs, journal)]
  L <--> S3D[(S3 « données »<br/>privé : datapack,<br/>preuves, traces)]
  BUD[AWS Budgets<br/>alarme de coût] -.courriel.-> Equipe
```

Version texte :

```
Navigateur ──HTTPS──> CloudFront ──/*──────(OAC)──> S3 interface (privé)
                                 └─/api/*──(OAC)──> Lambda « ulysse » (URL de fonction)
EventBridge Scheduler (horaire) ─────────────────> Lambda « ulysse » (événement Vigie)
Lambda « ulysse » ──> Bedrock (planifier, rédiger)
                  <─> DynamoDB (profils, contrats versionnés, pré-calculs, journal)
                  <─> S3 données (datapack, objets de preuve, traces)
AWS Budgets : alarme de coût par courriel
```

## 2. Rôle de chaque service et raison du choix

| Service | Rôle concret dans ULYSSE | Pourquoi lui | Sans lui |
|---|---|---|---|
| **Lambda** (une seule fonction Python, arm64, URL de fonction) | Tout le code : politique de signal, outils d'analyse, règles du contrat, gouvernance, vérificateur, orchestration du dossier, Vigie. Un seul point d'entrée qui aiguille selon la route HTTP ou l'événement planifié | Le même code tourne en local (serveur de développement) et sur AWS ; pas de serveur à gérer ; coût nul au repos | Il faudrait un serveur permanent |
| **URL de fonction Lambda** | Point d'accès HTTPS de l'API | Remplace API Gateway pour une seule fonction ; moins de configuration | — |
| **Amazon Bedrock** (Claude) | Deux usages seulement : **planifier** (choisir les modules d'analyse d'un dossier ; plan de surveillance de la Vigie, recalculé quand le contrat change) et **rédiger** (texte du dossier à partir des objets de preuve ; brouillon des clauses du contrat). Jamais de calcul, jamais de décision de niveau de signal | LLM géré, dans le compte AWS, facturé à l'usage | Mode gabarit sans LLM (prévu de toute façon comme repli) |
| **DynamoDB** (à la demande) | Profils, contrats versionnés, pré-calculs de la Vigie (paquets de signaux), journal des interventions, état d'avancement des dossiers | Lectures en quelques millisecondes : condition pour afficher un signal en < 300 ms | Les signaux devraient être recalculés à chaque clic |
| **S3 « données »** (privé) | Datapack (≈ 6 Mo), objets de preuve et traces complètes de chaque dossier (rejouables) | Stockage durable et bon marché des artefacts volumineux | Traces perdues ou entassées dans DynamoDB |
| **S3 « interface »** (privé) | Fichiers statiques de l'application React | Hébergement statique sans serveur | — |
| **CloudFront** | Sert l'interface depuis le bucket privé (Origin Access Control) et relaie `/api/*` vers l'URL de fonction | HTTPS, cache, un seul domaine (pas de CORS), buckets jamais publics | Bucket public ou autre hébergeur |
| **EventBridge Scheduler** | Un déclencheur **horaire** qui lance la Vigie (recalcul des indicateurs, détection d'engouement et de dérive, création des notifications) | Planification gérée, sans code d'ordonnancement | La Vigie ne tournerait qu'à la main |
| **AWS Budgets** | Une alarme de coût (seuil à fixer en phase 7) | Exigence de bonnes pratiques ; protège contre une facture imprévue | — |

**Retirés** (décision D-030) : API Gateway, Step Functions, Amplify, tableaux de bord et alarmes CloudWatch dédiés. Les journaux d'exécution standard de Lambda restent dans CloudWatch Logs (comportement par défaut de Lambda), avec une rétention courte (14 jours).

## 3. Flux principaux

**Signal (< 300 ms visé)** : l'écran appelle `GET /api/signals?profil=…&ecran=…` → la Lambda lit le paquet de signaux pré-calculé (DynamoDB) et le contrat, applique la politique déterministe → ✅ / ⚠ / ⛔ ou rien. Aucun appel LLM.

**Ordre simulé (vérification en direct)** : `POST /api/order/check` à chaque arrêt de saisie du montant → règles du contrat évaluées en code sur les pré-calculs. Aucun appel LLM.

**Dossier de décision** : `POST /api/dossiers` crée un dossier (identifiant, état « en cours » dans DynamoDB) et lance son orchestration **en code Python** : planificateur (LLM) → outils (code) → gouvernance (code) → explication (LLM) → vérificateur (code, 2 essais au maximum, puis gabarit). Chaque étape écrit sa trace ; l'interface interroge `GET /api/dossiers/{id}` toutes les ~400 ms et affiche les étapes au fur et à mesure (« Composition des FNB ✓, Volatilité ✓… »). Sur AWS, l'orchestration s'exécute dans une invocation asynchrone de la même fonction (la requête HTTP rend la main tout de suite) ; en local, dans un fil d'exécution. La trace complète est écrite dans S3 et consultable dans le Journal.

**Vigie** : déclenchée toutes les heures par EventBridge Scheduler, ou **à la demande** (`POST /api/vigie/run`, bouton du mode démo, ou commande `python -m ulysse.vigie --as-of 2021-12-15`), y compris **rejouée à une date passée**. Elle ne recalcule que ce qui a changé (nouvelle date de données, nouveau contrat).

## 4. Sécurité et bonnes pratiques

- Buckets privés, chiffrés (SSE-S3), blocage de l'accès public ; le bucket « interface » n'est lisible que par CloudFront (OAC).
- URL de fonction en authentification `AWS_IAM`, invocable seulement par CloudFront (OAC pour Lambda) ; les requêtes `POST` portent l'empreinte SHA-256 du corps (`x-amz-content-sha256`), calculée par l'interface. Repli documenté si ce montage bloque : authentification `NONE` + CORS limité au domaine CloudFront + concurrence réservée + plafond quotidien d'appels LLM.
- Rôle IAM de la Lambda limité au strict nécessaire : `bedrock:InvokeModel` sur le seul modèle (ou profil d'inférence) retenu, lecture/écriture sur la seule table DynamoDB et le seul bucket « données », `lambda:InvokeFunction` sur elle-même (dossiers asynchrones).
- Aucun secret dans le code ni dans le dépôt ; les accès de déploiement sont demandés en phase 7 et ne sont jamais écrits dans un fichier.
- Textes externes (pages, rapports) traités comme des données, jamais comme des instructions pour le LLM.
- Plafond de dépense LLM : compteur quotidien dans DynamoDB ; au-delà, l'app passe en mode gabarit (sans LLM) et le dit.

## 5. Région et modèle

- `ca-central-1` pour tous les services. La disponibilité des modèles Claude dans cette région (directe ou par profil d'inférence inter-régions) sera vérifiée en phase 7 ; si un profil inter-régions est nécessaire, l'endroit où les requêtes sont traitées sera indiqué ici. Les données envoyées au modèle sont fictives (profils) ou publiques (marchés).
- Modèle par défaut : Claude Opus 5.5 (D-003). Le choix d'un modèle moins cher (Sonnet ou Haiku) reste une décision de l'équipe, à prendre avec les mesures de coût de la phase 8.

## 6. Coût estimé (ordre de grandeur, à confirmer en phase 7)

Hypothèses : démonstration et développement, ~5 profils, Vigie horaire, ~3 000 appels d'API et ~300 dossiers par mois. Prix publics consultés en novembre 2026 pour les services AWS ; prix Bedrock **non vérifiés** à ce stade (estimation fondée sur le tarif de l'API Anthropic, Claude Opus 5.5 : 4 $ US par million de jetons en entrée, 20 $ US en sortie).

| Poste | Calcul | Mensuel (USD) |
|---|---|---|
| Lambda (arm64, 2 Go) | Vigie 720 × ~20 s + API ~3 000 × ~1 s ≈ 35 000 Go-s | < 1 $ (souvent dans l'offre gratuite) |
| DynamoDB à la demande | < 200 000 lectures/écritures | < 0,50 $ |
| S3 (2 buckets) | < 1 Go | < 0,10 $ |
| CloudFront | < 1 Go transféré | 0 $ (offre gratuite permanente) |
| EventBridge Scheduler | 720 déclenchements | 0 $ (offre gratuite) |
| CloudWatch Logs | < 0,1 Go | < 0,10 $ |
| AWS Budgets | 1 budget | 0 $ |
| **Bedrock** | par dossier : ~11 000 jetons en entrée, ~2 000 en sortie (planification + rédaction, sans nouvel essai) ≈ 0,08 $ ; ~0,13 $ avec un nouvel essai | **≈ 25–40 $ pour 300 dossiers** |

Le coût est dominé par le LLM ; il sera **mesuré** (jetons réels × prix Bedrock du jour) et affiché sur la page Fiabilité (coût par dossier).
