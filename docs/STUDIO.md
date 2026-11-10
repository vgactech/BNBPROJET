# LVX terminator avec BNB Agent Studio

Le runtime officiel est isolé dans `studio/lvxterminator/`. Il a été généré avec
`@bnbagent/studio-cli@0.0.16`, sur BSC testnet, avec A2A et x402. Le moteur
d'audit reste dans `modules/bnb-agent/src/auditor.ts`. `scripts/studio-sync.mjs`
en crée une copie de compilation dans le périmètre déployable ; il n'existe pas
de seconde implémentation à maintenir.

`app/agent/src/auditWork.ts` attend une chaîne JSON de la forme :

```json
{"source":"const example = 'code à examiner';","filename":"example.ts"}
```

Il renvoie le rapport structuré, sans télécharger d'URL ni exécuter le code.
`buildRunWork()` dans `unifiedMain.ts` utilise ce moteur déterministe. L'audit
ne consomme pas de LLM. Les signatures et le contrôle des paiements restent
dans les fichiers officiels de Studio. Le hook de `sellerCore.ts` transmet
uniquement `spec.task`, obtenu par la vérification de la tâche signée, sans
l'envelopper dans une instruction LLM. Les preuves des constats sont générées
par les règles et ne reproduisent ni le code ni les valeurs des secrets.

## Installer et compiler

Prérequis : Node 22 minimum pour Studio (Node 24 pour la démo à la racine),
pnpm 10 et Bun 1.3 minimum pour un futur déploiement.

```sh
# Installation locale des outils depuis la racine du dépôt :
npm ci
export PATH="$PWD/node_modules/.bin:$PATH"
bag --version
cd studio/lvxterminator
pnpm install
pnpm --filter lvxterminator-agent build
```

Le hook `prebuild` synchronise automatiquement le moteur d'audit.
Pour préparer l'éditeur sur une machine avec Cursor ou Claude Code :

```sh
bag skills install --target both --scope project
```

Cette commande a été essayée dans l'environnement de travail ; elle échoue
car Claude Code n'y est pas installé. Cela ne bloque pas l'usage direct de la CLI
depuis Codex. Les instructions officielles ont été lues directement dans le
paquet installé : `skills/bnbagent-studio.md` et ses références
`scaffolding-agent`, `adding-to-project`, `operating`, `selling-via-8183` et
`selling-via-b402`. Le guide d'essai `use-bnb-trial` a aussi été consulté pour
documenter le parcours ultérieur. Aucun autre éditeur n'a été simulé.

## Exécution officielle et déploiement ultérieur

La démo sans portefeuille se lance à la racine avec `npm start`.
Le runtime officiel exige son propre portefeuille jetable, même pour signer
une offre gratuite. Un nouveau portefeuille exclusivement réservé à cette
démo a été généré localement, sans réutiliser de portefeuille LVX :
`0xa0306c8A803a8e29Aea8bBe5295A70A7e4176682`. Il n'a pas été financé.
Son mot de passe a été enregistré dans Doppler, projet `lvx`, configuration
`bnb`, nom `WALLET_PASSWORD`, via stdin, sans affichage. Le keystore chiffré
reste dans `.studio/wallets/` ; il n'est pas enregistré dans Git.

Pour relancer le runtime officiel dans cet environnement, depuis
`studio/lvxterminator/` :

```sh
export PATH="/workspace/work/tools/bin:/workspace/work/bnb-tools/node_modules/.bin:$PATH"
export NODE_USE_ENV_PROXY=1
export STORAGE_LOCAL_PATH=/workspace/work/studio-deliverables
bag doctor
bag dev --port 3101
```

Le mot de passe local reste dans `.studio/.env.local`, ignoré par Git ;
les clés chiffrées restent dans `.studio/wallets/`, hors du paquet déployé.
Les options LLM sont conservées dans la configuration générée, mais le
travail d'audit n'appelle pas ce fournisseur. `bag doctor` peut signaler le LLM
non activé. Si un futur agent emploie le LLM, `bag llm activate` active le
modèle `auto/free` sans dépôt ; la recharge automatique depuis le wallet est
désactivée. Aucun login à la plateforme BNB n'a été effectué.

La configuration actuelle utilise `storage.kind = "local"` pour la démo.
Sur une nouvelle machine, il faut créer son propre wallet de démonstration
avec `(cd app/agent && bag wallet new --generate-password)` ; ne pas copier
les clés de LVX. Pour un futur stockage IPFS autonome, sélectionner `ipfs`
et fournir son endpoint d'écriture. La plateforme hébergée injecte son
propre stockage ; cette préparation ne revendique aucun stockage IPFS vérifié.

## Vérifications réellement effectuées

- Bun `1.4.4` installé dans `/workspace/work/tools/bin/` depuis la release
  officielle `oven-sh/bun` ; SHA256 de l'archive vérifié contre son fichier
  officiel `SHASUMS256.txt`. Aucun exécutable global n'a été installé.
- Compilation TypeScript et deux tests du hook métier réussis : passage de
  la tâche signée au moteur, secret fictif absent du rapport, rejet des URL,
  annulation avant traitement.
- `bag doctor` avec `NODE_USE_ENV_PROXY=1` : RPC BSC testnet joignable,
  actif U du contrat vérifié, tarification gratuite reconnue et compilation
  ZIP réussie. Le fournisseur LLM reste non activé, ce qui est sans effet
  sur cet audit déterministe.
- Runtime officiel lancé avec `bag dev --port 3101` : `GET /ping` retourne
  `HEALTHY` ; sa carte expose `negotiate` et `notify_funded`.
- `POST /x402` retourne HTTP 200 et deux constats sur un exemple fictif ;
  aucune clé littérale de l'exemple ne figure dans la réponse.
- A2A `negotiate` retourne une enveloppe contenant `provider_sig` et
  `negotiation_hash`. Il s'agit d'une signature hors chaîne : aucun job
  n'a été créé ni financé et aucune transaction n'a été diffusée.

Exemple de requête gratuite sur le runtime local :

```sh
curl http://localhost:3101/x402 \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"{\"source\":\"eval(userInput);\",\"filename\":\"demo.ts\"}"}'
```

Le parcours ERC-8183 utilise la description du job comme entrée signée ;
elle peut être rendue publique lors de la création du job. Pour ce prototype,
réserver cette voie aux exemples publics. L'audit local ne publie aucun code.

Le parcours du workshop pour l'essai hébergé de 48 heures est :

```sh
bag platform login
bag platform credit
bag deploy prepare --provider bnb --backend aws
bag deploy --provider bnb --yes
bag deploy status --provider bnb
bag deploy verify --provider bnb
```

La connexion demande une validation GitHub par code d'appareil. Le testnet
hébergé reçoit le matériel de signature via son canal de secrets : utiliser
exclusivement un portefeuille jetable. L'identité ERC-8004 doit être vérifiée
après déploiement avec une URL publique réelle. L'essai est supprimé à son
expiration. Aucune adresse d'agent ni aucun ID onchain n'est revendiqué avant
réussite de ces étapes.

Le prix de démonstration est explicitement `price_usd = "0"` : x402 est une
route gratuite, sans règlement B402. Cela facilite la présentation locale ;
ce n'est pas une preuve de paiement ni de récompense en crypto. Une offre
payante exige une configuration marchande et une protection persistante
contre les rejouements avant déploiement.

## Sources et licences

- Guide du workshop : https://github.com/RomThpt/bnb (instructions, sans code applicatif).
- Documentation officielle : https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/
- CLI et runtime : paquets npm `@bnbagent/*`, versions épinglées ; licence Apache-2.0 déclarée par les paquets.
- Les dépôts privés de LVX ne sont pas copiés dans ce dépôt public.
