---
name: cloudflare-domain
description: Inspect or change Annot8's Cloudflare DNS and redirect rules for ksprashu.dev (anot8 subdomain, ksprashu.dev/anot8 redirect). Use when the custom domain, DNS records, or URL redirects need checking or editing.
---

# Annot8 domain on Cloudflare

Annot8 is a static site on GitHub Pages (`.github/workflows/deploy-pages.yml`).
Cloudflare only provides DNS and edge redirects for `ksprashu.dev`; there are no
Workers and nothing billable.

## Current setup

| What | Value |
|---|---|
| Zone | `ksprashu.dev` (nameservers `keanu`/`sara.ns.cloudflare.com`) |
| App DNS | `CNAME anot8 -> ksprashu.github.io`, **DNS only** (grey cloud) so GitHub can issue its certificate |
| GitHub Pages custom domain | `anot8.ksprashu.dev`, HTTPS enforced |
| Path redirect | Redirect Rule (phase `http_request_dynamic_redirect`): `ksprashu.dev/anot8` and `/anot8/...` -> 301 `https://anot8.ksprashu.dev/...`, query string preserved |
| Apex `ksprashu.dev` | Proxied A/AAAA records to a separate Google-hosted site; do not modify |
| Zone id | `08d2f4b0c6a7dc138388f86ef724c42e` (Free plan) |

Redirect rule:

```
expression:  (http.host eq "ksprashu.dev" and (http.request.uri.path eq "/anot8" or starts_with(http.request.uri.path, "/anot8/")))
target:      concat("https://anot8.ksprashu.dev", substring(http.request.uri.path, 6))
status:      301, preserve_query_string: true
```

## How to make changes

Use the `cloudflare-api` MCP server from `.mcp.json` (`https://mcp.cloudflare.com/mcp`,
OAuth sign-in via `/mcp`). Use its `search` tool to find the endpoint, then `execute`.

- Find the zone id: `GET /zones?name=ksprashu.dev`.
- Redirect rules live in the zone's `http_request_dynamic_redirect` phase entrypoint
  ruleset. Read it first and **append or update** only the Annot8 rule. A `PUT` on the
  entrypoint replaces every rule in the phase, so never send a partial list.
- Do not toggle the proxy on the `anot8` record.

## Verify

```bash
curl -sI https://ksprashu.dev/anot8          # 301, Location: https://anot8.ksprashu.dev/
curl -sI "https://ksprashu.dev/anot8/?a=1"   # query string preserved
curl -s -o /dev/null -w "%{http_code}\n" https://anot8.ksprashu.dev/   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://ksprashu.dev/          # apex unaffected
```
