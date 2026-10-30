# n8n-nodes-relay

Nœuds communautaires [n8n](https://n8n.io) pour les livraisons [Relay](https://relay.didavie.com), par Didavie.

Créez, suivez, listez et annulez des livraisons Relay, obtenez un prix de livraison, et lancez un workflow quand une livraison change de statut.

[English version](README.md)

- **Relay** : Livraison (créer, obtenir, lister, annuler) et Prix (estimation). Utilisable aussi comme outil par les agents n8n.
- **Relay Trigger** : lance un workflow quand une livraison change de statut (interrogation régulière).

## Prérequis

- n8n 1.x auto-hébergé (les nœuds communautaires sont installés par le propriétaire ou un administrateur de l'instance).
- Une clé API Relay :

| Clé          | Où la créer                                                                     | Préfixe                                        |
| ------------ | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Clé boutique | Relay Partenaires > Boutique > Connecter mon site                               | `rb_live_`                                     |
| Clé agence   | Tableau de bord agence > Développeurs                                           | `relay_pk_live_`                               |
| Clé sandbox  | [relaysandbox.didavie.com](https://relaysandbox.didavie.com), sans compte Relay | `rb_sbx_` (boutique), `relay_pk_sbx_` (agence) |

Le nœud lit le préfixe de la clé et envoie la bonne requête pour chaque type. Les champs qu'un type de clé n'accepte pas sont retirés et listés dans `ignored_fields`.

## Installation

Dans n8n : **Settings > Community Nodes > Install**, saisissez `n8n-nodes-relay`, acceptez l'avertissement puis installez.

Installation manuelle :

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-relay
# puis redémarrez n8n
```

## Identifiant « Relay API »

- **API Key** : votre clé boutique, agence ou sandbox.
- **Environment** : _Automatic_ (par défaut) envoie les clés sandbox vers `https://relaysandbox.didavie.com/api/v1`, et les clés réelles vers `https://relaypartner.didavie.com/api/v1`. _Custom URL_ ne sert que si Relay vous donne une autre adresse.

Le test de l'identifiant appelle `GET /api/v1/me`. Gardez la clé dans les identifiants n8n uniquement.

## Tester avec la sandbox

1. Créez un compte gratuit sur [relaysandbox.didavie.com](https://relaysandbox.didavie.com) et créez une clé.
2. Collez-la dans l'identifiant **Relay API**, environnement _Automatic_.
3. Lancez **Delivery > Create** : la livraison est fictive (aucun livreur, aucun paiement) et avance seule ; le simulateur de la sandbox force n'importe quel statut.

Limites de la sandbox : 60 requêtes par minute et par clé, 50 livraisons par jour, 30 ouvertes en même temps, comptes supprimés après 30 jours.

## Opérations

| Ressource | Opération | Appel API                                                               |
| --------- | --------- | ----------------------------------------------------------------------- |
| Delivery  | Create    | `POST /api/v1/packages`                                                 |
| Delivery  | Get       | `GET /api/v1/packages/{tracking_code}`                                  |
| Delivery  | Get Many  | `GET /api/v1/packages`                                                  |
| Delivery  | Cancel    | `PATCH /api/v1/packages/{tracking_code}/cancel` (avant la récupération) |
| Pricing   | Estimate  | `GET /api/v1/pricing/estimate`                                          |

- Le numéro de commande (_Order ID_) rend la création idempotente : un nouvel envoi avec le même numéro renvoie la livraison existante.
- L'estimation d'une clé boutique renvoie un `quote_id` (valable environ 15 minutes, une seule fois) : passez-le à la création pour garder le prix affiché au client.
- Les résultats d'une clé boutique contiennent `tracking_url`, la page de suivi publique à envoyer au client.

## Déclencheur et webhooks

Le déclencheur interroge Relay à intervalle régulier et ne signale chaque changement de statut qu'une seule fois. La première interrogation après l'activation enregistre seulement les statuts actuels.

Pour du temps réel, utilisez les webhooks signés de Relay avec le nœud **Webhook** de n8n et vérifiez l'en-tête `X-Relay-Signature` (exemples dans [relay-api](https://github.com/didavie/relay-api/tree/main/webhooks)).

## Problèmes fréquents

| Message                                               | Que faire                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `INVALID_API_KEY`                                     | Clé inconnue ou révoquée : créez-en une nouvelle.                                           |
| `INVALID_KEY_FORMAT`                                  | Clé sandbox envoyée en production (ou l'inverse) : laissez l'environnement sur _Automatic_. |
| `QUOTE_EXPIRED`, `QUOTE_USED`, `QUOTE_MISMATCH`       | Demandez une nouvelle estimation.                                                           |
| `CANNOT_CANCEL`                                       | Le colis a déjà été récupéré par le livreur.                                                |
| `DAILY_LIMIT`, `PENDING_LIMIT`, `RATE_LIMIT_EXCEEDED` | Limite atteinte : attendez la durée de l'en-tête `Retry-After`.                             |

## Assistance

- Référence API : [relaypartner.didavie.com/fr/developers](https://relaypartner.didavie.com/fr/developers)
- Problèmes et demandes : [GitHub issues](https://github.com/didavie/n8n-nodes-relay/issues)
- E-mail : relay@didavie.com
- Failles de sécurité : voir [SECURITY.md](SECURITY.md)

## Licence

[MIT](LICENSE). Relay est un produit de Didavie.
