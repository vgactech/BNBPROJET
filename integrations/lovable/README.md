# Intégrer le module BNB dans le frontend LVX

Ce composant React est une intégration portable écrite pour BNBPROJET. Il ne
copie aucun code privé de LVX. Il est prêt à être intégré ; il n'a pas été
ajouté au site Lovable publié et aucun déploiement n'est revendiqué.

Le site `https://artcbx-feature-flight.lovable.app` fournit les données de
`vgactech/artcbx`, mais ses assets publics n'indiquent pas le dépôt de
synchronisation de son interface. Le frontend public utilise React avec
TanStack Router. Les deux connexions GitHub disponibles ne permettent pas
de retrouver son commit déployé. Il faut appliquer ce composant au vrai projet
frontend lors de la synchronisation, sans remplacer les fonctions LVX.

## Composant et configuration

Copier `BnbModule.tsx` dans un emplacement du frontend, par exemple
`src/modules/bnb/BnbModule.tsx`. React est sa seule dépendance d'interface.
Fournir l'origine du serveur de la démo, pas le runtime A2A brut ni une URL de
dépôt GitHub. Le serveur de la démo BNBPROJET fournit l'interface sur son URL
racine ; le runtime Studio est une API distincte.

Configurer dans le frontend :

```dotenv
# Développement uniquement, quand le frontend tourne lui aussi en local :
VITE_BNB_MODULE_URL=http://localhost:3000
```

Pour un frontend hébergé, utiliser l'origine HTTPS réelle du module après
son déploiement, par exemple `https://bnbsession.example.com`. Cette adresse
d'exemple n'est pas un déploiement existant. Une variable `VITE_*` est publique :
ne jamais y placer de secret. Le composant reçoit cette variable via sa prop :

```tsx
<BnbModule moduleUrl={import.meta.env.VITE_BNB_MODULE_URL} />
```

Seules les origines sans identifiants, chemin, query string ni fragment sont
acceptées. HTTP est limité à `localhost`, `127.0.0.1` ou `::1`, lorsque le
frontend parent est lui aussi sur une de ces adresses. L'origine du module
doit être différente de celle du frontend, y compris en développement.

## Exemple avec React Router

Ajouter la route dans le routeur existant, puis le lien dans sa navigation.
Adapter uniquement les chemins d'import au projet.

```tsx
import { Link, Route, Routes } from 'react-router-dom';
import BnbModule from './modules/bnb/BnbModule';

// Dans la navigation LVX existante :
<Link to="/bnb">BNB · LVX terminator</Link>

// À l'intérieur des Routes existantes :
<Route path="/bnb" element={
  <BnbModule moduleUrl={import.meta.env.VITE_BNB_MODULE_URL} />
} />
```

Le site Lovable observé utilise TanStack Router : conserver son routeur et
monter le même composant sur la route `/bnb` avec l'API de routes du projet.
L'exemple React Router est une option pour les frontends qui l'utilisent déjà ;
il ne faut pas installer un second routeur dans le site existant.

## Limites et permissions

L'iframe autorise seulement scripts, formulaires et origine propre au module.
L'égalité d'origine avec le frontend est refusée pour conserver l'isolation du
sandbox. Caméra, microphone, géolocalisation et paiement par l'API navigateur
sont désactivés. Aucun token, compte wallet ni session LVX n'est transmis par
une prop, un paramètre d'URL, un message ou un en-tête. Le lien direct utilise
la même origine validée et ouvre un onglet avec `noopener noreferrer`.

Le chargement d'une iframe ne prouve pas qu'un agent est disponible. Le texte
affiche seulement « Cadre chargé » et maintient le lien direct : le navigateur
peut bloquer l'intégration via CSP ou `X-Frame-Options` sans fournir d'erreur
exploitable. Si le frontend définit une CSP, ajouter seulement l'origine exacte
du module à `frame-src`. Le serveur du module doit autoriser l'origine réelle
du frontend via sa politique `frame-ancestors`, s'il en définit une.

Le composant ne déclenche ni connexion wallet, ni transfert, ni déploiement.
Le modèle de récompenses et l'état testnet sont ceux affichés par le module,
sans les déduire de la disponibilité du cadre.

Validation réalisée : compilation esbuild avec React externalisé ; cinq
origines autorisées et quatorze entrées refusées vérifiées, dont identifiants,
query string, fragments, chemin, même origine et HTTP local depuis un site
distant. Le composant n'a pas été testé dans le frontend Lovable source,
qui reste inaccessible avec les connexions actuelles.
