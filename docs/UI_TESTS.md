# Vérification de l’interface BNB

Ces vérifications ne déclenchent aucun versement. Les états `paid` et `submitted` des tests de rendu sont des fixtures locales au navigateur ; ils ne constituent pas des paiements réels.

## Parcours manuel reproductible

1. Avec Node 24 ou supérieur, exécuter `npm ci`, puis `npm start` à la racine du dépôt. Ouvrir `http://127.0.0.1:3000`.
2. Comparer le wallet et l’identité affichés au JSON de `/api/status`. Sans configuration, l’interface doit afficher « Non configuré » et « Non enregistrée ».
3. Cliquer sur « Charger un exemple », puis « Lancer la mission ». Le rapport doit présenter les risques détectés et leurs recommandations. Le code de l’exemple n’est pas exécuté.
4. Vérifier le journal et les XP. Une découverte en attente de revue ne doit pas augmenter le montant des récompenses confirmées.
5. Réduire la fenêtre à 390 pixels de large : aucun défilement horizontal de la page ne doit apparaître.
6. Le montant total provient exclusivement des rapports avec `rewardState: "paid"`. Un état `submitted`, `sending` ou `uncertain` ne constitue pas un paiement confirmé. Un lien de transaction, lorsqu’un hash valide est présent, doit pointer vers `https://testnet.bscscan.com/tx/…`.

## Vérification automatisée optionnelle

Le dépôt ne télécharge pas de navigateur et n’ajoute pas Playwright à ses dépendances. Le script `scripts/ui-smoke.mjs` utilise une installation Playwright existante. Il nécessite le serveur local démarré dans un autre terminal.

```sh
PLAYWRIGHT_MODULE=/chemin/absolu/vers/playwright/index.mjs \
BNB_UI_BROWSER_EXECUTABLE=/chemin/vers/chromium \
node scripts/ui-smoke.mjs
```

Les variables sont facultatives si Playwright et son navigateur sont déjà résolus normalement. `BNB_UI_URL` permet de choisir une autre adresse locale. Le test réel ajoute ou retrouve une mission de démonstration dans la base locale ; il n’appelle aucun endpoint de revue, de versement ou de réconciliation.

Le script vérifie le statut réel, la soumission d’une mission, le total confirmé, l’absence d’erreur JavaScript et la disposition mobile. Des routes interceptées dans un second contexte vérifient ensuite les états de récompense, les liens de transaction, le rendu de texte hostile et la remise à zéro des compteurs. La fixture combine un rapport payé et un rapport seulement soumis : le total attendu est exactement `0.001000000000000001 tBNB`, calculé sans nombre flottant.

## Preuves de la session de travail

Les essais Chromium sur le serveur local ont réussi, ainsi que les fixtures de rendu. Aucune récompense réelle n’a été envoyée pendant ces essais. Les captures de travail sont conservées hors du dépôt ; elles montrent uniquement le prototype local et son état réel au moment de la capture.
