# Informations de soumission — BNB Builder Sessions Paris

## Informations connues

- Nom : Gabriel Chaves
- E-mail : vgac4237@gmail.com
- Nom du projet : LVX Terminator
- Dépôt : https://github.com/vgactech/BNBPROJET
- Adresse ou ID d'agent sur BSC Testnet : **laisser vide tant qu'aucun enregistrement n'est déployé et vérifié**.

Phrase de présentation :

> LVX Terminator propose des rapports de sécurité sur le code source sous forme de missions gamifiées, avec des récompenses en crypto testnet après validation humaine des résultats.

Cette phrase décrit l'offre et le parcours prévu. La version locale utilise des règles statiques ; les récompenses ne sont pas encore versées et aucune identité onchain n'est revendiquée.

## Retour d'expérience factuel

- CLI Studio 0.0.16 installée ; agent TypeScript généré, compilé et exécuté localement.
- Runtime officiel : `/ping` HEALTHY, route x402 gratuite HTTP 200, devis A2A signé hors chaîne.
- Nouveau wallet de test : `0xa0306c8A803a8e29Aea8bBe5295A70A7e4176682` ; non financé, sans identité onchain enregistrée.
- Moteur d'audit partagé entre la démo et le runtime officiel.
- Installation des skills d'éditeur essayée : Claude Code absent de cet environnement Codex.
- Connexion RPC du diagnostic corrigée avec `NODE_USE_ENV_PROXY=1`.
- Aucun déploiement ni vérification onchain réalisé.

Pour « Jusqu'où êtes-vous arrivé ? », sélectionner **« Exécuté localement »** : le runtime officiel a effectivement démarré et répondu aux requêtes. Ne pas sélectionner les étapes de déploiement ou de vérification onchain.

Première amélioration suggérée pour BNB :

> Proposer un diagnostic unique qui vérifie le proxy réseau, Bun, le portefeuille et l'éditeur réellement disponible, avec une commande de correction adaptée. Clarifier la différence entre génération, exécution locale et identité onchain vérifiée, ainsi que les fichiers exacts à personnaliser pour le métier.

Temps perdu observé : installation/outillage, intégration du hook métier, configuration réseau et prérequis de portefeuille. Les notes de satisfaction et de recommandation doivent refléter votre avis ; elles ne sont pas déduites des tests techniques.

Éditeur utilisé dans cette session : **Codex**. Si le formulaire ne propose que Cursor ou Claude Code, renseigner ce point dans le commentaire libre plutôt que déclarer un éditeur non utilisé.

## Pitch de 90 secondes

LVX Terminator transforme la revue de code en missions. Un développeur soumet un extrait ; l'agent produit un rapport structuré, avec gravité, ligne et correction proposée. Les signaux détectés ne déclenchent pas automatiquement un paiement : une revue humaine valide les résultats avant toute récompense.

Le module BNB reste isolé de LVX. Son moteur TypeScript est aussi relié à l'agent officiel BNB Agent Studio. La démonstration fonctionne localement ; le parcours de récompense est limité à BSC Testnet et protégé contre les doubles envois. La prochaine étape est de déployer l'agent, vérifier son identité onchain et tester le paiement avec une trésorerie dédiée.
