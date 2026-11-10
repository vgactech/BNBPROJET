# Réponses à l'audit de reprise

État vérifié le 10 novembre 2026, après le premier instantané d'audit transmis.

## Questions de reprise

| Question | Réponse vérifiée |
| --- | --- |
| L'autre agent a-t-il seulement préparé la passerelle et Doppler ? | Non. L'application autonome, l'agent Studio et les adaptateurs sont présents dans BNBPROJET. |
| Studio CLI est-il installé ? | Oui, `@bnbagent/studio-cli` 0.0.16. Doppler CLI 3.77.1 est un outil distinct. |
| Agent généré et exécuté localement ? | Oui. Compilation, `/ping` HEALTHY, audit gratuit x402 HTTP 200 et offre A2A signée hors chaîne vérifiés. |
| Déployé sur BSC Testnet ? | Non. Aucun déploiement. |
| Identité ERC-8004 enregistrée et vérifiée ? | Non. Aucun ID onchain n'est revendiqué. |
| Éditeur utilisé ? | Codex ; choisir « Autre » quand cette option existe. |
| Doppler exploitable ? | Oui, compte connecté ; configuration dédiée `lvx / bnb` vérifiée, sans héritage des autres configurations. |
| Le dépôt BNBPROJET est-il vide ? | Non : premier code complet au commit `231b58a53ce1f4f613b85c59e4265b70274cc92c`. |
| LVX est-il déjà relié publiquement au module ? | Non. La PR privée artcbx#3 reste en brouillon, sans fusion. |
| Lovable affiche-t-il `/bnb` ? | Non. La route publique retourne HTTP 404 lors du contrôle navigateur. |

## Éléments vérifiables

- Dépôt BNB : https://github.com/vgactech/BNBPROJET
- Premier code applicatif : https://github.com/vgactech/BNBPROJET/commit/231b58a53ce1f4f613b85c59e4265b70274cc92c
- Passerelle LVX en revue : https://github.com/vgactech/artcbx/pull/3
- Site public contrôlé : https://artcbx-feature-flight.lovable.app
- Projet Lovable indiqué par le badge public : https://lovable.dev/projects/lovp_47fy831y0q9d79kz0tzxzb2h6e

Le site référence les sources `vgactech/artcbx`, mais ce lien ne prouve pas une synchronisation Lovable active. La révision publiée indiquée dans son HTML, `4fc49834d0870fbbafa9d7be86e573802f39265d`, n'a pas été résolue par l'API Git dans les deux dépôts initialement proposés. Une publication depuis une autre source reste possible.

## Ce que la version locale démontre

Un moteur TypeScript examine exclusivement le code fourni et produit des signaux de sécurité structurés. Ce moteur est déterministe : aucun LLM n'est activé. L'agent officiel utilise le même moteur et conserve le mécanisme de signature de Studio. Le wallet local est neuf, non financé et sans identité enregistrée.

Les rapports de la démo sont expurgés et persistants ; les extraits source ne sont pas stockés par le serveur BNB. Les XP ne sont pas des tokens. Les paiements exigent une revue humaine et une action d'administration. La disponibilité d'une fonction d'envoi testnet n'est pas une preuve qu'un paiement a eu lieu.

## Corrections issues de la reprise

L'audit examine le raccordement de bout en bout et la confidentialité de la configuration. Une URL de module comportant des identifiants ou des paramètres sensibles doit être rejetée côté serveur, avant d'être transmise au navigateur. L'état « configuré » ne doit pas prétendre que le service distant est disponible.

Le suivi des récompenses doit distinguer préparation, diffusion et reçu réussi. Le rapprochement vérifie le réseau 97, le hash, le destinataire et le montant. Il ne diffuse aucune transaction. Les états incertains ou annulés restent verrouillés contre une nouvelle tentative automatique.

## Validation après corrections

- 29 tests du module BNB réussis et vérification TypeScript valide.
- Compilation Studio et 2 tests du hook métier réussis.
- Véritable iframe LVX locale → BNB : chargement et soumission d’audit vérifiés.
- 32 configurations d’URL vérifiées dans chaque runtime LVX (C et Python), refus CSP et expiration de configuration contrôlés.
- Tests navigateur : états de récompense, absence de faux paiement, précision des tBNB et affichage mobile.
- Composant React portable pour Lovable : compilation et 19 cas d’URL vérifiés.
- Correctifs LVX publiés dans la PR #3, commit `174aa0b7666724edbe00e384feba9d90d7c4320b` ; aucune fusion.

## Limites conservées

Aucun financement, transfert réel, déploiement, fusion de PR ou publication Lovable n'a été effectué. Le parcours public LVX → BNB → blockchain ne peut donc pas être annoncé comme validé. La configuration Doppler du module est isolée dans le projet LVX faute de place pour un onzième projet ; elle n'établit pas une séparation IAM entre deux projets Doppler.
