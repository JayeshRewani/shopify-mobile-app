# Notification worker

Separate Node package. The Shopify app stays on Vercel. This package is listed in `.vercelignore`.

ElasticMQ and the Postgres container are local development only. Production sends go to the existing SQS queue in ap-south-1. `template.yaml` creates the two Lambda functions, the queue event source mapping, and the EventBridge Scheduler. It does not create the queues or the Lambda execution role.

Notification Prisma migrations now live under `mobile-app/prisma/migrations`. `npm run generate` only builds the Prisma client. It does not migrate. Do not run `sam deploy` against production until the production migrate has created the notification tables.

## Local queue and database

ElasticMQ stands in for SQS. Postgres on port 54329 is only for this package.

```shell
cd notification-worker
copy .env.example .env
npm test
npm run queue:up
```

Queue API: `http://127.0.0.1:9324`  
Queue UI: `http://127.0.0.1:9325`  
Database: `postgresql://postgres:postgres@127.0.0.1:54329/notifications_dev`

From `mobile-app`, apply the existing migrations and the held notification SQL to that local database:

```shell
npm run db:local:notifications
```

That command ignores `DATABASE_URL` from the Shopify app `.env` and refuses any host other than localhost. `npm run queue:down` stops both containers.

Place a Firebase test service-account JSON at `.secrets/firebase-test.json` only for a local file-based dry run. Merchant credentials for the MVP are rows in local Postgres (`firebase_credentials`), written by the backend credential service. That service does not return the private key.

`DATABASE_URL` must use `localhost`, `127.0.0.1`, or `::1`. Do not copy the Vercel or Supabase production URL into this `.env`. Do not run `prisma migrate` from `mobile-app` against production while this work is still local.

`NOTIFICATION_BATCH_SIZE` is the number of device tokens per worker page. The default is 500. Values above 500 are rejected because that is the Firebase `sendEach` limit.

## Credential storage

The MVP keeps each shop's Firebase service-account JSON in `firebase_credentials.service_account_json`. The row is keyed by `shop_domain`. `storage` can later be `SECRETS_MANAGER` or `KMS` without a new table; those modes are not used yet. No AWS secret store is created by this package.
