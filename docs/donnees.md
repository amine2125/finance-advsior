# Catalogue des données

> Règle : chaque donnée affichée par ULYSSE remonte à une ligne de ce catalogue. Ce qui n'y figure pas n'est pas utilisé.
> Reconstruction complète : `make data` (télécharge ce qui manque dans `data/cache/`, puis construit `data/build/datapack/`).
> Chaque téléchargement est consigné dans `data/cache/manifest.jsonl` (URL, date et heure, empreinte SHA-256, taille).

## Vue d'ensemble

| # | Source | Contenu utilisé | Période | Fréquence | Extraction |
|---|---|---|---|---|---|
| S1 | Kit AlphaForge (organisateurs) | 31 actifs, prix quotidiens, opérations sur titres, USD/CAD, 9 séries macro | 2021-11-12 → 2026-11-12 | quotidienne / mensuelle | fournie (extraction du 2026-11-13) |
| S2 | Yahoo Finance via `yfinance` 1.8.0 | Prolongation des prix et opérations sur titres des 31 actifs | 2016-01-01 → 2022-03-31 (chevauchement de contrôle inclus) | séances de chaque marché ; crypto 7 j/7 | 2026-11-14 |
| S3 | Banque du Canada, API Valet | FXUSDCAD 2017-01-03 → 2021-11-11 ; taux de midi IEXE0101 pour 2016 ; taux directeur, rendements 2 et 10 ans, IPC Canada avant le kit | 2016-01-01 → 2022-03-31 | jours ouvrables / mensuelle | 2026-11-14 |
| S4 | FRED (Federal Reserve Bank of St. Louis) | DFF, DGS2, DGS10, CPIAUCSL, UNRATE avant le kit | 2016-01-01 → 2022-03-31 | quotidienne / mensuelle | 2026-11-14 |
| S5 | Wikimedia REST API (pages vues) | Pages vues quotidiennes de 22 articles en.wikipedia (agent « user ») | 2016-01-01 → 2026-11-12 | quotidienne | 2026-11-14 |
| S6 | Journal des renommages MediaWiki | Anciens titres d'articles (Tesla Motors, Amazon.com, Manulife Financial) | — | événementielle | 2026-11-14 |
| S7 | State Street (SSGA), téléchargements publics | Composition de SPY ; appartenance aux 11 FNB Select Sector SPDR → secteur GICS de chaque membre du S&P 500 | au 2026-11-12 | instantané | 2026-11-14 |
| S8 | iShares Canada (BlackRock), téléchargements publics | XIU : 125 instantanés de fin de mois 2016-01 → 2026-10 + 2026-11-12 ; XBB : 2026-11-12 | 2016-01-29 → 2026-11-12 | mensuelle | 2026-11-14 |
| S9 | Communiqué de CNQ du 2022-08-04 (copie SEC EDGAR) | Preuve du dividende spécial de 1,50 $ CA (ex-date 2022-08-22) | — | — | 2026-11-14 |

À venir (phase 3, gouvernance ESG) : méthodologies publiques d'indices ESG et appartenance à leurs FNB. Voir « Données non disponibles » plus bas.

## S1 — Kit de départ AlphaForge

- **Origine** : organisateurs du datathon (`context/Datathon2026/alphaforge_starter/`), construit par `build_dataset.py` à partir de Yahoo Finance, de la Banque du Canada et de FRED. Détail par fichier dans `sources_metadata.csv`.
- **Traitements ULYSSE** :
  - Contrôles à la lecture (`ulysse/data/kit.py`) : colonnes, 31 tickers uniques, devise de chaque ligne = devise de l'univers, `adj_close` > 0, aucun doublon, USD/CAD dans [1 ; 2].
  - Rendements calculés **uniquement** sur `adj_close` ; fractionnements jamais réappliqués.
  - **Correction CNQ.TO** : Yahoo a enregistré le dividende spécial de 1,50 $ CA de 2022 (0,75 $ après le fractionnement 2:1 de 2024) **à la fois** comme dividende et comme « fractionnement » de 1,021. Effets constatés : `close` antérieur au 2022-08-22 divisé à tort par 1,021 ; rendement total du 2022-08-22 gonflé à +2,78 % (dividende compté deux fois). Correction : prix antérieurs multipliés par 1,021, facteur de dividende recalculé sur le vrai prix de la veille (36,195 $, soit 72,39 $ avant fractionnement). Rendement corrigé du jour : +0,62 %, selon la convention de Yahoo (facteur 1 − D/P₋₁). Preuve : communiqué de CNQ (S9). Test : `test_cnq_fake_split_removed_and_special_dividend_counted_once`.
- **Limites** : données Yahoo non certifiées par les bourses ; `adj_close` recalculé à chaque extraction ; biais du survivant (univers choisi en 2026) ; ZST.TO a une séance à volume nul (2022-07-06), conservée.
- **Conditions** : « Free to use within the datathon » (organisateurs) ; conditions des sources d'origine (Yahoo, Banque du Canada, FRED).

## S2 — Prolongation historique (Yahoo Finance)

- **Pourquoi** : sans elle, une simulation datée de décembre 2021 n'a qu'environ 25 séances d'historique (écart E1 du cadrage). Elle sert à l'historique de la machine à remonter le temps, à l'entraînement des modèles (engouement, régimes) et aux scénarios historiques (2018, 2020).
- **Comment** : même bibliothèque et mêmes paramètres que le kit (`auto_adjust=False`, `actions=True`), 2016-01-01 → 2022-03-31 (`ulysse/data/sources/yahoo_ext.py`).
- **Jonction** : rendements chaînés au 2021-11-12 (le niveau de la prolongation est remis à l'échelle de celui du kit ce jour-là). Contrôle sur le chevauchement 2021-11-12 → 2022-03-31 : écart maximal de rendement quotidien de 1,3 × 10⁻⁶ sur les 31 actifs (arrondi), calendriers identiques. ENB.TO présente un écart de **niveau** constant de 1,43 % (rajustement de dividende entre deux extractions) sans effet sur les rendements. Test : `test_splice_overlap_returns_match`.
- **Débuts d'historique** : ESGV 2018-09-20 (lancement du fonds), ETH-USD 2017-11-09 (premier jour chez Yahoo). Avant ces dates : « données insuffisantes ».
- **Limites** : celles du kit ; en plus, le biais du survivant pèse davantage sur un historique plus long.
- **Conditions** : conditions d'utilisation de Yahoo (https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html). Fichiers bruts gardés dans le cache local non versionné, non redistribués.

## S3 — Banque du Canada (API Valet)

- **Séries** : FXUSDCAD (« Daily average exchange rate », publié vers 16 h 30 HE) dès 2017-01-03 ; **IEXE0101** (ancien taux de midi) pour 2016, car FXUSDCAD n'existe pas avant 2017 ; V39079, BD.CDN.2YR.DQ.YLD, BD.CDN.10YR.DQ.YLD, STATIC_TOTALCPICHANGE avant le kit.
- **Traitements** : les titres en USD sont convertis en CAD avec le taux du jour ; les jours sans publication (jours fériés canadiens), le dernier taux publié est reporté (consigne du kit). Masque `fx_published` conservé.
- **Limites** : changement de méthode entre le taux de midi (2016) et le taux moyen quotidien (2017+) ; écart observé sur les jours communs de janvier 2017 : environ 0,1 %. Les taux de la Banque sont publiés « à des fins statistiques et analytiques », pas comme taux de transaction.
- **Conditions** (https://www.bankofcanada.ca/terms/, lues le 2026-11-14) : utilisation, copie et diffusion libres à condition d'attribuer la source à la Banque du Canada et d'indiquer les modifications ; exactitude non garantie.

## S4 — FRED

- **Séries** : DFF, DGS2, DGS10, CPIAUCSL, UNRATE (mêmes identifiants que le kit).
- **Limites** : valeurs du **dernier millésime** (révisées), pas celles publiées à l'époque ; les séries mensuelles sont datées au mois de référence.
- **Conditions** : https://fred.stlouisfed.org/legal/ ; séries d'origine produites par des organismes publics américains (Federal Reserve Board, BLS).

### Délais de publication appliqués (hypothèses prudentes)

| Série | Datée | Utilisable à partir de | Réalité approximative |
|---|---|---|---|
| Taux quotidiens (V39079, rendements 2/10 ans, DFF, DGS2, DGS10) | jour D | jour ouvrable suivant | publiés en fin de journée D |
| IPC Canada (STATIC_TOTALCPICHANGE) | mois M | 25 du mois M+1 | Statistique Canada, 3e semaine de M+1 |
| IPC États-Unis (CPIAUCSL) | mois M | 20 du mois M+1 | BLS, vers le 10–15 de M+1 |
| Chômage États-Unis (UNRATE) | mois M | 12 du mois M+1 | BLS, 1er ou 2e vendredi de M+1 |

Ces délais sont volontairement plus longs que la réalité : une simulation peut ignorer une donnée déjà publiée, jamais utiliser une donnée future. Test : `test_cpi_publication_lag`.

## S5 — Pages vues Wikipedia (attention du public)

- **Pourquoi** : mesure publique et datée de l'attention, pour le détecteur d'engouement (« tout le monde en parle »).
- **Source** : `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{article}/daily/...`, agent « user » (exclut les robots identifiés). Correspondance actif → article : `data/manual/wikipedia_articles.csv` (22 actifs ; les FNB n'ont pas d'article pertinent et n'en ont pas).
- **Traitements** : pour un article renommé, somme du titre actuel et des anciens titres trouvés dans le journal des renommages (S6) : Tesla Motors → Tesla Inc. (2017-02-01) → Tesla, Inc. ; Amazon.com → Amazon (company) (2017-09-26) ; Manulife Financial → Manulife (2016-06-22). Contrôle : aucune rupture de niveau trimestrielle supérieure à ×4 après correction.
- **Cohérence temporelle** : les vues du jour D ne sont utilisées qu'à partir de D+1.
- **Limites** : attention des lecteurs de Wikipedia en anglais seulement ; Constellation Software n'a pas d'article avant 2017-11-30 (pas de mesure d'attention avant) ; une hausse d'attention n'indique ni sa cause ni son sens.
- **Conditions** : « All Analytics datasets are available under the Creative Commons CC0 dedication » (https://dumps.wikimedia.org/other/pageviews/readme.html, lu le 2026-11-14). Appels limités à 1 par seconde avec un agent identifiable.

## S7 — State Street (SSGA)

- **Contenu** : composition quotidienne de SPY (504 lignes d'actions au 2026-11-12, cash exclu) ; composition des 11 FNB Select Sector SPDR (XLK, XLC, XLY, XLP, XLE, XLF, XLV, XLI, XLB, XLRE, XLU). L'appartenance à l'un de ces fonds donne le secteur GICS de chaque membre du S&P 500 (515 titres classés ; 99,87 % du poids de SPY couvert, le reste étant de la trésorerie).
- **Pourquoi** : la colonne « Sector » du fichier SPY est vide ; les fonds sectoriels du même émetteur, à la même date, donnent la classification.
- **Limites** : instantané **actuel** uniquement (SSGA ne publie pas d'historique téléchargeable) → en mode machine à remonter le temps, la composition de SPY est déclarée « non disponible à cette date ». Classification sectorielle de 2026 appliquée aux analyses actuelles seulement.
- **Conditions** : conditions d'utilisation du site de l'émetteur ; fichiers téléchargés une fois (1 requête par seconde), gardés dans le cache local non versionné, non redistribués.

## S8 — iShares Canada (BlackRock)

- **Contenu** : XIU, avec secteur GICS par titre, 125 instantanés de fin de mois (2016-01-29 → 2026-10-30) et l'instantané du 2026-11-12 ; XBB au 2026-11-12, agrégé par segment d'émetteur (fédéral 43 %, provincial 30 %, sociétés).
- **Traitements** : tickers convertis au format de l'univers (`RY` → `RY.TO`) ; libellés de secteur harmonisés (« Communication » → « Communication Services ») ; alias documentés : `ATD-B.TO` → ATD.TO (ancienne catégorie B de Couche-Tard), `2299955D.TO` → CSU.TO (code temporaire), et pour SPY `GOOG` → GOOGL (même émetteur, autre catégorie d'actions).
- **Cohérence temporelle** : un instantané daté D n'est utilisable qu'à partir du jour ouvrable suivant.
- **Conditions** : conditions d'utilisation de blackrock.com/ca ; même politique de cache que S7.

## S9 — Preuve de la correction CNQ

- Communiqué « Canadian Natural Resources Limited Announces Special Dividend », 2022-08-04 : dividende spécial de 1,50 $ CA par action, payable le 2022-08-31 aux actionnaires inscrits le 2022-08-23 (donc ex-date 2022-08-22 en règlement T+2). Copie officielle : SEC EDGAR, numéro d'accès 0001017413-22-000049 (https://www.sec.gov/Archives/edgar/data/1017413/000101741322000049/a08042022specialdividend.htm) ; aussi sur cnrl.com.

## Données non disponibles (déclarées, pas contournées)

| Besoin | État | Conséquence dans l'app |
|---|---|---|
| Composition de QQQ (Invesco) et d'ESGV (Vanguard) | Les sites des émetteurs n'offrent pas de téléchargement automatisable ; les archives SEC (N-PORT) exigent un agent déclarant une adresse de contact | En attente d'une décision (adresse de contact). Sinon : ces FNB sont traités comme des blocs opaques, avec la mention « composition non disponible » |
| Composition historique de SPY | Non publiée par SSGA | « Composition non disponible à cette date » dans la machine à remonter le temps |
| Cotes ESG | Propriétaires, non licenciées | Jamais utilisées ; preuves ESG documentaires seulement (phase 3) |
| Nouvelles datées | Aucune source retenue à ce stade | L'écran Tendances repose sur des signaux mesurés (volume, rendement, attention) |
