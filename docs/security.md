# Security hardening

## Threat model

The repository is public. Treat every URL, protocol message, validation rule,
limit and client-side check as known to an attacker. Security must come from
server-side validation, unguessable identifiers, Cloudflare bindings and
strict cost ceilings—not from hidden JavaScript or undocumented paths.

The browser is untrusted. The sync Worker holds no server-side secret today:
a room's code is itself the bearer credential for joining it, not a signed
token the browser could leak.

## Controls implemented in the repository

- Room *creation* is restricted to configured browser origins
  (`ALLOWED_ORIGINS` in `sync/wrangler.jsonc`). Joining an existing room is
  deliberately not gated by this list: the room code is the credential, and
  invite links get opened from contexts an origin allowlist cannot enumerate.
  Requests with no `Origin` header (curl, native clients, the test suite) are
  allowed through—an origin allowlist is a browser-tab defence, not
  authentication.
- Every room enforces per-table caps (`LIMITS.drawings`, `.markers`,
  `.targets`, `.guns`, `.peers`, `.viewers` in `sync/src/ops.js`) and
  coordinate/zoom bounds, so a room cannot be grown or malformed past what the
  Durable Object was sized for.
- Each WebSocket connection is token-bucket rate-limited per op type
  (`LIMITS.opsPerSecond`/`opsBurst`, `.cursorsPerSecond`/`cursorBurst`,
  `.viewsPerSecond`/`viewBurst` in `sync/src/room.js`). Buckets live in memory
  only and are dropped on hibernation.
- Cursor/participant names strip control characters and are length-capped
  before storage or broadcast.
- Full snapshots are sent only when a WebSocket joins; all other traffic is
  incremental, normalized ops.
- Room state is SQLite-backed (`new_sqlite_classes` in `sync/wrangler.jsonc`),
  which is required on the Workers Free plan and is the only backend where a
  room's drawings can exceed the 128 KiB per-value cap key-value storage would
  impose.
- Production HTML receives a restrictive CSP at build time. It allowlists the
  site, the R2 tile host, the sync Worker's origin for the collaboration
  WebSocket, and the Umami tracker at `https://cloud.umami.is` /
  `https://gateway.umami.is` only when analytics is enabled. Inline event
  handlers, plugins, arbitrary frames and unexpected network destinations are
  blocked.
- The local development server binds to loopback by default, validates `Host`,
  serves only public application paths and rejects symlink escapes.
- CI actions are pinned to full commits. Pull requests run tests, dependency
  audit, production build verification and a Worker dry run. Dependabot tracks
  both npm projects and GitHub Actions.

## Cloudflare response headers

The generated CSP works as a `<meta http-equiv>` policy, but `frame-ancestors`
is valid only in an HTTP response header. In the Cloudflare zone, create a
**Transform Rule → Modify Response Header** restricted to the application host
(`http.host eq "wardogs-map.olm.pet"`) and set:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=()` |
| `Strict-Transport-Security` | `max-age=31536000` |

Add `includeSubDomains` to HSTS only after confirming that every current and
future subdomain is HTTPS. Do not request browser preload until that condition
is permanent. Keep the rule scoped to the site host; the Worker already emits
API-specific headers and R2 needs its own CORS/cache policy.

Verify after deployment:

```powershell
curl.exe -I "https://wardogs-map.olm.pet/"
```

## Cloudflare and GitHub settings

1. Keep the Worker custom domain proxied and `workers_dev=false`.
2. Keep R2 API tokens scoped to the one bucket and only the operations needed
   by the upload process. Never put an R2 token in site configuration or CI
   logs. Rotate any token that has ever been committed or pasted publicly.
3. Keep R2 CORS limited to real site origins plus the exact local origin used
   for development. CORS reduces browser misuse; it is not access control.
4. In the GitHub repository, enable secret scanning and push protection where
   available. Protect `main`: require a pull request, require the Security
   checks workflow, block force pushes and block branch deletion.

Test origin enforcement against the custom domain:

```powershell
$workerUrl = "https://wardogs-map-sync.olm.pet"
curl.exe -i -H "Origin: https://some-fork.example" "$workerUrl/"
curl.exe -i -H "Origin: https://wardogs-map.olm.pet" "$workerUrl/"
```

The first request must be `403 forbidden-origin` for room-creation requests;
a successful CORS response alone is not proof of authorization—joining still
requires knowing the room code.

## Secrets and incident response

- The sync Worker currently holds no server-side secret to rotate; a
  compromised room is addressed by creating a new room and sharing its code
  out of band, not by rotating a credential.
- Revoke and replace compromised R2 tokens, review Cloudflare usage, and check
  Git history—not only the current tree—before considering a leaked credential
  removed.

## Remaining limitations

- A room code is a bearer credential. Anyone who has it can join and edit
  until the room expires from inactivity; there are no user accounts or
  per-member permissions.
- Files needed by a public browser—including R2 map tiles and terrain data—can
  be downloaded by users and forks. CORS, obscure paths and disabled bucket
  listing do not make public assets confidential. Preventing redistribution
  requires licensing/enforcement or an authenticated paid delivery design,
  which would add cost and still cannot stop an authorized client from copying.
- Production analytics, when enabled, loads the remote script from
  `https://cloud.umami.is` and allows event delivery to
  `https://gateway.umami.is`. The script executes with page privileges, so a
  compromise remains a supply-chain risk despite CSP. Self-hosting a reviewed,
  pinned bundle or disabling analytics is the way to remove that dependency.
  See [Analytics](analytics.md) for the event payload and privacy policy.
