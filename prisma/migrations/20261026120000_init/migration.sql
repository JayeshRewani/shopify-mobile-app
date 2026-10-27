-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopConfig" (
    "shop" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "storefrontAccessToken" TEXT,
    "storefrontAccessTokenId" TEXT,
    "storefrontScopes" TEXT NOT NULL DEFAULT '',
    "metafieldDefinitions" JSONB NOT NULL,
    "metaobjectDefinitions" JSONB NOT NULL,
    "metaobjects" JSONB NOT NULL,
    "menus" JSONB NOT NULL,
    "adminOnlyMetafields" JSONB NOT NULL,
    "truncated" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "syncError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "draftDesign" JSONB,
    "publishedDesign" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopConfig_pkey" PRIMARY KEY ("shop")
);
