# Script vidéo (~5 min)

> Mode démo : `make api`, puis page **Démo** → « Réinitialiser la démo ». Tout est rejoué de la même façon à chaque prise.

| Temps | Écran | Voix (texte à dire) |
|---|---|---|
| 0:00–0:30 | Titre, puis Tendances | « Tout le monde parle de NVIDIA. Mais est-ce cohérent avec **ma** situation ? 35 % des investisseurs sondés par la CVMO ont déjà agi sur la foi d'un influenceur. ULYSSE ne dit jamais quoi acheter : il compare ton intention aux règles que tu as écrites à froid. » |
| 0:30–1:00 | Mon contrat (Robert) | « Robert, 59 ans, prend sa retraite dans 3 à 5 ans. Ses règles : perte maximale en crise, horizon, 5 % au plus par entreprise. Chaque clause dit d'où elle vient : « tu l'as dit » ou « valeur par défaut ». » |
| 1:00–2:00 | Tendances → NVDA → bandeau « Pour toi » → ordre de 170 000 $ → pause | « Le détecteur, un Isolation Forest entraîné sur le seul passé de chaque titre, signale une attention inhabituelle : pages vues dix fois leur niveau habituel. Robert ouvre la fiche : le bandeau « Pour toi » s'allume. Il tape 170 000 $ : la vérification se fait pendant la saisie, en une dizaine de millisecondes, sans LLM. Pause de réflexion : 4 de ses propres règles seraient dépassées. Alternative chiffrée : au plus 18 300 $. Il garde le dernier mot. » |
| 2:00–2:40 | Dossier : étapes, phrases étiquetées, clic sur un chiffre, vérificateur | « Le dossier : le planificateur choisit les modules, le code calcule, la gouvernance vérifie chaque clause, puis l'agent rédige uniquement à partir des preuves. Chaque chiffre s'ouvre sur sa preuve : source, date, méthode, version du code. » |
| 2:40–3:20 | Même parcours pour Amira (profil élevé) | « Mêmes clics pour Amira, 26 ans, risque élevé : à 2 000 $, un signal discret ; à 25 %, une pause, parce qu'elle a elle-même demandé de rester diversifiée. Sa techno réelle se calcule en ouvrant ses FNB. Risque élevé ne veut pas dire tout accepter. » |
| 3:20–3:50 | Mateo : XOM puis ENB (lentille ESG) | « Mateo veut éviter les controverses. Pour Enbridge, une procédure de l'État du Michigan, citée mot pour mot. Pour Exxon : aucune controverse dans la base, mais une exclusion sectorielle documentée. L'app dit « données insuffisantes » plutôt que d'inventer. » |
| 3:50–4:20 | Machine à remonter le temps : TSLA, 15 déc. 2021, puis aujourd'hui ; contre-exemple NVDA déc. 2022 | « Retour au 15 décembre 2021, avec seulement l'information publiée à cette date : même pause pour Robert. Ce qui a suivi : TSLA a perdu jusqu'à 65 % au pire moment, pendant la fenêtre où Robert pouvait avoir besoin de son argent, puis il est remonté (+35 % au 12 novembre 2026). Et un contre-exemple honnête : en décembre 2022, ULYSSE marquait aussi une pause pour NVDA, et le titre a ensuite été multiplié par plus de dix. La prudence n'a pas toujours « payé ». ULYSSE ne prédit rien : il fait respecter l'horizon et la perte maximale que Robert s'est lui-même donnés. » |
| 4:20–4:45 | Démo 6 : vérificateur | « Si l'agent rédacteur écrit 46,0 % au lieu de 45,6 %, le vérificateur rejette la phrase, nomme le défaut, et la version corrigée s'affiche. » |
| 4:45–5:00 | Architecture AWS + Fiabilité | « Sur AWS : une Lambda derrière CloudFront, DynamoDB, S3, la Vigie chaque heure par EventBridge, Bedrock pour planifier et rédiger. Tout est mesuré sur la page Fiabilité. ULYSSE : tes règles, avant la tentation. » |

Deux situations contrastées pour l'adaptation (PDF p. 15) : Robert (pause) et Amira (signal discret puis pause selon **ses** règles).


> Chiffres vérifiés sur le datapack (CAD, rendement total) le 2026-11-14 : TSLA, du 2021-12-15 au pire point −65 %, au 2026-11-12 +35 % ; NVDA, du 2022-12-15 au 2026-11-12 +928 % (niveau ULYSSE au 2022-12-15 pour un ordre de 40 000 $ : pause, règle P2).
