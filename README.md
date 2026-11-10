# LVX Terminator — BNB Arena

Module autonome de missions de sécurité pour LVX. Un utilisateur soumet un extrait de code, reçoit un rapport de signaux de sécurité et gagne des XP de démonstration. Une revue humaine peut autoriser une récompense en tBNB sur BSC Testnet.

**État : prototype local. Aucun déploiement ni identité ERC-8004 vérifiée ne sont revendiqués.** Le moteur est une analyse statique heuristique : il ne prouve pas l'exploitabilité d'une faille et ne remplace pas un audit professionnel. Les montants crypto affichés restent nuls avant confirmation onchain.

## Démarrer

Node 24 minimum pour le serveur local (SQLite intégré). Le runtime officiel Studio utilise Node 22 minimum.

```sh
npm ci
npm test
npm run typecheck
npm start
```

Ouvrir http://127.0.0.1:3000. Le bouton « Charger un exemple » fournit du code à analyser, sans l'exécuter. Le serveur conserve uniquement les rapports expurgés dans `data/`, jamais le texte source reçu. Un même texte produit le même identifiant : le soumettre plusieurs fois ne crée pas plusieurs missions.

Avec Doppler déjà connecté :

```sh
doppler run --project lvx --config bnb -- npm start
```

Le projet Doppler séparé `bnbprojet` n'a pas pu être créé : limite de dix projets atteinte. L'environnement dédié `bnb` dans `lvx` contient exclusivement la configuration de ce module. Le dépôt et les processus applicatifs restent séparés de LVX.

## Organisation

- `modules/bnb-agent/` : moteur d'audit, serveur, interface et récompenses testnet.
- `studio/lvxterminator/` : agent officiel généré avec BNB Agent Studio 0.0.16.
- `scripts/studio-sync.mjs` : copie de compilation du moteur partagé vers le paquet Studio.
- `integrations/lvx/` : contrat d'intégration public et configuration ; aucun code privé LVX.

Le dépôt officiel de l'atelier [RomThpt/bnb](https://github.com/RomThpt/bnb) fournit le guide de construction. Le source de LVX a été identifié dans `vgactech/artcbx`, dépôt privé. Son intégration est proposée dans [artcbx#3](https://github.com/vgactech/artcbx/pull/3). Le site Lovable et le dépôt ne présentent pas le même commit : la synchronisation de la publication doit encore être confirmée.

## Récompenses

Le mode normal fonctionne sans clé blockchain. Les XP sont des points de démonstration ; ils ne sont pas des tokens. Une rémunération réelle exige une mission recevable, une revue humaine et une action d'administration explicite.

Le transfert disponible est limité à **BSC Testnet, chainId 97** et utilise une trésorerie de test distincte. Le serveur enregistre l'état d'envoi avant diffusion et bloque toute nouvelle tentative sur la même mission. Un hash signifie « soumis », pas « payé ». Un résultat incertain doit être rapproché manuellement avec le portefeuille avant toute nouvelle opération. Le plafond du composant d'envoi est de 0,001 tBNB ; le montant fixe du serveur est de 0,0001 tBNB.

Administration (jeton fourni uniquement par Doppler) :

```sh
doppler run --project lvx --config bnb -- node scripts/admin.mjs review AUDIT_ID --approve --recipient 0x...
# Après validation, avec une trésorerie testnet dédiée configurée :
doppler run --project lvx --config bnb -- node scripts/admin.mjs reward AUDIT_ID --recipient 0x... --send-testnet
```

Variables à fournir via Doppler pour activer ce parcours : `BNB_ADMIN_TOKEN`, `BNB_TREASURY_PRIVATE_KEY`, éventuellement `BNB_RPC_URL`. La clé de trésorerie n'est pas configurée dans la démonstration. Ne pas réutiliser une clé ou des fonds LVX. `.env.example` décrit les paramètres sans valeur secrète.

## Studio et soumission

Voir [le parcours Studio](docs/STUDIO.md), [l'intégration LVX](integrations/lvx/README.md) et [les informations de soumission](docs/SUBMISSION.md). La présence d'un portefeuille local ne constitue pas une identité d'agent enregistrée onchain.

## Limites de cette version

Prototype local mono-utilisateur : l'historique est partagé et le stockage SQLite nécessite un volume persistant. L'interface n'est pas un service multi-tenant prêt à héberger publiquement. Les règles examinent seulement le texte soumis, sans scanner de réseau, cloner de dépôt ni exécuter de commande. La réputation, la résistance aux variantes artificielles d'un même bug et l'attribution du code restent des sujets de produit à développer.

La vente d'audits est la proposition commerciale ; les routes de démonstration Studio sont gratuites. Aucun revenu, paiement LLM autonome ou règlement de mission n'est présenté comme réalisé.
