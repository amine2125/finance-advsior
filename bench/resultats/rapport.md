# Banc d'essai — résultats

Exécuté le 2026-11-14 22:07 · local, LLM simulé, datapack du 2026-11-12 · 28.1 s

| Mesure | Résultat | n | IC 95 % (Wilson) | Niveau |
|---|---|---|---|---|
| Signaux attendus qui se déclenchent (scénarios étiquetés d'après l'énoncé) | 100.0 % | 22 | 85.1–100.0 % | Mesuré |
| Fausses alertes : pause sur un scénario où aucune pause n'est attendue | 0.0 % | 12 | 0.0–24.3 % | Mesuré |
| Stabilité : même entrée exécutée 5 fois, même statut | 100.0 % | 8 | 67.6–100.0 % | Mesuré |
| Proportionnalité : un ordre plus gros n'est jamais jugé moins sévèrement (1 %, 5 %, 10 %, 20 %) | 100.0 % | 496 | 99.2–100.0 % | Mesuré |
| Aucune preuve postérieure à la date simulée (4 dates, dont 2021 et 2022) | 100.0 % | 1984 | 99.8–100.0 % | Mesuré |
| Dossiers publiés dont chaque chiffre est relié à une preuve citée (vérificateur) | 100.0 % | 16 | 80.6–100.0 % | Mesuré |
| Brouillons rejetés au moins une fois par le vérificateur (LLM simulé, défauts injectés dans la moitié des cas) | 43.8 % | 16 | 23.1–66.8 % | Indicatif |
| Latence du signal (vérification d'ordre), médiane, local | 9 ms | 2006 | — | Mesuré |
| Latence du signal, 95e centile, local | 13 ms | 2006 | — | Mesuré |
| Durée d'un dossier complet, médiane, local avec LLM simulé | 189 ms | 16 | — | Indicatif |
| Coût par dossier | — | 0 | — | Indicatif |

## Limites de ce banc d'essai

- Les 22 scénarios étiquetés ont été écrits par l'auteur du moteur **après** sa conception, à partir de l'intention de l'énoncé : un 100 % peut refléter ce biais. Ils devraient être complétés par des scénarios écrits par une autre personne.
- LLM simulé : le taux de rejet réel du vérificateur, la durée et le coût des dossiers avec Bedrock seront mesurés en phase 7.
- Latences mesurées en local (MacBook M2) ; elles seront remesurées sur AWS.

## Scénarios étiquetés

| Profil | Titre | Taille | Date | Attendu | Obtenu | Conforme | Pourquoi |
|---|---|---|---|---|---|---|---|
| robert | TSLA | 20 % | 2026-11-14 | pause..pause | pause | oui | PDF p.7 : remettre en question une demande médiatisée incohérente (20 % d'un titre très volatil à 3–5 ans de la retraite) |
| robert | NVDA | 20 % | 2026-11-14 | pause..pause | pause | oui | idem, titre réellement en engouement à la date |
| robert | SHOP.TO | 20 % | 2026-11-14 | pause..pause | pause | oui | idem, titre de croissance très volatil |
| robert | BTC-USD | 5 % | 2026-11-14 | attention..pause | pause | oui | PDF p.7 : peu intéressé par les cryptoactifs |
| robert | TSLA | 20 % | 2021-12-15 | pause..pause | pause | oui | machine à remonter le temps : même incohérence en décembre 2021 |
| robert | ZST.TO | 2 % | 2026-11-14 | aucun..attention | attention | oui | obligations à très court terme, petite taille : pas de pause attendue |
| robert | XBB.TO | 2 % | 2026-11-14 | aucun..attention | attention | oui | obligations canadiennes, petite taille : pas de pause attendue |
| robert | JNJ | 1 % | 2026-11-14 | aucun..attention | attention | oui | entreprise établie, 1 % : pas de pause attendue |
| amira | BTC-USD | 5 % | 2026-11-14 | aucun..attention | ok | oui | prompt §11 : Amira + 5 % de BTC -> pas de ⛔ (risque élevé, intérêt crypto) |
| amira | ETH-USD | 3 % | 2026-11-14 | aucun..attention | ok | oui | idem, petite position crypto |
| amira | NVDA | 2 % | 2026-11-14 | aucun..attention | attention | oui | petite position techno : signal discret au plus |
| amira | NVDA | 25 % | 2026-11-14 | pause..pause | pause | oui | PDF p.5 : « risque élevé » ≠ « tout est acceptable » ; diversification qu'elle a demandée |
| amira | SHOP.TO | 25 % | 2026-11-14 | pause..pause | pause | oui | idem |
| amira | XIU.TO | 5 % | 2026-11-14 | aucun..attention | attention | oui | FNB large : diversifiant, pas de pause attendue |
| mateo | XOM | 3 % | 2026-11-14 | attention..attention | attention | oui | PDF p.6 : critères ESG ; la clause doit être évaluée (preuve ou données insuffisantes), sans pause |
| mateo | ENB.TO | 3 % | 2026-11-14 | attention..attention | attention | oui | PDF p.6 : controverse documentée -> au moins ⚠, jamais ⛔ sur une clause qualitative |
| mateo | CNQ.TO | 3 % | 2026-11-14 | attention..attention | attention | oui | énergie, pas de preuve ESG dans la base -> données insuffisantes |
| mateo | ESGV | 2 % | 2026-11-14 | aucun..attention | attention | oui | FNB filtré ESG, petite taille : pas de pause attendue |
| mateo | BTC-USD | 10 % | 2026-11-14 | pause..pause | pause | oui | PDF p.6 : peu intéressé par les placements hautement spéculatifs |
| prudent | NVDA | 10 % | 2026-11-14 | pause..pause | pause | oui | PDF p.14 : profil prudent préparant un achat prochain |
| prudent | TSLA | 5 % | 2026-11-14 | attention..pause | pause | oui | idem |
| prudent | ZST.TO | 5 % | 2026-11-14 | aucun..attention | attention | oui | obligations à très court terme : cohérent avec un achat prochain |
