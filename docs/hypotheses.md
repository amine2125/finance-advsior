# Hypothèses

> Tout ce qui n'est **ni dans le PDF ni dans une source** est une hypothèse : listée ici, étiquetée « hypothèse » dans l'app, modifiable.
> Les personas du PDF (p. 5–7) ne donnent ni capital, ni montants, ni portefeuilles.

## 1. Personas : valeurs fictives (profils pré-remplis et cas de test)

Portefeuilles fictifs **constitués le 2025-01-02** au prorata des poids ci-dessous, puis laissés dériver avec les prix réels. Si la date de simulation est antérieure (machine à remonter le temps), le portefeuille est constitué à la date de simulation avec les mêmes poids.

| Persona | Âge | Tolérance | Expérience | Capital (hyp.) | Objectifs (hyp. sur les parts et montants) | Allocation initiale (hyp.) | Limites « dites » |
|---|---|---|---|---|---|---|---|
| Amira | 26 | eleve | intermediaire | 40,000 $ | Faire croître mon capital à long terme (15 ans, 100 %) | SPY 28 %, XIU.TO 15 %, NVDA 8 %, SHOP.TO 7 %, MSFT 5 %, GOOGL 4 %, BTC-USD 4 %, ETH-USD 1 %, XBB.TO 10 %, GLD 6 %, CASH 12 % | techno_max = 45, crypto_max = 10 |
| Mateo | 41 | modere | intermediaire | 180,000 $ | Études des enfants (8 ans, 35 %); Croissance équilibrée (12 ans, 65 %) | ESGV 25 %, XIU.TO 12 %, XBB.TO 22 %, AGG 5 %, FTS.TO 5 %, CNR.TO 5 %, MSFT 4 %, AAPL 3 %, JNJ 4 %, PG 3 %, GLD 4 %, CASH 8 % | speculatif_max = 5 |
| Robert | 59 | faible_modere | avance | 650,000 $ | Retraite (3 ans, 100 %) | XBB.TO 30 %, ZST.TO 12 %, XIU.TO 13 %, SPY 8 %, RY.TO 5 %, TD.TO 4 %, ENB.TO 4 %, FTS.TO 4 %, JNJ 4 %, PG 3 %, GLD 4 %, CASH 9 % | crypto_max = 0 |

Ce que le PDF dit et que le contrat traduit en clauses « dites » : Amira veut éviter de miser exclusivement sur la techno (limite techno, valeur 45 % = hypothèse) et s'intéresse aux cryptoactifs (limite crypto 10 % = hypothèse) ; Mateo veut éviter les controverses environnementales ou sociales importantes et est peu intéressé par le très spéculatif (limite 5 % = hypothèse) ; Robert est peu intéressé par les cryptoactifs (0 %) et prend sa retraite dans 3 à 5 ans (horizon retenu : 3 ans, borne basse prudente).

## 2. Valeurs par défaut des clauses (selon la tolérance déclarée)

| Tolérance | Perte max. en crise | Actions max. | Par entreprise | Très volatil | Crypto | Liquidités min. |
|---|---|---|---|---|---|---|
| faible | 10 % | 30 % | 5 % | 0 % | 0 % | 10 % |
| faible_modere | 15 % | 60 % | 5 % | 2 % | 0 % | 5 % |
| modere | 25 % | 70 % | 8 % | 5 % | 2 % | 3 % |
| eleve | 40 % | 95 % | 10 % | 15 % | 10 % | 2 % |

- Plafond des actions selon l'objectif le plus proche : moins de 2 ans → 20 % ; moins de 5 ans → 50 % ; moins de 10 ans → 70 %.
- Ces valeurs ne viennent d'aucune norme réglementaire : ce sont des points de départ prudents et lisibles, que l'utilisateur modifie (« Modifier ma règle »). Chaque clause par défaut porte cette justification dans l'app.
- Allocation fictive proposée à un profil créé en direct qui ne décrit pas son portefeuille : faible : ZST.TO 35 %, XBB.TO 30 %, XIU.TO 10 %, SPY 5 %, CASH 20 %, faible_modere : XBB.TO 35 %, ZST.TO 10 %, XIU.TO 20 %, SPY 20 %, GLD 5 %, CASH 10 %, modere : XBB.TO 25 %, XIU.TO 25 %, SPY 30 %, GLD 5 %, AGG 5 %, CASH 10 %, eleve : XIU.TO 30 %, SPY 45 %, XBB.TO 10 %, GLD 5 %, CASH 10 %.

## 3. Définitions et seuils de la politique de signal

| Élément | Valeur | Raison |
|---|---|---|
| « Techno » | Secteurs GICS Technologies de l'information + Services de communication, FNB ouverts | Inclut Alphabet et Meta, que le public range dans la « techno » |
| « Très volatil » (spéculatif) | Volatilité annualisée sur 1 an > 60 % ou cryptoactif | Seuil lisible, environ trois fois la volatilité d'un indice large |
| Clause « approchée » | ≥ 80 % de la limite | Prévenir avant le dépassement |
| Gravité d'un dépassement | (valeur − limite) ÷ limite, ×2 si clause importante | Proportionnalité |
| ⛔ P1 | clause importante dépassée d'au moins 50 % de sa limite | Écart grave |
| ⛔ P2 | somme des gravités ≥ 1,0 | Plusieurs écarts qui s'additionnent |
| ⚠ encadré | gravité ≥ 0,25, clause ESG dépassée, ou clause importante invérifiable | Sinon note discrète |
| Dépassement préexistant | compte seulement s'il est aggravé d'au moins 10 % de la limite | La Vigie signale les dérives à part |
| Perte en crise | pire baisse du portefeuille rejoué dans les épisodes terminés avant la date : fin 2018 (2018-10-01 → 12-24), COVID (2020-02-19 → 03-23), 2022 (année civile) | Faits passés, pas une prévision |
| Horizon | pire résultat sur toutes les périodes passées de la durée de l'horizon ; fenêtre réduite (et signalée « incertain ») si l'historique est plus court ; clause importante si l'horizon est < 5 ans | Mesure ce qu'on aurait trouvé en ayant besoin de l'argent à l'échéance |

## 4. ESG

- Définition d'une **controverse importante** (ULYSSE, modifiable) : procédure judiciaire ou administrative engagée par une autorité publique sur un enjeu environnemental ou social, documentée par une source vérifiable lue et citée mot pour mot.
- Une exclusion par **activité** (ex. pétrole et gaz dans l'indice suivi par ESGV) est un contexte, pas une controverse.
- Une clause ESG ne déclenche jamais ⛔ à elle seule (la qualification dépend d'une définition que l'utilisateur peut ne pas partager).

## 5. Données

- Délais de publication macro : voir `docs/donnees.md` (S4).
- « Aujourd'hui » de l'app : 2026-11-14 (dernières données de marché : 2026-11-12 ; les compositions publiées le 12 sont utilisables à partir du 13).
