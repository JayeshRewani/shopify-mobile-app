-- Held until a production apply is explicitly approved.
-- prisma migrate deploy reads only prisma/migrations, not this directory.
-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "audience_type" AS ENUM ('ALL', 'ANDROID', 'IOS', 'SEGMENT');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED', 'INVALID_TOKEN');

-- CreateEnum
CREATE TYPE "notification_job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "mobile_apps" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "android_package_id" TEXT,
    "ios_bundle_id" TEXT,
    "firebase_project_id" TEXT,
    "android_firebase_app_id" TEXT,
    "ios_firebase_app_id" TEXT,
    "deep_link_scheme" TEXT,
    "registration_key_hash" TEXT,
    "credential_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "mobile_app_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "token" TEXT NOT NULL,
    "platform" "device_platform" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_campaigns" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "mobile_app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "image_url" TEXT,
    "icon_url" TEXT,
    "deep_link" TEXT,
    "audience_type" "audience_type" NOT NULL,
    "platform" "device_platform",
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "targeted_count" INTEGER NOT NULL DEFAULT 0,
    "attempted_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_token_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "device_token_id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "status" "delivery_status" NOT NULL,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "mobile_app_id" TEXT NOT NULL,
    "cursor" TEXT,
    "status" "notification_job_status" NOT NULL DEFAULT 'QUEUED',
    "sqs_message_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_apps_shop_domain_key" ON "mobile_apps"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_apps_id_shop_domain_key" ON "mobile_apps"("id", "shop_domain");

-- CreateIndex
CREATE INDEX "device_tokens_shop_domain_mobile_app_id_is_active_platform_idx" ON "device_tokens"("shop_domain", "mobile_app_id", "is_active", "platform");

-- CreateIndex
CREATE INDEX "device_tokens_shop_domain_customer_id_idx" ON "device_tokens"("shop_domain", "customer_id");

-- CreateIndex
CREATE INDEX "device_tokens_mobile_app_id_is_active_id_idx" ON "device_tokens"("mobile_app_id", "is_active", "id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_id_shop_domain_key" ON "device_tokens"("id", "shop_domain");

-- CreateIndex
CREATE INDEX "notification_campaigns_shop_domain_created_at_idx" ON "notification_campaigns"("shop_domain", "created_at");

-- CreateIndex
CREATE INDEX "notification_campaigns_shop_domain_status_idx" ON "notification_campaigns"("shop_domain", "status");

-- CreateIndex
CREATE INDEX "notification_campaigns_status_scheduled_at_idx" ON "notification_campaigns"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_campaigns_id_shop_domain_key" ON "notification_campaigns"("id", "shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "notification_campaigns_id_shop_domain_mobile_app_id_key" ON "notification_campaigns"("id", "shop_domain", "mobile_app_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_campaign_id_status_idx" ON "notification_deliveries"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "notification_deliveries_shop_domain_idx" ON "notification_deliveries"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_campaign_id_device_token_id_key" ON "notification_deliveries"("campaign_id", "device_token_id");

-- CreateIndex
CREATE INDEX "notification_jobs_shop_domain_status_idx" ON "notification_jobs"("shop_domain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_jobs_campaign_id_shop_domain_mobile_app_id_key" ON "notification_jobs"("campaign_id", "shop_domain", "mobile_app_id");

-- AddForeignKey
ALTER TABLE "mobile_apps" ADD CONSTRAINT "mobile_apps_shop_domain_fkey" FOREIGN KEY ("shop_domain") REFERENCES "ShopConfig"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_mobile_app_id_shop_domain_fkey" FOREIGN KEY ("mobile_app_id", "shop_domain") REFERENCES "mobile_apps"("id", "shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_mobile_app_id_shop_domain_fkey" FOREIGN KEY ("mobile_app_id", "shop_domain") REFERENCES "mobile_apps"("id", "shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_campaign_id_shop_domain_fkey" FOREIGN KEY ("campaign_id", "shop_domain") REFERENCES "notification_campaigns"("id", "shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_token_id_shop_domain_fkey" FOREIGN KEY ("device_token_id", "shop_domain") REFERENCES "device_tokens"("id", "shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_campaign_id_shop_domain_mobile_app_id_fkey" FOREIGN KEY ("campaign_id", "shop_domain", "mobile_app_id") REFERENCES "notification_campaigns"("id", "shop_domain", "mobile_app_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active registration per app and token. Inactive rows can repeat.
CREATE UNIQUE INDEX "device_tokens_active_token_key"
ON "device_tokens" ("mobile_app_id", "token")
WHERE "is_active" = true;
