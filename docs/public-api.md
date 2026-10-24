# TETA League — Public API (v1)

Read-only REST API for an invited partner. Base URL: `https://www.tetaleague.com/api/v1`

## Authentication

Send the API key in a header (never in the URL):

```
Authorization: Bearer <API_KEY>
```
or `X-API-Key: <API_KEY>`.

| Status | Meaning |
|---|---|
| 200 | OK |
| 400 | Invalid query parameter |
| 401 | Missing or invalid API key |
| 404 | Season / league / team not found |
| 405 | Only `GET` is supported (POST, PUT, PATCH, DELETE, HEAD, OPTIONS are rejected) |
| 429 | Rate limit exceeded (`Retry-After` header tells when to retry) |
| 500 | Generic server error (no details are returned) |
| 503 | API not configured on the server |

Limits: **60 requests per minute per key**; repeated requests with a missing/wrong key are limited per client IP (10/min).
The counters live in server memory, so on a multi-instance deployment the effective limit is per instance.
Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. There are no CORS headers: call the API from a server, not from a browser.

All lists are paginated: `page` (default 1) and `per_page` (default 20, max 100; `top-scorers` max 50).
Response shape: `{ "data": [...], "meta": { "page", "per_page", "total", "total_pages", ... } }`. Errors: `{ "error": { "code", "message" } }`.
`season` is a season slug (default: the active season).

## Endpoints

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /standings` | `season`, `league` (uuid), paging (default 100) | Ranked league tables (points, goal difference, goals for, wins, name) |
| `GET /teams` | `league` (uuid), `active` (`true`/`false`), paging | `id, name, slug, logo_url, is_active` |
| `GET /players` | `q` (username prefix, 2+ chars), `season`, paging | Public profile (`id, username, avatar_url, primary_position, alternative_positions, platform`) and that season's stats |
| `GET /matches` | `season`, `league`, `week` (1-200), `team` (slug), `status` (`SCHEDULED`, `COMPLETED`, `POSTPONED`, `CANCELLED`, `FORFEITED`), paging | Fixtures; `result` is only set for approved matches |
| `GET /stats/top-scorers` | `season`, `league` (uuid), paging (max 50) | Goal ranking (`rank, player, team (with league), goals, assists, matches_played`) |

## Never returned

E-mail addresses, real names, bios, social links, EA identifiers, session data, audit logs, admin data, match screenshots,
reviewer/submitter ids, internal notes, and the score of matches that are not approved. Every query selects an explicit
column allow-list (`lib/public-api-routes.ts`, `COLUMNS`) with the anonymous (publishable) Supabase key, so existing RLS
policies still apply and the `service_role` key is never used.

## Server configuration

Environment variable (server-side only, **not** `NEXT_PUBLIC_*`), in `.env.local` locally and in the Vercel project settings:

```
TETA_PUBLIC_API_KEY=<random secret, at least 32 characters>
```

Generate a key (do not commit or paste it anywhere):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

If the variable is missing or shorter than 32 characters the API answers `503`. To rotate or revoke access, change the
variable and redeploy; the old key stops working immediately.

## Examples

```bash
export TETA_API_KEY='<your key>'   # shell variable only

curl -s -H "Authorization: Bearer $TETA_API_KEY" "https://www.tetaleague.com/api/v1/standings"
curl -s -H "Authorization: Bearer $TETA_API_KEY" "https://www.tetaleague.com/api/v1/teams?per_page=50"
curl -s -H "Authorization: Bearer $TETA_API_KEY" "https://www.tetaleague.com/api/v1/players?q=ab&per_page=10"
curl -s -H "Authorization: Bearer $TETA_API_KEY" "https://www.tetaleague.com/api/v1/matches?week=3&team=alfa"
curl -s -H "Authorization: Bearer $TETA_API_KEY" "https://www.tetaleague.com/api/v1/stats/top-scorers?per_page=10"
```

## Tests

`node --no-warnings tests/test-public-api.mjs` (auth, methods, rate limits, parameters, column allow-lists, response shapes, error hygiene).
