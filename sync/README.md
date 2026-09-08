# WARDOGS lobby Worker

Cloudflare Worker + SQLite-backed Durable Objects for the optional collaborative lobby feature.

Deployment, configuration, cost controls and local test instructions are in [`../docs/lobbies.md`](../docs/lobbies.md). The public-source threat model, production headers and incident procedure are in [`../docs/security.md`](../docs/security.md).

Quick verification:

```sh
npm ci
npm test
npx wrangler deploy --dry-run
```
