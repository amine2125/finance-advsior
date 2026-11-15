# Consignes du projet

## Règle n° 1 : toujours repartir des consignes du défi

Avant chaque réponse, chaque modification de code, chaque idée de fonctionnalité ou chaque arbitrage (« est-ce la bonne chose à faire ? »), relis la partie utile des documents du dossier `context/` et appuie ta réponse dessus :

| Document | Contenu |
|---|---|
| `context/Datathon2026/Datathon - Case Officiel 2026 FR.pdf` | **Énoncé officiel** (référence principale) : défi, personas, données, livrables, encadrement responsable, grille d'évaluation (annexe, p. 19) |
| `context/Datathon2026/Datathon - Case Officiel 2026 ENG.pdf` | Même énoncé en anglais |
| `context/Comprendre l'investisseur avant de bâtir la solution_V1.pptx` | Atelier Banque Nationale : objectif, horizon, risque, diversification, profil investisseur, de la donnée à la décision |
| `context/Datathon2026/Presentation_AlphaForge_AI_Participants*.pptx` | Présentation officielle aux participants |
| `context/Datathon2026/alphaforge_starter/` | Jeu de données de départ et son README |

`context/de-la-consigne-au-pipeline-en.html` porte sur un pipeline Copilot, pas sur le défi.

Concrètement :
- Cite la page ou la diapositive qui justifie un choix (ex. « énoncé p. 17 : pas de conseil personnalisé »).
- Si une demande contredit les consignes, dis-le avant d'agir et propose une alternative conforme.
- Pour une nouvelle fonctionnalité, indique quel critère de la grille elle sert et son poids.

## Rappel des points non négociables (énoncé)

- Simulation seulement : aucune transaction réelle, **jamais présenté comme un conseil financier personnalisé** (p. 17). Pas de « je vous conseille », « achetez », « vendez ».
- Distinguer faits, hypothèses et scénarios fictifs ; présenter les incertitudes ; explications synthétiques, vérifiables, fidèles aux sources, sans justification inventée (p. 17).
- Cohérence temporelle : aucune information postérieure à la date simulée (p. 14).
- Chaque source documentée : origine, date, traitement, limites, licence (p. 10, 13, 14).
- Pas de prédiction de rendement à partir du passé (p. 18).
- Les personas (Amira, Mateo, Robert) sont des situations de référence, pas des cas codés en dur dans le moteur (p. 4).

## Grille d'évaluation (p. 19)

Qualité, pertinence et innovation 20 % · Intelligence agentique et explicabilité 20 % · Analyse et traitement des données 20 % · UX/UI 10 % · Intégration AWS 15 % · Présentation, valeur business et marketing 15 %.

## Lecture des fichiers

Les PDF se lisent avec l'outil Read (`pdftotext` n'est pas installé). Les `.pptx` se lisent en extrayant les balises `<a:t>` de `ppt/slides/slideN.xml` avec Python (`zipfile`).
