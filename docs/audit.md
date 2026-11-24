# Audit final : critère → où c'est démontré → preuve

> Phase 11 (version provisoire du 2026-11-14, **avant le déploiement AWS**). Statuts : ✅ couvert et vérifié ; ◐ couvert partiellement (limite déclarée) ; ⏳ en attente des accès AWS (phase 7).

## Grille d'évaluation (PDF p. 19, présentation diapo 10)

| Critère (poids) | Où dans l'app | Preuve | Statut |
|---|---|---|---|
| Solution : pertinence, innovation, créativité, prototype (20 %) | Question utile (« cohérent avec **mes** règles ? ») ; Contrat / Mât / Vigie ; geste du signal ; machine à remonter le temps | 6 scénarios de démo joués de bout en bout en navigateur (`docs/ux/validation.md` §4) | ✅ |
| Agentique et explicabilité (20 %) | Planificateur (LLM) + outils (code) + gouvernance + rédaction (LLM) + vérificateur ; dossier D→C→A→O→E ; chiffres cliquables ; trace dans le Journal | `docs/technique.md` §2 et §5 (exemple réel) ; tests de l'orchestrateur ; démo 6 | ✅ (LLM réel : ⏳) |
| Données : rigueur, validation, visualisation (20 %) | Catalogue des sources, vue « as-of », correction CNQ, prolongation contrôlée, graphiques avec source et vue tableau | `docs/donnees.md` ; 15 tests de données ; banc d'essai (1 984/1 984 sans information future) ; palette validée | ✅ |
| UX/UI (10 %) | 13 écrans, mobile et ordinateur, fr-CA, adaptation au profil | axe 0 violation ; Lighthouse 97–100 ; heuristiques de Nielsen ; captures avant/après | ✅ |
| Intégration AWS (15 %) | SAM : Lambda + URL de fonction, CloudFront + OAC, DynamoDB, 2 buckets S3, EventBridge Scheduler, Bedrock, budget | `infra/template.yaml` (cfn-lint : 0 erreur) ; paquet de 210 Mo ; `docs/aws.md` | ⏳ **condition d'admissibilité : déploiement à faire** |
| Présentation, valeur, marketing (15 %) | Pitch avec chiffres vérifiés ; one-pager et vidéo produits à part | `docs/pitch.md` | ◐ one-pager et vidéo hors dépôt |

## Contraintes du PDF (`docs/00-cadrage.md`)

| Contraintes | Où | Preuve | Statut |
|---|---|---|---|
| C01–C06 agentique, auto-explicatif, données publiques, sélectionner et relier | Orchestrateur, outils, dossier | Trace d'un dossier ; registre de 15 outils | ✅ |
| C07, C48 pas de « meilleur rendement », aucune prédiction | Aucun outil de prédiction (test `test_tool_registry_validates_calls`) ; bootstrap montré comme « pas une prévision » ; contre-exemple honnête | Tests ; script vidéo | ✅ |
| C08–C11 trois personas, chaque test | Profils pré-remplis ; Robert ⛔ ; Amira proportionnée ; Mateo ESG | Banc d'essai 22/22 | ✅ |
| C12–C18 question, rôles, contexte, sensibilité, explication, simplicité, deux situations | Curseurs de sensibilité (taille, horizon) ; Robert et Amira contrastés | Dossier ; vidéo | ✅ |
| C19–C20 agent d'explicabilité, gouvernance, contrôles visibles | Section « Contrôles visibles » du dossier ; informations manquantes ; conflits | Capture `11-dossier-bureau.png` | ✅ |
| C21–C27 données documentées (source, date, traitements, conditions) | `docs/donnees.md` | Licences vérifiées (Banque du Canada, Wikimedia CC0) | ✅ |
| C28–C32 période, traçabilité, cohérence temporelle, comparabilité, licences | Vue « as-of », délais de publication, CAD, dividendes, survivant déclaré | Tests `test_asof_never_exposes_future`, `test_cpi_publication_lag` | ✅ |
| C33 aucune donnée client réelle | Profils fictifs, mention permanente | `docs/hypotheses.md` | ✅ |
| C34 mise en situation « prudent, achat prochain » | Profil créé en direct (démo 4) | Banc d'essai ; parcours | ✅ |
| C35–C36 prototype + dépôt + README | `README.md`, `make` | 71 tests | ✅ |
| C37 vidéo ~5 min | mode démo ; vidéo produite à part | — | ◐ hors dépôt |
| C38 documentation technique | `docs/technique.md` | — | ✅ |
| C40 one-pager (1 page) | produit à part | — | ◐ hors dépôt |
| C44–C46 simulation, pas de conseil, faits/hypothèses/incertitudes, pas de raisonnement interne affiché | Bandeau permanent ; étiquettes ; vérificateur (V4) ; aucun texte de raisonnement du modèle | Test `test_no_forbidden_wording_in_templates` ; vérificateur | ✅ |
| P1 AWS réel et démontrable | — | — | ⏳ |
| P2 « pourquoi cet agent existe » | `docs/technique.md` §2 | — | ✅ |

## Exigences du prompt (rappel des principales)

| Exigence | Statut | Commentaire |
|---|---|---|
| Rien n'est codé en dur pour les personas | ✅ | test `test_engine_has_no_persona_names` |
| Signaux en moins de 300 ms | ✅ local (p95 13 ms) ; ⏳ AWS | à remesurer derrière CloudFront |
| Chaque chiffre a une preuve | ✅ | 16/16 dossiers ; tiroir de preuve |
| ≥ 5 skills UX/UI vérifiés | ✅ | `docs/skills.md` |
| Mode local sans AWS | ✅ | `make test`, `make api` |
| Vigie horaire, à la demande, rejouable | ✅ local ; ⏳ planification AWS | `python -m ulysse.vigie --as-of …` |
| Taux d'échec du vérificateur, coût par dossier | ⏳ | nécessitent Bedrock |
| Anglais en option | ◐ | interface seulement |

**Trous restants** : déploiement AWS et mesures Bedrock (en attente des accès)  ; one-pager et vidéo produits hors dépôt ; audits axe et Lighthouse à refaire sur la nouvelle interface ; compositions QQQ/ESGV (limite déclarée).
