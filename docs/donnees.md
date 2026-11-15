# Catalogue des données

> Chaque donnée affichée par AEGIS remonte à une ligne de ce catalogue (énoncé p. 10, 13 et 14 : origine, date, traitement,
> limites, conditions d'utilisation). Ce qui n'y figure pas n'est pas utilisé.
>
> Reconstruction : `make data` (jeu officiel seul) ou `make data-refresh` (jeu officiel prolongé jusqu'à la veille, voir S10).
> Chaque téléchargement du moteur ULYSSE est consigné dans `data/cache/manifest.jsonl` (URL, date et heure, empreinte SHA-256, taille).

## Vue d'ensemble

| # | Source | Contenu utilisé | Période | Utilisé par |
|---|---|---|---|---|
| S1 | Kit AlphaForge (organisateurs) | 31 actifs, prix quotidiens, opérations sur titres, USD/CAD, 9 séries macro | 2021-11-12 → 2026-11-12 | tout le moteur |
| S2 | Yahoo Finance via `yfinance` 1.8.0 | Prolongation **vers le passé** des prix et opérations sur titres | 2016-01-01 → 2022-03-31 | signaux ULYSSE (historique d'entraînement) |
| S3 | Banque du Canada, API Valet | USD/CAD et taux canadiens avant le kit | 2016-01-01 → 2022-03-31 | signaux ULYSSE |
| S4 | FRED (Federal Reserve Bank of St. Louis) | Taux et IPC américains avant le kit | 2016-01-01 → 2022-03-31 | signaux ULYSSE |
| S5 | Wikimedia REST API | Pages vues quotidiennes de 22 articles en.wikipedia | 2016-01-01 → fin du kit utilisé | attention inhabituelle |
| S6 | Journal des renommages MediaWiki | Anciens titres d'articles | — | attention inhabituelle |
| S7 | State Street (SSGA) | Composition de SPY ; secteurs GICS par les 11 FNB Select Sector SPDR | instantané | expositions des FNB |
| S8 | iShares Canada (BlackRock) | Compositions de XIU (mensuelles) et XBB | 2016-01 → 2026-11 | expositions des FNB |
| S9 | Communiqué de CNQ (copie SEC EDGAR) | Preuve d'une correction du kit | — | correction CNQ.TO |
| S10 | Kit officiel prolongé **vers l'avant** (script du kit) | Prix, change et macro après le 2026-11-12 | 2026-11-13 → veille du déploiement | tout le moteur, si `make data-refresh` |
| S11 | Sources en direct de l'agent Recherche | Dépôts SEC EDGAR, nouvelles GDELT, marché crypto CoinGecko | lues aux 15 minutes (cache partagé) et au moment de la demande si la copie a vieilli | agent Recherche |
| S12 | Prospectus abrégé d'ESGV (SEC, formulaire 497K) | Règle d'exclusion de l'indice ESG | prospectus de 2021 | filtre ESG (préférence de Mateo) |

## S1 — Kit de départ AlphaForge

- **Origine** : organisateurs du datathon (`context/Datathon2026/alphaforge_starter/`), construit par `build_dataset.py` à partir
  de Yahoo Finance, de la Banque du Canada et de FRED. Détail par fichier dans `sources_metadata.csv`, extraction du 2026-11-13.
- **Import** (`scripts/import_datathon_zip.py`) : colonnes normalisées, valeurs jamais inventées ; toute colonne introuvable arrête
  l'import. Le fichier `DATASET_ORIGIN.json` indique l'origine dans l'application (page « À propos »).
- **Traitements** :
  - rendements calculés **uniquement** sur `adj_close` ; fractionnements jamais réappliqués ;
  - conversion en $ CA avec le taux FXUSDCAD de la Banque du Canada, dernier taux publié reporté les jours fériés ;
  - **correction CNQ.TO** (moteur ULYSSE) : Yahoo a enregistré le dividende spécial de 1,50 $ CA de 2022 à la fois comme dividende
    et comme « fractionnement » de 1,021. Les prix antérieurs au 2022-08-22 sont multipliés par 1,021 et le facteur de dividende est
    recalculé une seule fois. Preuve : S9. Test : `test_cnq_fake_split_removed_and_special_dividend_counted_once`.
- **Limites** : données Yahoo non certifiées par les bourses ; `adj_close` recalculé à chaque extraction ; biais du survivant
  (univers choisi en 2026) ; aucune donnée ESG, fondamentale ni nouvelle dans le kit (énoncé p. 12).
- **Conditions** : « Free to use within the datathon » (organisateurs) ; conditions des sources d'origine (Yahoo, Banque du Canada, FRED).

## S2 — Prolongation vers le passé (Yahoo Finance)

- **Pourquoi** : les modèles d'attention inhabituelle et de climat de marché ont besoin d'un historique plus long que cinq ans.
- **Comment** : même bibliothèque et mêmes paramètres que le kit (`auto_adjust=False`, `actions=True`), 2016-01-01 → 2022-03-31
  (`backend/ulysse/data/sources/yahoo_ext.py`).
- **Jonction** : rendements chaînés au 2021-11-12. Contrôle sur le chevauchement 2021-11-12 → 2022-03-31 : écart maximal de
  rendement quotidien de 1,3 × 10⁻⁶ sur les 31 actifs. Test : `test_splice_overlap_returns_match`.
- **Débuts d'historique** : ESGV 2018-09-20 (lancement du fonds), ETH-USD 2017-11-09.
- **Conditions** : https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html. Fichiers bruts dans le cache local non versionné, non redistribués.

## S3 — Banque du Canada (API Valet)

- **Séries** : FXUSDCAD dès 2017-01-03 ; IEXE0101 (ancien taux de midi) pour 2016 ; V39079, BD.CDN.2YR.DQ.YLD, BD.CDN.10YR.DQ.YLD,
  STATIC_TOTALCPICHANGE avant le kit.
- **Limites** : changement de méthode entre le taux de midi (2016) et le taux moyen quotidien (2017+), écart d'environ 0,1 % sur les
  jours communs ; taux publiés « à des fins statistiques et analytiques ».
- **Conditions** (https://www.bankofcanada.ca/terms/) : utilisation et diffusion libres avec attribution et mention des modifications.

## S4 — FRED

- **Séries** : DFF, DGS2, DGS10, CPIAUCSL, UNRATE (mêmes identifiants que le kit).
- **Limites** : valeurs du dernier millésime (révisées), pas celles publiées à l'époque ; séries mensuelles datées au mois de référence.
- **Conditions** : https://fred.stlouisfed.org/legal/.

### Délais de publication appliqués (hypothèses prudentes)

| Série | Datée | Utilisable à partir de |
|---|---|---|
| Taux quotidiens (V39079, rendements 2/10 ans, DFF, DGS2, DGS10) | jour D | jour ouvrable suivant |
| IPC Canada (STATIC_TOTALCPICHANGE) | mois M | 25 du mois M+1 |
| IPC États-Unis (CPIAUCSL) | mois M | 20 du mois M+1 |
| Chômage États-Unis (UNRATE) | mois M | 12 du mois M+1 |

Ces délais sont volontairement plus longs que la réalité : une simulation peut ignorer une donnée déjà publiée, jamais utiliser
une donnée future (énoncé p. 14). Test : `test_cpi_publication_lag`.

## S5 et S6 — Pages vues Wikipédia (attention du public)

- **Pourquoi** : mesure publique et datée de l'attention, pour le signal d'attention inhabituelle (persona Robert, énoncé p. 7).
- **Source** : `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{article}/daily/...`,
  agent « user ». Correspondance actif → article : `data/manual/wikipedia_articles.csv` (22 actifs ; pas d'article pour les FNB).
- **Traitements** : somme du titre actuel et des anciens titres trouvés dans le journal des renommages (S6) : Tesla Motors,
  Amazon.com, Manulife Financial.
- **Cohérence temporelle** : les vues du jour D ne sont utilisées qu'à partir de D+1.
- **Limites** : lecteurs de Wikipédia en anglais seulement ; une hausse d'attention n'indique ni sa cause ni son sens.
- **Conditions** : CC0 (https://dumps.wikimedia.org/other/pageviews/readme.html) ; au plus 1 appel par seconde avec un agent identifiable.

## S7 et S8 — Compositions de FNB (SSGA, iShares Canada)

- **Contenu** : composition de SPY et appartenance aux 11 FNB Select Sector SPDR (secteur GICS de chaque membre du S&P 500) ;
  XIU (125 instantanés de fin de mois et le dernier jour) et XBB (agrégé par segment d'émetteur).
- **Traitements** : tickers convertis au format de l'univers (`RY` → `RY.TO`) ; alias documentés (`ATD-B.TO` → ATD.TO,
  `2299955D.TO` → CSU.TO, `GOOG` → GOOGL).
- **Cohérence temporelle** : un instantané daté D n'est utilisable qu'à partir du jour ouvrable suivant.
- **Limites** : SSGA ne publie pas d'historique téléchargeable ; QQQ (Invesco) et ESGV (Vanguard) n'offrent pas de téléchargement
  automatisable. QQQ est donc compté en entier dans la technologie (méthodologie `thematic_etfs`), annoncé « jusqu'à ».
- **Conditions** : conditions des sites des émetteurs ; fichiers gardés dans le cache local, non redistribués.

## S9 — Preuve de la correction CNQ

Communiqué « Canadian Natural Resources Limited Announces Special Dividend » du 2022-08-04 : 1,50 $ CA par action, ex-date
2022-08-22. Copie SEC EDGAR, numéro d'accès 0001017413-22-000049
(https://www.sec.gov/Archives/edgar/data/1017413/000101741322000049/a08042022specialdividend.htm).

## S10 — Kit officiel prolongé vers l'avant

- **Pourquoi** : le kit s'arrête le 2026-11-12, alors que l'agent Recherche lit les nouvelles au moment de la demande. Sans
  prolongation, une analyse mélangerait des prix d'une date et des nouvelles d'une autre (énoncé p. 14).
- **Comment** (`scripts/extend_kit.py`, appelé par `make data-refresh` et par `make deploy`) :
  1. le script officiel `build_dataset.py` est importé tel quel ; seuls `START` et `END` changent. Mêmes sources, mêmes colonnes,
     mêmes traitements que les organisateurs ;
  2. les prix sont téléchargés à partir de 30 jours avant la fin officielle ; sur les jours communs, les cours de clôture doivent
     être identiques à ceux du kit (tolérance 0,5 %), sinon le script s'arrête ;
  3. seules les lignes de prix postérieures au 2026-11-12 sont ajoutées ; aucune ligne officielle n'est modifiée ;
  4. `adj_close` des jours ajoutés est chaîné par les rendements au dernier `adj_close` officiel (Yahoo réajuste tout l'historique
     après chaque dividende, son échelle diffère donc de celle du kit) ;
  5. change et macro : seules les observations absentes des fichiers officiels sont ajoutées. Certaines sont datées du
     2026-11-12 ou avant, car FRED les a publiées après l'extraction du kit ; leurs délais de publication (S4) s'appliquent ;
  6. les contrôles de qualité du kit (`check()`) sont relancés sur l'ensemble.
- **Traçabilité** : `EXTENSION.json` (fenêtre officielle, date de fin, date d'extraction, lignes ajoutées, écart par titre sur le
  chevauchement), lignes « Extension by the team » dans `sources_metadata.csv` (origine `team_extension`), avertissements à la
  suite de ceux du kit. La page « À propos » affiche : « Officiel jusqu'au 12/11/2026, puis prolongé par l'équipe ».
- **Exemple mesuré** (extraction du 2026-11-15) : 33 lignes de prix ajoutées (29 titres le 13 novembre, 2 cryptoactifs les 13 et
  14), 1 dividende (ENB.TO, ex-date 13 novembre), 1 taux de change, 3 observations macro ; écart maximal sur le chevauchement
  0,000 % ; aucun avertissement.
- **Limites** : jours non vérifiés par les organisateurs ; `adj_close` officiel non réajusté pour les dividendes versés après la
  fin officielle ; une démonstration rejouée un autre jour donne d'autres chiffres (`make data` revient au jeu officiel seul).
- **Conditions** : celles de S1 (Yahoo, Banque du Canada, FRED).

## S11 — Sources en direct de l'agent Recherche

Utilisées seulement quand une demande vise un titre précis (« Je veux 2 000 $ de NVIDIA »). Chaque appel est journalisé
(outil, fournisseur, durée, statut) et une source en panne est signalée, jamais remplacée par une valeur inventée.

| Source | Adresse | Contenu | Conditions |
|---|---|---|---|
| SEC EDGAR | `data.sec.gov/submissions`, `data.sec.gov/api/xbrl/companyfacts` | dépôts des 120 derniers jours ; états financiers annuels lus « à date » (dernière valeur déposée avant la date) | politique d'accès équitable de la SEC : agent déclaré, débit limité |
| GDELT 2.0 DOC API | `api.gdeltproject.org/api/v2/doc/doc` | articles des 14 derniers jours et volume sur 90 jours ; reprises dédupliquées | conditions GDELT (attribution de la source) |
| CoinGecko | `api.coingecko.com/api/v3` | instantané et tendances, pour les cryptoactifs seulement | API publique gratuite ; conditions et attribution de CoinGecko |
| Banque du Canada | `bankofcanada.ca/valet/observations/FXUSDCAD` | dernier taux, pour l'affichage | voir S3 |

- **Traitement des nouvelles** : les affirmations sont extraites par un modèle de langage, puis vérifiées en code contre les prix et
  les dépôts officiels (statuts : vérifiée, contestée, non vérifiée). Une manchette n'est jamais une preuve.
- **Cohérence temporelle** : ces sources sont lues le jour de la demande, alors que les prix s'arrêtent au dernier jour du jeu de
  données. Quand une source a répondu et que les deux dates diffèrent, l'écran de proposition, la trace et les limites l'indiquent :
  « Prix au … · nouvelles lues le … » (`research_dates`).
- **Cache partagé** (`backend/app/hype_research/news_cache.py`) : ces sources publiques sont lentes (GDELT accepte une requête
  toutes les 5 s). Elles sont donc lues à l'avance et gardées dans une partition commune du stockage (`_shared`, type `NEWS`), sans
  aucune donnée personnelle :
  - **rafraîchissement aux 15 minutes**, soit le rythme de mise à jour de GDELT : une interrogation plus fréquente ne rapporterait
    rien de neuf. Sur AWS, une règle EventBridge appelle la Lambda des agents (`{"task": "news_refresh"}`) ; en local, un fil
    d'exécution de l'API s'en charge (`AEGIS_NEWS_REFRESH_MIN`, 15 par défaut, 0 pour le couper). Il porte sur les titres
    individuels et les cryptoactifs, pas sur les FNB diversifiés. Il n'appelle pas le modèle de langage ;
  - **ouverture de la page d'un titre** (`POST /api/v1/research/prefetch`) : relit ses sources si elles ont vieilli et extrait les
    affirmations pendant que la personne lit la page. Une extraction est réutilisée tant que les articles sont les mêmes ;
  - **durée de réutilisation** : 20 min pour les articles et CoinGecko, 1 h pour les dépôts SEC, 6 h pour le volume sur 90 jours.
    Au-delà, l'analyse relit la source en direct. Si cette lecture échoue, une copie de moins de 24 h est utilisée et signalée
    comme telle dans la trace.
- **Date de lecture réelle** (énoncé p. 14) : chaque partie garde le moment où elle a vraiment été lue. La trace journalise
  « cache » avec ce moment, et l'écran de résultat affiche l'heure de lecture des nouvelles (`dates.read_at`, la plus ancienne
  lecture utilisée). Une nouvelle lue en cache n'est jamais présentée comme lue à l'instant de l'analyse.
- **Limites** : GDELT couvre surtout la presse en ligne ; les dépôts SEDAR+ (émetteurs canadiens) ne sont pas connectés ; les
  conditions exactes de GDELT et de CoinGecko sont à relire avant toute diffusion publique. Une analyse peut s'appuyer sur des
  nouvelles lues jusqu'à 20 minutes plus tôt (24 h si la source est en panne) ; l'heure affichée le dit.

## S12 — Filtre ESG (préférence de Mateo)

- **Source** : prospectus abrégé de Vanguard World Fund (formulaire 497K, SEC) pour le FNB ESGV, qui figure dans le kit
  (https://www.sec.gov/Archives/edgar/data/52848/000168386321007247/f10433d1.htm). L'indice suivi, FTSE US All Cap Choice,
  exclut notamment les combustibles fossiles, les armes, le tabac, l'alcool, les jeux d'argent, le nucléaire civil et le
  divertissement pour adultes, ainsi que les sociétés jugées non conformes au Pacte mondial de l'ONU.
- **Application** (méthodologie `esg_screen`) : quand la personne demande des critères ESG, une action du secteur Énergie du kit
  (Enbridge, Canadian Natural Resources, Exxon Mobil) déclenche un **avertissement sourcé**, jamais un refus à lui seul.
- **Limites** : filtre par secteur, pas une note ESG par entreprise ; les controverses propres à chaque entreprise ne sont pas
  vérifiées ; prospectus de 2021 (FTSE a ajouté des critères en mars 2024 et revoit l'indice chaque trimestre) ; cryptoactifs,
  FNB et obligations non couverts.

## Données non disponibles (déclarées, pas contournées)

| Besoin | État | Conséquence dans l'application |
|---|---|---|
| Notes ESG et controverses par entreprise | propriétaires ou non licenciées | filtre sectoriel sourcé (S12) et limite affichée |
| Composition de QQQ et d'ESGV | pas de téléchargement automatisable | QQQ compté en entier dans la technologie, « jusqu'à » |
| Composition historique de SPY | non publiée par SSGA | instantané actuel seulement |
| Dépôts SEDAR+ | non connectés | recherche officielle limitée aux émetteurs américains |
