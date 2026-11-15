# Script vidéo (environ 5 minutes)

> Énoncé p. 15 : un exemple de bout en bout (problème, rôle des agents, données et outils, résultat, explication) et deux situations
> d'investisseurs distinctes. Préparation : version en ligne, ou `make api` + `make web` avec Bedrock connecté. Avant chaque prise,
> « Tout effacer et recommencer » (page Profil) sur les comptes utilisés. Chiffres relevés le 2026-11-15 (données au 2026-11-12) :
> les revérifier à l'écran le jour du tournage, ils changent si les prix ont été prolongés.

| Temps | Écran | Voix |
|---|---|---|
| 0:00–0:30 | Page d'accueil | « Tout le monde parle de NVIDIA et de Tesla. Mais est-ce compatible avec **ma** situation ? AEGIS ne dit pas quoi acheter : il confronte chaque idée au profil que la personne a déclaré, et montre sur quels chiffres repose la réponse. Tout est simulé. » |
| 0:30–1:00 | Profil de Robert (Profil → Vos réponses) | « Robert, 59 ans, vise la retraite dans 5 ans. Son questionnaire donne un profil faible à modéré : la plus basse de quatre mesures, et chaque raison est affichée. Ses limites : 30 à 45 % d'actions, 5 % au plus par entreprise. » |
| 1:00–2:00 | Accueil → « Je veux 3 000 $ de Tesla » → agents en direct | « Il écrit sa demande en français. Les agents s'enchaînent : Profil, Superviseur, Données, Recherche avec les dépôts SEC et les nouvelles, Analyste, Gouvernance, Scénarios. Résultat : hors de ses limites. Son portefeuille a déjà 86 % d'actions, et Tesla pèserait 10 %, le double de sa limite par entreprise. La même somme irait dans des obligations. Il garde le dernier mot. » |
| 2:00–2:50 | Analyse complète : Pourquoi, Contrôles, Pour et contre, Trace des agents | « Chaque chiffre vient d'un calcul Python enregistré avec sa méthode et sa source. Les agents Opportunités et Risques argumentent, puis la Gouvernance vérifie chaque chiffre cité. La trace dit, étape par étape, ce qui vient d'un calcul et ce qui vient d'un modèle de langage. » |
| 2:50–3:40 | Compte Amira → « Rééquilibre mon portefeuille » | « Amira, 26 ans, profil élevé. Risque élevé ne veut pas dire tout accepter : sa technologie atteint près de 70 % en comptant ses fonds, et NVIDIA pèse 30 %. Le rééquilibrage simulé garde 90 % de croissance, mais la variation annuelle typique passe de 25 % à 13 %, et le rejeu de 2022 de −24 % à −7 %. » |
| 3:40–4:10 | Compte Mateo → « Rééquilibre mon portefeuille », puis page À propos | « Mateo, profil modéré, préférences ESG : son portefeuille respecte son profil, rien à corriger. Le kit ne contient aucune donnée ESG ; AEGIS utilise la règle d'exclusion publiée de l'indice suivi par ESGV, cite sa source et dit ce qu'elle ne couvre pas. » |
| 4:10–4:40 | Accueil : climat de marché et attention inhabituelle | « Le moteur ULYSSE décrit le présent sans prédire : climat de marché par mélange gaussien, attention inhabituelle par Isolation Forest sur les pages vues Wikipédia et le volume. Une forte attention invite à décider à froid ; ce n'est jamais un signal d'achat. » |
| 4:40–5:00 | Schéma d'architecture AWS (README) | « Sur AWS : CloudFront, Cognito, deux Lambda, DynamoDB, Bedrock, le tout décrit en CDK. Les données viennent du jeu officiel, prolongé avec son propre script, et chaque source est documentée. AEGIS : chaque idée confrontée à votre propre profil, chiffres à l'appui. » |

Deux situations contrastées (énoncé p. 15) : Robert (demande refusée, alternative) et Amira (rééquilibrage d'un profil offensif).
