# Design — ULYSSE

> Phase 5. Plan rédigé selon le skill `frontend-design` (plan → revue contre le brief → construction → critique), règles de `web-design-guidelines` et palette des graphiques validée selon le skill `dataviz` (script `validate_palette.js`).

## 1. Brief, en une phrase

Une app de placement **simulée**, sobre et lisible, où un agent intégré **allume discrètement** l'élément sur lequel il a quelque chose de pertinent à dire, et répond toujours avec des faits vérifiables, jamais une recommandation.

Public : investisseurs particuliers canadiens, de 26 à 59 ans, du débutant à l'avancé. Tâche principale de chaque écran : comprendre en 5 secondes « où j'en suis par rapport à **mes** règles ».

## 2. Revue contre les défauts génériques (skill `frontend-design`)

| Défaut générique repéré | Décision ULYSSE |
|---|---|
| Fond crème + accent terracotta ; noir + vert acide | Papier froid `#F4F7F9`, encre marine `#13293D` : la carte marine, pas l'affiche |
| Kit de cartes SaaS identiques, ombres grises partout, dégradés | Bordures fines et **hiérarchie par le contenu** ; une seule élévation, réservée aux superpositions (panneau de signal, pause) ; rayons différents selon le rôle |
| Étiquettes en capitales au-dessus de chaque titre ; métadonnées « A · B · C » ; police à chasse fixe pour les petits chiffres | Casse de phrase partout ; métadonnées en phrases ; chiffres en `tabular-nums` seulement en colonnes |
| Animation d'entrée sur chaque section | **Un seul** mouvement : l'« allumage » du halo d'un signal (300 ms, une fois), désactivé avec `prefers-reduced-motion` |
| Chiffre héros + statistiques + dégradé | Accueil : une phrase et un chiffre, puis le statut des règles |

**Ce qui doit marquer** (l'audace, à un seul endroit) : le **halo de signal**. Comme le feu d'un phare, un anneau fin et doux s'allume autour de l'élément concerné, avec une pastille icône + mot. Tout le reste est calme et discipliné.

## 3. Jetons

### Couleurs (contrastes calculés sur blanc)

| Jeton | Hex | Usage | Contraste |
|---|---|---|---|
| `--encre` | `#13293D` | texte principal, boutons principaux | 14,9:1 |
| `--encre-2` | `#46596B` | texte secondaire | 7,2:1 |
| `--attenue` | `#5E6F7E` | légendes, axes, sources | 5,2:1 (4,8:1 sur papier) |
| `--mer` | `#0F5E8C` | liens, anneau de focus | 7,0:1 |
| `--papier` | `#F4F7F9` | fond de page | — |
| `--surface` | `#FFFFFF` | panneaux, graphiques | — |
| `--trait` | `#DCE3E9` | filets | décoratif |
| `--ok` / texte `#0B6B0B` / fond `#E8F6E8` | `#0CA30C` | ✅ cohérent avec tes règles | texte 6,0:1 |
| `--attention` / texte `#7A5200` / fond `#FFF4D1` | `#FAB219` | ⚠ à regarder | texte 6,3:1 |
| `--pause` / texte `#9E2323` / fond `#FCE9E9` | `#D03B3B` | ⛔ pause de réflexion | texte 6,6:1 |
| `--inconnu` / texte `#4A5866` / fond `#EEF2F5` | `#6B7C8C` | données insuffisantes | texte 6,5:1 |
| `--serie-1` | `#2A78D6` | série principale (cours, barres) | 4,5:1 |
| `--serie-2` | `#EB6834` | 2e série (comparateur) | 3,1:1 |
| `--serie-3` | `#1BAF7A` | 3e série | 2,8:1 → étiquettes visibles obligatoires |

Palette des séries validée par `validate_palette.js --mode light --surface #ffffff` : bande de luminosité, chroma, séparation daltonisme (ΔE 9,2), plancher de vision normale (ΔE 27,6) : **PASS**. Les couleurs d'état ne servent jamais de couleur de série et s'affichent toujours avec une icône et un mot.

### Typographie

- **Atkinson Hyperlegible Next** (Braille Institute, licence OFL), auto-hébergée (`@fontsource`). Choix motivé par le sujet : des chiffres impossibles à confondre (0/O, 1/l/I) pour des montants et des pourcentages, et une lisibilité pensée pour la basse vision (Robert, 59 ans ; débutants).
- Une seule famille ; hiérarchie par taille et graisse : 14 / 16 / 18 / 22 / 28 / 36 px ; interligne 1,5 (texte) et 1,2 (titres) ; lignes ≤ 75 caractères.
- `tabular-nums` pour les colonnes de chiffres et les axes ; chiffres proportionnels pour les grands montants isolés.

### Espacements, rayons, mouvement

- Grille de 4 px : 4, 8, 12, 16, 24, 32, 48.
- Rayons selon le rôle : 4 px (puces, barres de données), 8 px (champs, boutons), 12 px (panneaux superposés).
- Transitions 150–200 ms sur `opacity` et `transform` seulement ; jamais `transition: all`.

## 4. Composants

| Composant | Rôle | Règles |
|---|---|---|
| **Signal** | Halo + pastille sur n'importe quel élément ; un clic ouvre le panneau | Même geste partout. Halo de la couleur du niveau, pastille = icône + mot (✅ Cohérent, ⚠ À regarder, ⛔ Pause). `button` avec nom accessible complet |
| **Panneau de signal** | 2–3 faits, leur preuve, des options | Lien « Ouvrir le dossier » ; « Continuer quand même » et « Modifier ma règle » toujours présents |
| **Chiffre prouvé** | Tout chiffre issu d'une preuve est un bouton discret | Ouvre le panneau de preuve : source, date, période, devise, méthode, paramètres, version du code |
| **Étiquette de phrase** | MESURÉ / DOCUMENTÉ / HYPOTHÈSE / INCERTAIN | Forme + mot (●, ▤, ◌, ?), jamais la couleur seule |
| **Pause de réflexion** | Interruption ⛔ d'un ordre simulé | Pas de compte à rebours, pas de bouton caché ; choix de même poids visuel |
| **Dossier** | Données → Constats → Analyse → Options → Explication | Étapes affichées pendant le calcul (« Composition des FNB ✓ »), jamais le raisonnement du modèle |
| **Terme** | Mot souligné en pointillé, définition au survol ou au focus | Niveau selon l'expérience du profil |
| **Bandeau simulation** | « Simulation, pas un conseil financier » | Toujours visible ; rappelle la date simulée en mode machine à remonter le temps |

## 5. Maquettes des écrans clés

**Accueil (une action : ouvrir ce qui a changé)**

```
┌ ULYSSE ─────────────── [Profil : Robert ▾] [Date : 14 nov. 2026 ▾] [🔔 2] ┐
│ Simulation, pas un conseil financier. Données au 12 nov. 2026.           │
├────────┬─────────────────────────────────────────────────────────────────┤
│ Accueil│  Ton portefeuille vaut 846 120 $.                                │
│ Marché │  ⚠ À regarder : 2 de tes règles sont dépassées depuis la dérive  │
│ Portef.│  [Voir lesquelles]                                               │
│ Surveil│  Ce qui a changé depuis ta dernière visite                       │
│ Contrat│   • NVDA : attention inhabituelle (pages vues ×10,8) ◉           │
│ Journal│   • Climat de marché : calme                                     │
│ Fiabil.│                                                                  │
└────────┴─────────────────────────────────────────────────────────────────┘
```

**Fiche d'un titre (une action : préparer un ordre simulé)**

```
NVIDIA (NVDA) · 192,40 $ US · données au 12 nov. 2026        [Préparer un ordre]
┌ Pour toi ────────────────────────────────────────────── ⚠ À regarder ◉ ┐
│ Tu détiens déjà 0,5 % via SPY. Une position de 5 % approcherait ta       │
│ limite par entreprise (5 %). Risque : volatilité 48 % sur un an.         │
└──────────────────────────────────────────────────────────────────────────┘
[Graphique du cours, épisodes 2018 / 2020 / 2022 en bandes ; survol d'une
 baisse → « pour toi, cette baisse aurait représenté −X $ »]   Source : …
Volatilité · Pire baisse · Pertes extrêmes · Attention inhabituelle (chiffres prouvés)
```

**Ordre simulé (une action : vérifier, puis décider)**

```
Montant : [ 20 000 $ ]  ≈ 2,4 % du portefeuille
⚠ À regarder — vérification en direct (règles évaluées en 12 ms)
  • Ta limite par entreprise : 4,1 % après l'ordre, pour 5 %  (approchée)
[Ouvrir le dossier]  [Préparer l'ordre simulé]
```

**Pause de réflexion (⛔)**

```
┌──────────────────────── Pause de réflexion ────────────────────────┐
│ Cet ordre s'écarte nettement de 3 de tes règles :                   │
│  ⛔ Par entreprise : 17,9 % pour une limite de 5 %                   │
│  ⛔ Horizon 3 ans : pire période passée −37,3 % pour −15 % accepté   │
│  ⛔ Perte en crise : −24,6 % (≈ 222 300 $) pour −15 % accepté        │
│ Options : • une position d'au plus … $   • même montant via SPY     │
│ [Revenir]   [Modifier ma règle]   [Continuer quand même]           │
└─────────────────────────────────────────────────────────────────────┘
```

**Dossier de décision**

```
Données → Constats → Analyse → Options → Explication       Étapes : ✓✓✓✓✓
● MESURÉ   Sur la dernière année, la volatilité annualisée de TSLA est de 45,6 %.
▤ DOCUMENTÉ Données publiques : cours jusqu'au 2026-11-12 (Yahoo Finance)…
? INCERTAIN Composition non disponible à cette date pour : ESGV.
Quelles données ? · Pourquoi ce constat ? · Quelles limites ? · Qu'est-ce qui changerait la réponse ?
[Trace complète dans le Journal]
```

## 6. Graphiques (skill `dataviz`)

- Formes : cours = ligne (2 px) avec bandes d'épisodes ; expositions et contributions au risque = barres horizontales (≤ 24 px, bout arrondi 4 px côté valeur) ; rejeu = ligne indexée à 100 ; jamais deux axes verticaux.
- Survol par défaut (réticule + infobulle) ; chaque graphique a sa vue tableau et sa source sous le graphique.
- Texte en jetons de texte, jamais dans la couleur de la série ; une seule série → pas de légende, le titre la nomme.
