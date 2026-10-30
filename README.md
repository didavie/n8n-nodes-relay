# n8n-nodes-relay

[n8n](https://n8n.io) community nodes for [Relay](https://relay.didavie.com) deliveries, by Didavie.

Create, track, list and cancel Relay deliveries, get a delivery price, and start a workflow when a delivery changes status.

[Version française](README.fr.md)

- **Relay**: Delivery (Create, Get, Get Many, Cancel) and Pricing (Estimate). Also usable as a tool by n8n agents.
- **Relay Trigger**: starts a workflow when a delivery changes status (polling).

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Credentials](#credentials)
- [Try it with the sandbox](#try-it-with-the-sandbox)
- [Operations](#operations)
- [Relay Trigger](#relay-trigger)
- [Webhooks](#webhooks)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Support](#support)
- [License](#license)

## Requirements

- n8n 1.x, self-hosted (community nodes are installed by the instance owner or an admin).
- A Relay API key. Either kind works:

| Key         | Where to get it                                                                       | Prefix                                     |
| ----------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| Shop key    | Relay Partners > Shop > Connect my website                                            | `rb_live_`                                 |
| Agency key  | Agency dashboard > Developers                                                         | `relay_pk_live_`                           |
| Sandbox key | [relaysandbox.didavie.com](https://relaysandbox.didavie.com), no Relay account needed | `rb_sbx_` (shop), `relay_pk_sbx_` (agency) |

The node reads the key prefix and sends the right request for each kind (order id field, address fields, idempotency header, cancel reason field, estimate points). Fields that a key kind does not accept are left out and listed in `ignored_fields` on the output.

## Install

In n8n: **Settings > Community Nodes > Install**, enter `n8n-nodes-relay`, accept the notice and install. See the [n8n guide](https://docs.n8n.io/integrations/community-nodes/installation/gui-install/).

Manual install (queue mode, Docker images with a mounted `~/.n8n`):

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-relay
# then restart n8n
```

From a clone of this repository:

```bash
npm ci
npm run build
npm pack                       # creates n8n-nodes-relay-<version>.tgz
cd ~/.n8n/nodes && npm install /path/to/n8n-nodes-relay-<version>.tgz
# then restart n8n
```

## Credentials

Create a **Relay API** credential:

- **API Key**: your shop, agency or sandbox key.
- **Environment**:
  - _Automatic_ (default): sandbox keys go to `https://relaysandbox.didavie.com/api/v1`; live keys go to `https://relaypartner.didavie.com/api/v1`.
  - _Production_ or _API Sandbox_: force one host. A sandbox key always uses the sandbox, whatever you choose.
  - _Custom URL_: only when Relay gives you another API address (full `https://` URL ending in `/api/v1`).

The credential test calls `GET /api/v1/me`.

Keep keys in n8n credentials only. Never paste a key into a node parameter, a workflow note or a shared workflow file.

## Try it with the sandbox

You do not need a Relay account to try the nodes.

1. Create a free account on [relaysandbox.didavie.com](https://relaysandbox.didavie.com) and create a key (`rb_sbx_...` for a shop, `relay_pk_sbx_...` for an agency).
2. Paste it in a **Relay API** credential. Leave the environment on _Automatic_.
3. Run **Delivery > Create**. The delivery is fake: no driver, no payment. It moves through the statuses on its own, and the sandbox simulator can force any status.

Sandbox limits: 60 requests per minute per key, 50 deliveries a day, 30 open at once. Sandbox accounts are deleted after 30 days. Sandbox keys are refused by production, and production keys are refused by the sandbox.

## Operations

| Resource | Operation | API call                                                        |
| -------- | --------- | --------------------------------------------------------------- |
| Delivery | Create    | `POST /api/v1/packages`                                         |
| Delivery | Get       | `GET /api/v1/packages/{tracking_code}`                          |
| Delivery | Get Many  | `GET /api/v1/packages` (pages of 100, optional status filter)   |
| Delivery | Cancel    | `PATCH /api/v1/packages/{tracking_code}/cancel` (before pickup) |
| Pricing  | Estimate  | `GET /api/v1/pricing/estimate`                                  |

**Create.** _Order ID_ is your order number. Sending the same order ID again returns the existing delivery (`idempotent: true`) instead of creating a second one, so retries are safe. Shop keys send it as `platform_order_id`; agency keys send it as `external_order_id` and as the `Idempotency-Key` header. Agency keys need a delivery address of at least 10 characters. With a shop key, _Dry Run_ (`test: true`) checks everything and computes the price without creating anything.

**Estimate.** Shop keys can send only the delivery point (the pickup point saved on the shop is used), or leave the coordinates at 0 and give a _Delivery Address_ that Relay geocodes. They get a `quote_id`, valid about 15 minutes and usable once: pass it to Create (Additional Fields > Quote ID) to keep that price. Agency keys must send the pickup and delivery points.

**Get and Get Many.** With _Simplify_ on (default), shop and agency results have the same flat shape, with `tracking_code`, `status` and `order_id` at the top level. Shop-key results of Create and Get also carry `tracking_url`, the public tracking page you can send to your customer.

**Cancel.** Free until the driver picks the package up. After pickup Relay answers `409 CANNOT_CANCEL`.

## Relay Trigger

Polls `GET /api/v1/packages` on the schedule you choose and emits one item per delivery whose status changed since the last poll, with `previous_status` and `event: "status_changed"`.

- Shop keys: only deliveries changed since the last poll are fetched, through `updated_since`.
- Agency keys: the most recent deliveries are checked (200 by default, see _Deliveries Checked per Poll_).
- Each tracking code and status pair is emitted once. The first poll after activation only records the current statuses.
- Options: filter on some statuses, also emit new deliveries (`event: "created"`), number of deliveries checked per poll.

## Webhooks

For real-time events, Relay also sends signed webhooks (`package.picked_up`, `package.delivered`, `package.cancelled`, `package.failed`, and `webhook.test`). Set the URL on the Connect my website page (shop keys) or the Developers page (agency keys), receive it with an n8n **Webhook** node, and check the `X-Relay-Signature` header as shown in [relay-api](https://github.com/didavie/relay-api/tree/main/webhooks).

## Examples

**New paid order to Relay delivery.** Trigger (your shop or form) > **Relay: Pricing > Estimate** with the customer address > **Relay: Delivery > Create** with the same order ID and the `quote_id` > send `tracking_url` to the customer by e-mail or SMS.

**Tell the customer when the parcel is out.** **Relay Trigger** with statuses `picked_up` and `delivered` > your messaging node.

**Daily report.** Schedule > **Relay: Delivery > Get Many** (Return All) > spreadsheet node.

## Troubleshooting

| Message                                               | What to do                                                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_API_KEY`                                     | The key is unknown or revoked. Create a new one and update the credential.                                                       |
| `INVALID_KEY_FORMAT`                                  | The key is not a Relay key, or a sandbox key was sent to production (or the reverse). Leave the environment on _Automatic_.      |
| `SHOP_KEY_NOT_ALLOWED`                                | The route is for agency keys only (drivers, zones, assign, credit pricing).                                                      |
| `SHOP_NOT_APPROVED`, `SHOP_INACTIVE`, `SHOP_PAUSED`   | The shop cannot use the API right now. Contact Relay support.                                                                    |
| `QUOTE_EXPIRED`, `QUOTE_USED`, `QUOTE_MISMATCH`       | Get a new estimate, then create with the new `quote_id` and the same points.                                                     |
| `CANNOT_CANCEL`, `CANNOT_EDIT`                        | The driver already picked the package up.                                                                                        |
| `DAILY_LIMIT`, `PENDING_LIMIT`, `RATE_LIMIT_EXCEEDED` | A limit was reached. Wait for the time in the `Retry-After` header.                                                              |
| The trigger never fires                               | The first poll only records statuses. Change a delivery status (in the sandbox, use the simulator), then wait for the next poll. |

The full list of error codes is in [relay-api](https://github.com/didavie/relay-api/blob/main/docs/errors.md).

## Development

```bash
npm ci
npm run build          # n8n-node build
npm run lint           # n8n community node lint rules
npm run format:check   # Prettier
npm test               # unit tests, HTTP mocked
```

Live check against the sandbox (creates one fake delivery, then cancels it):

```bash
npm run build
RELAY_CREDENTIALS_FILE=/path/to/creds.json npm run live-check
```

`creds.json` is `{ "apiKey": "rb_sbx_xxxxxxxxxxxx", "environment": "auto" }`. Keep it outside the repository. `RELAY_SANDBOX_URL` points the sandbox host at another copy of the sandbox if you run one.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Support

- API reference: [relaypartner.didavie.com/en/developers](https://relaypartner.didavie.com/en/developers)
- OpenAPI spec, examples and webhook verifiers: [github.com/didavie/relay-api](https://github.com/didavie/relay-api)
- Bugs and feature requests: [GitHub issues](https://github.com/didavie/n8n-nodes-relay/issues)
- E-mail: relay@didavie.com
- Security issues: see [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE). Relay is a product of Didavie.
