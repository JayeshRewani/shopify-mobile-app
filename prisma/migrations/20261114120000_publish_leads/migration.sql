-- CreateTable
CREATE TABLE "publish_leads" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publish_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publish_leads_shop_created_at_idx" ON "publish_leads"("shop", "created_at");

-- CreateIndex
CREATE INDEX "publish_leads_status_created_at_idx" ON "publish_leads"("status", "created_at");

-- AddForeignKey
ALTER TABLE "publish_leads" ADD CONSTRAINT "publish_leads_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopConfig"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
