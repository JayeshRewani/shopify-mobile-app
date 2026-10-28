-- CreateTable
CREATE TABLE "shops" (
    "shop_domain" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("shop_domain")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "webhook_id" TEXT NOT NULL,
    "event_id" TEXT,
    "shop_domain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("webhook_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "shop_domain" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "order_number" TEXT,
    "customer_id" TEXT,
    "customer_email" TEXT,
    "financial_status" TEXT,
    "fulfillment_status" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "currency" TEXT,
    "total_price" TEXT,
    "checkout_token" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("shop_domain","shopify_order_id")
);

-- CreateTable
CREATE TABLE "guest_order_tokens" (
    "token_hash" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "guest_order_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "mobile_rate_limits" (
    "bucket_key" TEXT NOT NULL,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "hit_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mobile_rate_limits_pkey" PRIMARY KEY ("bucket_key")
);

-- CreateIndex
CREATE INDEX "webhook_deliveries_event_id_idx" ON "webhook_deliveries"("event_id");

-- CreateIndex
CREATE INDEX "orders_shop_domain_customer_id_idx" ON "orders"("shop_domain", "customer_id");

-- CreateIndex
CREATE INDEX "orders_shop_domain_customer_email_idx" ON "orders"("shop_domain", "customer_email");

-- CreateIndex
CREATE INDEX "orders_shop_domain_checkout_token_idx" ON "orders"("shop_domain", "checkout_token");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_shop_domain_fkey" FOREIGN KEY ("shop_domain") REFERENCES "shops"("shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_domain_fkey" FOREIGN KEY ("shop_domain") REFERENCES "shops"("shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_order_tokens" ADD CONSTRAINT "guest_order_tokens_shop_domain_fkey" FOREIGN KEY ("shop_domain") REFERENCES "shops"("shop_domain") ON DELETE CASCADE ON UPDATE CASCADE;
