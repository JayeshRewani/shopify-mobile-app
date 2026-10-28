# Mobile order sync (Shopify source of truth)

Orders are never created from the phone. Checkout completion only triggers **reconcile**. Shopify webhooks write the DB. The phone reads the webhook cache.

## Env vars

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Postgres (Supabase) |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | App credentials + webhook HMAC |
| `SCOPES` | Must include `read_orders` and `read_fulfillments` |
| `SHOPIFY_APP_URL` | Public app URL |
| `MOBILE_SESSION_SECRET` | Signs `X-Mobile-Session` (~1h) |
| `RESEND_API_KEY` / `ORDER_ACCESS_FROM_EMAIL` | Optional guest-order email |
| `GUEST_ORDER_DEEP_LINK_BASE` | Deep link prefix for guest tokens |

## Scopes

Add and reinstall / approve:

- `read_orders`
- `read_fulfillments`

## Webhook topics → `POST /webhooks/orders`

- `orders/create`, `orders/updated`, `orders/cancelled`
- `orders/fulfilled`, `orders/partially_fulfilled`
- `fulfillments/create`, `fulfillments/update`

HMAC is verified with `authenticate.webhook`. Deliveries are deduped by `X-Shopify-Webhook-Id`. Stale payloads are ignored via `updated_at`.

## Mobile API

Common headers:

- `Authorization: Bearer <storefrontAccessToken>`
- `X-Shop-Domain: {shop}.myshopify.com`
- `X-Mobile-Session: <server token>` when signed in
- `X-Customer-Cookie` only for session exchange

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/mobile/orders` | **410** `{ error: "client_order_create_disabled" }` |
| POST | `/api/mobile/account/session` | Cookie → `mobileSessionToken` |
| GET | `/api/mobile/orders?shop=` | Customer orders from cache |
| GET | `/api/mobile/orders/:id?shop=` | One order; cross-customer → 404 |
| POST | `/api/mobile/orders/reconcile` | `ready` or `pending_sync` |
| POST | `/api/mobile/orders/guest/request` | Always `{ sent: true }` |
| POST | `/api/mobile/orders/guest/redeem` | One-time token → order |

## Deploy / reinstall checklist

1. Set env vars on Vercel (including `MOBILE_SESSION_SECRET`).
2. Run migrations (`prisma migrate deploy` / `vercel-build`).
3. Deploy app config: `shopify app deploy` (scopes + webhooks).
4. Open the app in Admin and **approve the new scopes**.
5. Confirm `POST /api/mobile/orders` returns **410**, not 404.
6. Place a test order and confirm a row appears in `orders` after the webhook.
7. Point the phone `MOBILE_API_BASE` at the production host.

## Security rules (do not break)

- Never return Admin tokens to the phone.
- Never trust client `financialStatus` / `fulfillmentStatus`.
- Never expose orders by number / email / id alone.
- Guest request always returns `{ sent: true }` (no enumeration).
- Do not log raw guest tokens or session cookies.
