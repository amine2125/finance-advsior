# Hypothèses

> Tout ce qui ne vient ni de l'énoncé ni d'une source du catalogue (`docs/donnees.md`) est une hypothèse, listée ici (énoncé p. 17 :
> distinguer faits, hypothèses et scénarios fictifs). Les valeurs vivent dans `backend/app/methodology.py` ; elles se modifient sans toucher au reste du code. Aucune n'est une règle réglementaire.

## 1. Personas : des comptes ordinaires, pas des cas codés

Le moteur ne connaît aucun persona (énoncé p. 4) : le nom d'Amira, de Mateo ou de Robert n'apparaît dans aucune règle. Les trois
comptes de démonstration (`backend/app/services/demo_accounts.py`) remplissent simplement le même questionnaire qu'un nouvel
utilisateur, avec des réponses fictives tirées des fiches de l'énoncé (p. 5 à 7), et reçoivent un portefeuille fictif acheté aux
vrais prix historiques.

| Compte | Réponses clés (hypothèses) | Portefeuille fictif (montants à l'achat) | Solde fictif |
|---|---|---|---|
| Amira | croissance, 20 ans, perte supportable 45 %, crypto « oui », intérêt pour la technologie et l'IA | QQQ 6 000, NVDA 4 000, SHOP.TO 2 500, MSFT 3 000, BTC-USD 2 500, XIU.TO 4 000, ESGV 3 000 $ | 5 000 $ |
| Mateo | équilibre, 10 ans, perte supportable 30 %, deux enfants, ESG, secteur Énergie exclu | ESGV 11 000, XIU.TO 8 000, XBB.TO 18 000, AGG 8 000, FTS.TO 2 500, CNR.TO 2 500 $ | 10 000 $ |
| Robert | revenu avec un peu de croissance, 5 ans, perte supportable 20 %, intérêt pour les titres populaires | NVDA 18 000, MSFT 15 000, QQQ 15 000, SPY 12 000, TSLA 8 000, XBB.TO 20 000, ZST.TO 12 000 $ | 20 000 $ |

Les portefeuilles sont volontairement contrastés : Amira et Robert dépassent leurs limites (concentration en technologie et en
NVIDIA), Mateo les respecte. Ils servent à montrer l'adaptation au profil (énoncé p. 8 et 15), pas à représenter un client réel.

## 2. Du questionnaire au profil

« Connaître son client », version 2 (`profile_builder.kyc`) : quatre mesures, et **la plus basse fixe le niveau**.

| Mesure | Ce qui la détermine |
|---|---|
| Tolérance déclarée | choix de portefeuille (A à D), pari (sûr / petit risque / gros risque), perte supportable (≤ 10 % prudent, ≤ 20 % faible à modéré, ≤ 30 % modéré, au-delà élevé) |
| Comportement | la réaction à une baisse, le ressenti face aux variations et le comportement passé plafonnent la tolérance déclarée (« ce que l'on fait compte plus que ce que l'on dit ») |
| Capacité | part de 3, retranchée si : coussin < 3 mois de dépenses, dette > 40 % du revenu, emploi instable, personnes à charge sans 6 mois d'épargne ; un coussin de 6 mois compense un revenu incertain |
| Objectif et horizon | préserver → prudent au plus, revenu → faible à modéré, équilibre → modéré ; horizon < 3 ans → prudent, 3 à 7 ans → faible à modéré, 7 à 12 ans → modéré, ≥ 12 ans → élevé permis |
| Connaissances | trois questions de quiz et produits détenus ; un débutant est plafonné à « Modéré », sans crypto |

L'âge n'est jamais utilisé pour deviner la tolérance au risque. Le taux de 20,99 % de la carte de crédit sert seulement à dire
qu'une dette coûteuse passe avant un placement.

## 3. Limites par niveau de profil (`profile_builder.budgets`)

| Niveau | Actions et cryptos | Par entreprise | Par secteur | Cryptos | Seuil de revue de la pire baisse |
|---|---|---|---|---|---|
| Prudent | 10 – 30 % | 5 % | 20 % | 0 % | −8 % |
| Faible à modéré | 30 – 45 % | 5 % | 25 % | 2 % | −10 % |
| Modéré | 55 – 70 % | 10 % | 30 % | 5 % | −20 % |
| Élevé | 80 – 95 % | 15 % | 40 % | 10 % | −30 % |

Ce sont des points de départ prudents et lisibles. Le seuil de revue de la pire baisse vient du **niveau** de profil, pas de la
réponse de la personne : les textes de l'application le disent ainsi (« seuil de revue prévu pour un profil … »).

## 4. Niveau de risque d'un actif (`risk_tiers`, heuristique)

- Volatilité annualisée : faible sous 10 %, élevée au-dessus de 30 %. Pire baisse : faible au-dessus de −15 %, élevée à −50 % ou pire.
  Le niveau retenu est le plus mauvais des deux ; moins de 250 observations : « inconnu ».
- Règle structurelle : toute action individuelle (perte permanente possible), tout cryptoactif, produit à levier ou inverse : élevé.
- Seuils fixés sur la fenêtre 2021-11-12 → 2024-06-28 seulement, puis gelés avant d'examiner la suite.

## 5. Règles de vérification d'une demande

1. Préférences déclarées : secteur exclu ou crypto non prévue → incompatible.
2. Horizon : un actif de risque élevé avec un horizon de moins de 3 ans → incompatible.
3. Un actif de deux niveaux au-dessus du niveau permis → incompatible.
4. Après l'ajout hypothétique, chaque limite du tableau 3 est recalculée ; le montant maximal compatible est trouvé par dichotomie.
5. Filtre ESG (section 7) : avertissement seulement.

## 6. Portefeuille modèle et scénarios

- **Portefeuille modèle simulé** (`plan_service`) : part de croissance = milieu de la fourchette du profil, arrondi à 5 % ; reste en
  obligations (très court terme si seul un risque faible est permis). Uniquement des fonds indiciels larges ; ESGV au lieu de SPY si
  la personne demande des critères ESG. Tant qu'une limite est dépassée, 5 % passent de la croissance aux obligations très court terme.
- **Rejeu 2022** : poids actuels appliqués du 2022-03-01 au 2022-12-30, quand actions et obligations ont reculé ensemble (énoncé p. 14).
  C'est un fait passé, pas une prévision.
- **Chocs hypothétiques** (`scenarios.SHOCK_PRESETS`), chiffres choisis par l'équipe :

| Choc | Hypothèse |
|---|---|
| Technologie | technologie −30 %, autres actions −10 %, FNB d'actions −15 %, obligations +2 %, cryptos −40 % |
| Hausse de taux de 100 pb | obligations −6 % (duration d'environ 6 ans), actions −5 % |
| Marché baissier | actions −25 %, obligations −5 %, or +5 %, cryptos −50 % |
| Dollar canadien +10 % | USD/CAD −9,09 % |
| Hiver crypto | cryptoactifs −60 % |

## 7. ESG

- Une exclusion par **activité** (combustibles fossiles dans l'indice suivi par ESGV, `docs/donnees.md` S12) est un contexte, pas
  une controverse. Elle produit un avertissement sourcé, jamais un refus à elle seule, et ne fait pas sortir un portefeuille de son
  profil de risque.
- Le secteur Énergie du kit sert d'approximation des combustibles fossiles (Enbridge, Canadian Natural Resources, Exxon Mobil).
- Exclure un secteur reste possible dans le questionnaire : c'est alors la personne qui l'a dit, et la règle devient bloquante.

## 8. Données et dates

- Délais de publication de la macro : `docs/donnees.md`, S4.
- « Aujourd'hui » des signaux ULYSSE : deux jours après le dernier jour du datapack (2026-11-14 pour le jeu officiel), pour que les
  pages vues et les compositions de FNB de ce dernier jour soient utilisables. `ULYSSE_ASOF` le fixe pour une démonstration.
- Prix prolongés après le 2026-11-12 seulement avec `make data-refresh` ou `make deploy` (S10).
- Frais de transaction, écarts, impôts et taxes : omis de tous les calculs.
- Conversion des titres en USD au dernier taux de la Banque du Canada connu à la date.
