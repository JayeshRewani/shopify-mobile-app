# Mobile App (Shopify)

Embedded Shopify admin app that lets merchants design a phone storefront. The React Native app (`MobileAppFrame`) never holds an Admin token. It bootstraps a Storefront token from this server, then loads `publishedDesign` and the live catalog.

**Live host:** [https://shopify-mobile-app-tau.vercel.app](https://shopify-mobile-app-tau.vercel.app)

Built on [Shopify App React Router](https://shopify.dev/docs/api/shopify-app-react-router), Prisma (Postgres / Supabase), and Vercel.

## What this app does

| Area | Behavior |
| --- | --- |
| **Home** | Merchant welcome screen (no credentials shown) |
| **App studio** | Draft / publish design: colors, fonts, layout, home sections; live HTML phone preview |
| **Mobile APIs** | Bootstrap, design, config, orders, classic account session |
| **Webhooks** | App uninstall / scopes; orders + fulfillments sync to Postgres |

**Hard rules**

- Admin access / refresh tokens stay on the server (`Session` table).
- Phone only receives Storefront access token + published design JSON.
- Orders are webhook-sourced. `POST /api/mobile/orders` returns **410** (client create disabled).
- Classic customer login: phone sends cookie → server re-probes Shopify → issues `X-Mobile-Session`.

## Stack

- Node 20+ / React Router 7 / `@shopify/shopify-app-react-router`
- Prisma → PostgreSQL (`DATABASE_URL` pooled, `DIRECT_URL` for migrations)
- Hosting: Vercel (`@vercel/react-router` preset)
- Optional guest-order email: Resend (`tryclevercat.com`)

## Quick start (local)

### Prerequisites

- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- Node `>=20.19 <22` or `>=22.12`
- Supabase (or other Postgres) with pooler + session URLs

### Setup

```shell
cd mobile-app
cp .env.example .env
# Fill DATABASE_URL, DIRECT_URL, SHOPIFY_*, MOBILE_SESSION_SECRET
npm install
npm run setup          # prisma generate + migrate deploy
npm run dev            # shopify app dev (tunnel + embed)
```

Press **P** in the CLI to open the embedded app preview.

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local Shopify app + tunnel |
| `npm run build` | Prisma generate + React Router build |
| `npm run vercel-build` | Generate + migrate + build (production) |
| `npm run deploy` | Push `shopify.app.toml` (scopes / webhooks) |
| `npm test` | Order security unit tests |
| `npm run setup` | Generate client + apply migrations |

## Environment variables

See `.env.example`. Required on Vercel (Production):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres pooler (e.g. Supabase `:6543?pgbouncer=true`) |
| `DIRECT_URL` | Postgres session URL (migrations, `:5432`) |
| `SHOPIFY_API_KEY` | App client id |
| `SHOPIFY_API_SECRET` | App secret (webhooks HMAC) |
| `SCOPES` | Must match `shopify.app.toml` (include `unauthenticated_*`, `read_orders`, `read_fulfillments`) |
| `SHOPIFY_APP_URL` | `https://shopify-mobile-app-tau.vercel.app` |
| `MOBILE_SESSION_SECRET` | Signs short-lived `X-Mobile-Session` tokens |

Optional (guest order email):

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key |
| `ORDER_ACCESS_FROM_EMAIL` | e.g. `orders@tryclevercat.com` |
| `GUEST_ORDER_DEEP_LINK_BASE` | e.g. `myapp://orders/guest` |

## Merchant UI

- **Home** (`/app`) — connection status, open App studio, sync store
- **App studio** (`/app/design`) — design blocks, phone preview, Design / Settings panels, Save draft / Publish

Draft is preview-only. Published design is what the phone loads from `GET /api/mobile/design`.

## Mobile API (phone contract)

Common headers for authenticated mobile calls:

- `Authorization: Bearer <storefrontAccessToken>`
- `Accept` / `Content-Type: application/json`
- `X-Shop-Domain: {shop}.myshopify.com`
- `X-Mobile-Session` when signed in
- Push device register: `X-Registration-Key` (installation key from admin; not the Storefront token)
- `X-Customer-Cookie` only for session exchange

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/mobile/bootstrap?shop=` | `{ shopDomain, storefrontAccessToken, storefrontApiVersion }` |
| GET | `/api/mobile/design?shop=` | `{ publishedDesign }` (Bearer required) |
| GET | `/api/mobile/config?shop=` | Admin-only metafield snapshot (Bearer required) |
| POST | `/api/mobile/account/session` | Cookie → `{ mobileSessionToken, expiresInSec }` |
| POST | `/api/mobile/orders` | **410** `client_order_create_disabled` |
| GET | `/api/mobile/orders?shop=` | Customer orders from webhook cache |
| GET | `/api/mobile/orders/:id?shop=` | One order; other customer → 404 |
| POST | `/api/mobile/orders/reconcile` | `ready` or `pending_sync` |
| POST | `/api/mobile/orders/guest/request` | Always `{ sent: true }` |
| POST | `/api/mobile/orders/guest/redeem` | One-time token → order |

Full order security notes: [docs/mobile-orders.md](docs/mobile-orders.md).

Phone app should set:

```text
MOBILE_API_BASE=https://shopify-mobile-app-tau.vercel.app
SHOP_DOMAIN=<merchant>.myshopify.com
```

## Scopes & webhooks

Configured in `shopify.app.toml`:

**Scopes:** products, content, navigation, metaobjects, `read_orders`, `read_fulfillments`, plus unauthenticated Storefront scopes for listings / checkouts / content / metaobjects.

**Webhooks**

- `app/uninstalled`, `app/scopes_update`
- Orders → `/webhooks/orders`: create, updated, cancelled, fulfilled, partially_fulfilled
- Fulfillments → same URI: create, update

After changing toml:

```shell
npm run deploy
```

Then open the app in Admin and **approve new scopes**.

## Database

Prisma schema: `prisma/schema.prisma` (PostgreSQL).

Main models:

- `Session` — Shopify OAuth sessions
- `ShopConfig` — shop snapshot, Storefront token, `draftDesign` / `publishedDesign`
- `OrderShop`, `SyncedOrder`, `WebhookDelivery`, `GuestOrderToken` — order sync cache

```shell
npx prisma migrate deploy
```

## Deploy (Vercel)

1. Set all required env vars on the Vercel project.
2. Build command: `npm run vercel-build` (or rely on `vercel.json` + CI).
3. Output directory: **leave blank** (Vercel React Router preset).
4. Deploy / push to `main`.
5. `npm run deploy` so Shopify syncs URLs, scopes, and webhooks.
6. Smoke-check:
   - `GET /api/mobile/bootstrap?shop=...` → 200
   - `POST /api/mobile/orders` → **410**

CI workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.

## Project layout

```text
app/
  routes/           # React Router routes (admin UI + mobile APIs + webhooks)
  services/         # design, shop-sync, mobile-http, orders/*
  preview/          # Live HTML phone preview
  design/           # Shared design tokens
prisma/             # schema + migrations
docs/mobile-orders.md
shopify.app.toml
```

## Tests

```shell
npm test
```

Covers webhook HMAC / dedupe, buyer-state mapping, auth boundaries, reconcile `pending_sync` → `ready`, guest non-enumeration, expired guest tokens.

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Prisma `EPERM` on Windows generate | Stop `npm run dev`, then `npx prisma generate` |
| Auth failed to Supabase | Reset DB password; fix quotes in `.env` URLs |
| `POST /api/mobile/orders` is 404 on prod | Latest routes not deployed — redeploy Vercel |
| Phone has no Storefront token | Ensure `unauthenticated_*` scopes installed; reinstall / approve |
| Guest email never arrives | Verify `tryclevercat.com` in Resend; set `RESEND_API_KEY` + `ORDER_ACCESS_FROM_EMAIL` on Vercel |
| Embedded nav / redirect issues | Use App Bridge / `authenticate.admin` redirects, not raw `<a>` |

## Resources

- [Shopify App React Router](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [React Router](https://reactrouter.com/home)
- [Prisma](https://www.prisma.io/docs)
- [docs/mobile-orders.md](docs/mobile-orders.md)
