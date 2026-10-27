import db from "../db.server";
import { adminGraphql, isAccessDenied } from "./admin-graphql.server";

export const MOBILE_STOREFRONT_TOKEN_TITLE = "Mobile app";

export const STOREFRONT_SCOPES = [
  "unauthenticated_read_product_listings",
  "unauthenticated_read_product_inventory",
  "unauthenticated_write_checkouts",
  "unauthenticated_read_checkouts",
  "unauthenticated_read_content",
  "unauthenticated_read_metaobjects",
];

const METAFIELD_OWNER_TYPES = [
  "PRODUCT",
  "PRODUCTVARIANT",
  "COLLECTION",
  "SHOP",
  "PAGE",
  "ARTICLE",
];

const LIMITS = {
  metafieldDefinitionsPerOwner: 100,
  metaobjectDefinitions: 50,
  metaobjectEntriesPerType: 100,
  menus: 50,
  adminOnlyDefinitions: 40,
  metafieldValuesPerDefinition: 100,
};

const locks = new Map();

function withShopLock(shop, task) {
  const previous = locks.get(shop) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  locks.set(shop, current);

  return current.finally(() => {
    if (locks.get(shop) === current) locks.delete(shop);
  });
}

export function ensureShopCredentials(args) {
  return withShopLock(args.shop, () => ensureShopCredentialsUnlocked(args));
}

export function syncShop(args) {
  return withShopLock(args.shop, () => syncShopUnlocked(args));
}

export function refreshMetaobjects(args) {
  return withShopLock(args.shop, () => refreshMetaobjectsUnlocked(args));
}

async function ensureShopCredentialsUnlocked({ admin, shop }) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query ShopIdentity {
        shop {
          name
          myshopifyDomain
          currencyCode
          storefrontAccessTokens(first: 100) {
            nodes {
              id
              title
              accessToken
              accessScopes {
                handle
              }
            }
          }
        }
      }`,
  );

  const shopData = data.shop;
  const existingTokens = shopData.storefrontAccessTokens.nodes.filter(
    (token) => token.title === MOBILE_STOREFRONT_TOKEN_TITLE,
  );
  const reusable = existingTokens.find((token) =>
    hasStorefrontScopes(token.accessScopes),
  );

  let token = reusable;
  if (!token) {
    for (const outdated of existingTokens) {
      await deleteStorefrontToken(admin, outdated.id);
    }
    token = await createStorefrontToken(admin);
  }

  const credentials = {
    shopName: shopData.name,
    currencyCode: shopData.currencyCode,
    storefrontAccessToken: token.accessToken,
    storefrontAccessTokenId: token.id,
    storefrontScopes: token.accessScopes
      .map((scope) => scope.handle)
      .sort()
      .join(","),
  };

  return db.shopConfig.upsert({
    where: { shop },
    create: {
      shop,
      ...credentials,
      metafieldDefinitions: [],
      metaobjectDefinitions: [],
      metaobjects: [],
      menus: [],
      adminOnlyMetafields: [],
      truncated: {},
      warnings: [],
    },
    update: credentials,
  });
}

async function syncShopUnlocked({ admin, shop }) {
  try {
    await ensureShopCredentialsUnlocked({ admin, shop });
    return await pullStoreSnapshot({ admin, shop });
  } catch (error) {
    await db.shopConfig
      .update({
        where: { shop },
        data: { syncError: error.message },
      })
      .catch(() => {});
    throw error;
  }
}

async function pullStoreSnapshot({ admin, shop }) {
  const warnings = [];
  const truncated = {
    metafieldDefinitions: false,
    metaobjectDefinitions: false,
    metaobjects: false,
    menus: false,
    adminOnlyMetafields: false,
  };

  const metafieldDefinitions = [];
  for (const ownerType of METAFIELD_OWNER_TYPES) {
    try {
      const page = await collectPages(
        (after) => loadMetafieldDefinitions(admin, ownerType, after),
        LIMITS.metafieldDefinitionsPerOwner,
      );
      metafieldDefinitions.push(...page.items);
      truncated.metafieldDefinitions =
        truncated.metafieldDefinitions || page.truncated;
    } catch (error) {
      if (!isAccessDenied(error)) throw error;
      warnings.push(
        `${ownerType} metafield definitions are outside this app's scopes.`,
      );
    }
  }

  let metaobjectDefinitions = [];
  try {
    const page = await collectPages(
      (after) => loadMetaobjectDefinitions(admin, after),
      LIMITS.metaobjectDefinitions,
    );
    metaobjectDefinitions = page.items;
    truncated.metaobjectDefinitions = page.truncated;
  } catch (error) {
    if (!isAccessDenied(error)) throw error;
    warnings.push("Metaobject definitions are outside this app's scopes.");
  }

  const metaobjects = [];
  for (const definition of metaobjectDefinitions) {
    try {
      const page = await collectPages(
        (after) => loadMetaobjects(admin, definition.type, after),
        LIMITS.metaobjectEntriesPerType,
      );
      metaobjects.push(...page.items);
      truncated.metaobjects = truncated.metaobjects || page.truncated;
    } catch (error) {
      if (!isAccessDenied(error)) throw error;
      warnings.push(
        `Entries for ${definition.type} are outside this app's scopes.`,
      );
    }
  }

  let menus = [];
  try {
    const page = await collectPages(
      (after) => loadMenus(admin, after),
      LIMITS.menus,
    );
    menus = page.items;
    truncated.menus = page.truncated;
  } catch (error) {
    if (!isAccessDenied(error)) throw error;
    warnings.push("Menus are outside this app's scopes.");
  }

  const adminOnlyDefinitions = metafieldDefinitions.filter(
    (definition) => !definition.storefrontVisible,
  );
  if (adminOnlyDefinitions.length > LIMITS.adminOnlyDefinitions) {
    truncated.adminOnlyMetafields = true;
  }

  const adminOnlyMetafields = [];
  for (const definition of adminOnlyDefinitions.slice(
    0,
    LIMITS.adminOnlyDefinitions,
  )) {
    try {
      const page = await collectPages(
        (after) => loadMetafieldValues(admin, definition, after),
        LIMITS.metafieldValuesPerDefinition,
      );
      truncated.adminOnlyMetafields =
        truncated.adminOnlyMetafields || page.truncated;
      for (const value of page.items) {
        adminOnlyMetafields.push({
          namespace: definition.namespace,
          key: definition.key,
          ownerType: definition.ownerType,
          type: definition.type,
          ...value,
        });
      }
    } catch (error) {
      if (!isAccessDenied(error)) throw error;
      warnings.push(
        `${definition.namespace}.${definition.key} values are outside this app's scopes.`,
      );
    }
  }

  return db.shopConfig.update({
    where: { shop },
    data: {
      metafieldDefinitions,
      metaobjectDefinitions,
      metaobjects,
      menus,
      adminOnlyMetafields,
      truncated,
      warnings,
      syncError: null,
      syncedAt: new Date(),
    },
  });
}

async function refreshMetaobjectsUnlocked({ admin, shop, type }) {
  const existing = await db.shopConfig.findUnique({ where: { shop } });
  if (!existing?.storefrontAccessToken) {
    await ensureShopCredentialsUnlocked({ admin, shop });
  }

  const definitionsPage = await collectPages(
    (after) => loadMetaobjectDefinitions(admin, after),
    LIMITS.metaobjectDefinitions,
  );

  const types = type
    ? [type]
    : definitionsPage.items.map((definition) => definition.type);
  const refreshed = [];
  let entriesTruncated = false;

  for (const entryType of types) {
    const page = await collectPages(
      (after) => loadMetaobjects(admin, entryType, after),
      LIMITS.metaobjectEntriesPerType,
    );
    refreshed.push(...page.items);
    entriesTruncated = entriesTruncated || page.truncated;
  }

  const previousEntries = Array.isArray(existing?.metaobjects)
    ? existing.metaobjects
    : [];
  const metaobjects = type
    ? [
        ...previousEntries.filter((entry) => entry.type !== type),
        ...refreshed,
      ]
    : refreshed;

  const previousTruncated =
    existing?.truncated && typeof existing.truncated === "object"
      ? existing.truncated
      : {};

  return db.shopConfig.update({
    where: { shop },
    data: {
      metaobjectDefinitions: definitionsPage.items,
      metaobjects,
      truncated: {
        ...previousTruncated,
        metaobjectDefinitions: definitionsPage.truncated,
        metaobjects: entriesTruncated,
      },
      syncedAt: new Date(),
    },
  });
}

function hasStorefrontScopes(accessScopes) {
  const handles = new Set(accessScopes.map((scope) => scope.handle));
  return STOREFRONT_SCOPES.every((scope) => handles.has(scope));
}

async function createStorefrontToken(admin) {
  const data = await adminGraphql(
    admin,
    `#graphql
      mutation StorefrontAccessTokenCreate($input: StorefrontAccessTokenInput!) {
        storefrontAccessTokenCreate(input: $input) {
          storefrontAccessToken {
            id
            accessToken
            title
            accessScopes {
              handle
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    { input: { title: MOBILE_STOREFRONT_TOKEN_TITLE } },
  );

  const payload = data.storefrontAccessTokenCreate;
  if (payload.userErrors.length || !payload.storefrontAccessToken) {
    const message =
      payload.userErrors.map((error) => error.message).join("; ") ||
      "Shopify did not return a Storefront token.";
    throw new Error(message);
  }

  if (!hasStorefrontScopes(payload.storefrontAccessToken.accessScopes)) {
    throw new Error(
      "The Storefront token is missing unauthenticated scopes. Reinstall the app after the scopes in shopify.app.toml are approved.",
    );
  }

  return payload.storefrontAccessToken;
}

async function deleteStorefrontToken(admin, id) {
  const data = await adminGraphql(
    admin,
    `#graphql
      mutation StorefrontAccessTokenDelete($input: StorefrontAccessTokenDeleteInput!) {
        storefrontAccessTokenDelete(input: $input) {
          deletedStorefrontAccessTokenId
          userErrors {
            field
            message
          }
        }
      }`,
    { input: { id } },
  );

  const errors = data.storefrontAccessTokenDelete.userErrors;
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join("; "));
  }
}

async function loadMetafieldDefinitions(admin, ownerType, after) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $after: String) {
        metafieldDefinitions(ownerType: $ownerType, first: 50, after: $after) {
          nodes {
            id
            namespace
            key
            name
            description
            ownerType
            type {
              name
            }
            access {
              admin
              storefront
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
    { ownerType, after },
  );

  const connection = data.metafieldDefinitions;
  return {
    nodes: connection.nodes.map((node) => ({
      id: node.id,
      namespace: node.namespace,
      key: node.key,
      name: node.name,
      description: node.description,
      ownerType: node.ownerType,
      type: node.type.name,
      adminAccess: node.access.admin,
      storefrontAccess: node.access.storefront,
      storefrontVisible: node.access.storefront === "PUBLIC_READ",
    })),
    pageInfo: connection.pageInfo,
  };
}

async function loadMetaobjectDefinitions(admin, after) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query MetaobjectDefinitions($after: String) {
        metaobjectDefinitions(first: 50, after: $after) {
          nodes {
            id
            type
            name
            description
            displayNameKey
            access {
              admin
              storefront
            }
            fieldDefinitions {
              key
              name
              required
              type {
                name
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
    { after },
  );

  const connection = data.metaobjectDefinitions;
  return {
    nodes: connection.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      description: node.description,
      displayNameKey: node.displayNameKey,
      adminAccess: node.access.admin,
      storefrontAccess: node.access.storefront,
      storefrontVisible: node.access.storefront === "PUBLIC_READ",
      fields: node.fieldDefinitions.map((field) => ({
        key: field.key,
        name: field.name,
        required: field.required,
        type: field.type.name,
      })),
    })),
    pageInfo: connection.pageInfo,
  };
}

async function loadMetaobjects(admin, type, after) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query MetaobjectsByType($type: String!, $after: String) {
        metaobjects(type: $type, first: 50, after: $after) {
          nodes {
            id
            handle
            type
            displayName
            updatedAt
            fields {
              key
              type
              value
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
    { type, after },
  );

  const connection = data.metaobjects;
  return {
    nodes: connection.nodes.map((node) => ({
      id: node.id,
      handle: node.handle,
      type: node.type,
      displayName: node.displayName,
      updatedAt: node.updatedAt,
      fields: node.fields.map((field) => ({
        key: field.key,
        type: field.type,
        value: field.value,
      })),
    })),
    pageInfo: connection.pageInfo,
  };
}

async function loadMenus(admin, after) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query Menus($after: String) {
        menus(first: 20, after: $after) {
          nodes {
            id
            handle
            title
            isDefault
            items(limit: 50) {
              id
              title
              type
              url
              resourceId
              tags
              items {
                id
                title
                type
                url
                resourceId
                tags
                items {
                  id
                  title
                  type
                  url
                  resourceId
                  tags
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
    { after },
  );

  return data.menus;
}

async function loadMetafieldValues(admin, definition, after) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query AdminOnlyMetafieldValues(
        $ownerType: MetafieldOwnerType!
        $namespace: String!
        $key: String!
        $after: String
      ) {
        metafieldDefinitions(
          ownerType: $ownerType
          namespace: $namespace
          key: $key
          first: 1
        ) {
          nodes {
            metafields(first: 50, after: $after) {
              nodes {
                id
                value
                owner {
                  ... on Product {
                    id
                    handle
                  }
                  ... on ProductVariant {
                    id
                  }
                  ... on Collection {
                    id
                    handle
                  }
                  ... on Shop {
                    id
                    myshopifyDomain
                  }
                  ... on Page {
                    id
                    handle
                  }
                  ... on Article {
                    id
                    handle
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }`,
    {
      ownerType: definition.ownerType,
      namespace: definition.namespace,
      key: definition.key,
      after,
    },
  );

  const definitionNode = data.metafieldDefinitions.nodes[0];
  if (!definitionNode) {
    return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }

  const connection = definitionNode.metafields;
  return {
    nodes: connection.nodes.map((node) => ({
      id: node.id,
      value: node.value,
      owner: node.owner,
    })),
    pageInfo: connection.pageInfo,
  };
}

async function collectPages(loadPage, maxItems) {
  const items = [];
  let after = null;
  let truncated = false;

  while (items.length < maxItems) {
    const page = await loadPage(after);
    items.push(...page.nodes);

    if (page.nodes.length === 0) break;

    if (items.length >= maxItems) {
      truncated = items.length > maxItems || page.pageInfo.hasNextPage;
      break;
    }

    if (
      !page.pageInfo.hasNextPage ||
      !page.pageInfo.endCursor ||
      page.pageInfo.endCursor === after
    ) {
      break;
    }
    after = page.pageInfo.endCursor;
  }

  return { items: items.slice(0, maxItems), truncated };
}
