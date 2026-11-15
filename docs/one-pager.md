# ULYSSE — tes règles, avant la tentation

**Simulation, pas un conseil financier.** Datathon AlphaForge AI 2026 (Banque Nationale × AWS × PolyFinances).

**Le problème.** L'information abonde ; la décision personnelle reste seule. Environ 35 % des investisseurs particuliers canadiens sondés par la CVMO (OSC, 2025) disent avoir pris une décision financière à la suite d'un influenceur ; 53 % des Canadiens utilisent les réseaux sociaux pour s'informer sur l'investissement, 82 % chez les 18–24 ans (Indice des investisseurs 2024 des ACVM). L'écart à combler : « tout le monde parle de ce titre » contre « est-ce cohérent avec **ma** situation ? ».

**L'approche.** Une app de placement simulée, comme les autres (marché, fiches, ordres, portefeuille), avec un agent intégré au parcours qui ne bavarde pas.
1. **Le Contrat (à froid)** : tes règles (perte maximale en crise, horizon, concentration, techno, crypto, liquidités, ESG), chacune marquée « tu l'as dit » ou « valeur par défaut », versionnée ; les contradictions sont relevées.
2. **Le Mât (à chaud)** : pendant la saisie d'un ordre simulé, chaque règle est vérifiée en code en ~10 ms. Selon la gravité : ✅ discret, ⚠ encadré, ⛔ pause de réflexion. « Continuer quand même » reste toujours possible.
3. **La Vigie (en continu)** : chaque heure, sur AWS, elle surveille la dérive, l'attention inhabituelle et le climat de marché, et ne prévient que du nouveau.

**Agentique, mais bornée.** Le LLM (Claude sur Amazon Bedrock) ne fait que **planifier** (choisir les modules d'analyse) et **rédiger** (à partir des seules preuves). Tout calcul, toute règle et tout niveau de signal sont du code testé. Un vérificateur rejette toute phrase dont un chiffre n'a pas de preuve, nomme le défaut, laisse 2 essais, puis bascule sur un gabarit sans LLM.

**Originalité.** (1) Le geste du **signal** : l'élément concerné s'allume, partout dans l'app, toujours de la même façon. (2) La décision est jugée contre **tes** règles, jamais contre une opinion. (3) La **machine à remonter le temps** rejoue l'app à une date passée avec seulement l'information publiée à cette date, y compris un contre-exemple où la prudence n'a pas « payé ».

**Données.** Jeu de départ AlphaForge (31 actifs, 2021–2026), prolongé à 2016 avec les mêmes sources ; Banque du Canada, FRED ; pages vues Wikipedia ; compositions de FNB publiées (SSGA, iShares Canada) ; preuves ESG citées (Vanguard, FTSE, dépôts réglementaires, AP). Aucune cote propriétaire ; chaque source cataloguée (origine, date, traitements, limites, licence). Anomalie du kit (CNQ, 2022-08-22) détectée et corrigée sur preuve.

**Explicabilité.** Données → Constats → Analyse → Options → Explication ; chaque phrase étiquetée MESURÉ, DOCUMENTÉ, HYPOTHÈSE ou INCERTAIN ; chaque chiffre cliquable vers sa preuve (source, date, période, méthode, paramètres, version du code) ; les 4 questions de l'atelier ; trace complète et rejouable dans le Journal.

**Mesuré, pas promis.** 71 tests ; banc d'essai : 22/22 signaux attendus, 0/12 fausses alertes, 1 984/1 984 évaluations sans information future, dossiers entièrement prouvés 16/16 ; accessibilité axe 0 violation, Lighthouse 97–100.

**Valeur pour l'utilisateur et pour un courtier en ligne.** Moins de décisions prises « à chaud » contre ses propres objectifs, sans conseil personnalisé : des alertes factuelles et des outils d'aide à la décision, la piste que la ligne directrice de l'OCRI (12 mars 2026) décrit comme permise tant qu'elle n'endosse pas une décision précise (piste, pas un avis juridique).
