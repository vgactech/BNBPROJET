# Raccordement au module BNB

LVX et BNB sont deux applications distinctes. LVX conserve son origine, son catalogue et ses mécanismes d'authentification. La navigation « Missions BNB » ouvre `/bnb`, qui intègre l'application BNB dans une iframe sur une autre origine et propose aussi une ouverture directe.

L'adaptateur LVX est dans la PR privée : https://github.com/vgactech/artcbx/pull/3 . Aucun fichier privé LVX n'est copié ici.

## Configuration

1. Lancer le module BNB en local pour la démonstration, ou le déployer sur une URL HTTPS réelle lorsque cela sera demandé.
2. Dans l'environnement du serveur **LVX**, définir `LVX_BNB_MODULE_URL` avec cette URL HTTPS. Cette variable n'est pas une clé secrète. Une valeur localhost ne convient pas à une iframe d'un site HTTPS public.
3. Le serveur LVX expose uniquement cette URL via `/api/bnb_config` ; les navigateurs ne reçoivent aucune clé Doppler ou blockchain.
4. Dans l'environnement du serveur **BNB**, définir `LVX_ORIGIN` avec l'origine exacte du site qui héberge l'iframe. Le serveur utilise cette valeur dans `frame-ancestors`.
5. Fusionner et publier la PR LVX seulement après validation de l'URL et du dépôt réellement synchronisé avec Lovable.

Le code BNB appartient à ce dépôt ; le code LVX appartient à son dépôt privé. Aucun partage implicite des clés, soldes, sessions ou catalogues n'est requis.

## API locale

| Méthode et route | Usage |
| --- | --- |
| `GET /api/status` | État réel du module et du parcours blockchain |
| `POST /api/audits` | Rapport sur `{source, filename}` |
| `GET /api/audits` | Historique expurgé et dédupliqué |
| `POST /api/audits/:id/review` | Revue humaine, jeton admin obligatoire |
| `POST /api/audits/:id/reward` | Récompense testnet après revue, jeton admin obligatoire |

Le module n'autorise pas les requêtes CORS depuis n'importe quelle origine. L'iframe utilise l'API sur sa propre origine. Le contexte local conserve un historique commun ; prévoir une identité utilisateur et un contrôle de propriété des missions avant une ouverture publique.
