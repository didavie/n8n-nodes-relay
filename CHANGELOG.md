# Changelog

All notable changes to this package are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-29

### Added

- **Relay** node: Delivery (Create, Get, Get Many, Cancel) and Pricing (Estimate), also usable as a tool by n8n agents.
- **Relay Trigger** node: polls deliveries and emits each status change once.
- **Relay API** credential for shop keys (`rb_live_`, `rb_test_`) and agency keys (`relay_pk_live_`, `relay_pk_test_`), with the credential test on `GET /api/v1/me`.
- Sandbox keys (`rb_sbx_`, `relay_pk_sbx_`) go to `relaysandbox.didavie.com` automatically.
- Idempotent create by order ID, estimate by delivery address and `quote_id` for shop keys, public `tracking_url` on shop results.

[0.1.0]: https://github.com/didavie/n8n-nodes-relay/releases/tag/v0.1.0
