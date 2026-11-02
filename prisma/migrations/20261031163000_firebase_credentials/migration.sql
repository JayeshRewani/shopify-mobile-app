-- Held until a production apply is explicitly approved.
-- MVP credential storage is a Postgres column. external_ref is unused until
-- a later move to Secrets Manager or KMS.

-- CreateEnum
CREATE TYPE "firebase_credential_storage" AS ENUM ('DATABASE', 'SECRETS_MANAGER', 'KMS');

-- CreateTable
CREATE TABLE "firebase_credentials" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "mobile_app_id" TEXT NOT NULL,
    "storage" "firebase_credential_storage" NOT NULL DEFAULT 'DATABASE',
    "service_account_json" TEXT,
    "external_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firebase_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firebase_credentials_shop_domain_key" ON "firebase_credentials"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "firebase_credentials_mobile_app_id_key" ON "firebase_credentials"("mobile_app_id");

-- CreateIndex
CREATE UNIQUE INDEX "firebase_credentials_mobile_app_id_shop_domain_key" ON "firebase_credentials"("mobile_app_id", "shop_domain");

-- AddForeignKey
ALTER TABLE "firebase_credentials" ADD CONSTRAINT "firebase_credentials_mobile_app_id_shop_domain_fkey" FOREIGN KEY ("mobile_app_id", "shop_domain") REFERENCES "mobile_apps"("id", "shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- DATABASE keeps the JSON and no external pointer.
-- SECRETS_MANAGER keeps only a pointer.
-- KMS keeps ciphertext in service_account_json plus a key id in external_ref.
ALTER TABLE "firebase_credentials" ADD CONSTRAINT "firebase_credentials_storage_check" CHECK (
    ("storage" = 'DATABASE' AND "service_account_json" IS NOT NULL AND "external_ref" IS NULL)
    OR ("storage" = 'SECRETS_MANAGER' AND "service_account_json" IS NULL AND "external_ref" IS NOT NULL)
    OR ("storage" = 'KMS' AND "service_account_json" IS NOT NULL AND "external_ref" IS NOT NULL)
);

-- The secret no longer lives on the app row.
ALTER TABLE "mobile_apps" DROP COLUMN IF EXISTS "credential_ref";
