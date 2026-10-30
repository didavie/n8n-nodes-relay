# Contributing

Thank you for helping improve the Relay nodes for n8n.

## Before you start

- For a bug, open an [issue](https://github.com/didavie/n8n-nodes-relay/issues) with the n8n version, the node and operation, what you expected and what happened. Remove API keys and customer data from logs and screenshots.
- For a new feature, open an issue first so we can agree on the design.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Set up

Node.js 20 or later is required.

```bash
git clone https://github.com/didavie/n8n-nodes-relay.git
cd n8n-nodes-relay
npm ci
npm run build
```

`npm run dev` starts a local n8n with the nodes loaded.

## Checks

Every pull request must pass:

```bash
npm run lint           # n8n community node rules
npm run format:check   # Prettier (npm run format to fix)
npm run typecheck
npm test
npm run build
```

Tests mock HTTP, so they need no key. For a live check, use a sandbox key from [relaysandbox.didavie.com](https://relaysandbox.didavie.com) (see the README). Never commit keys or `creds.json` files.

## Pull requests

- One topic per pull request, with tests for new behaviour.
- Keep the request bodies in line with the [Relay API reference](https://github.com/didavie/relay-api).
- Use clear commit messages in the imperative mood, for example `fix: keep the order id on agency creates`.
- Add a line to `CHANGELOG.md` under an `Unreleased` heading.

By contributing, you agree that your work is released under the [MIT License](LICENSE).
