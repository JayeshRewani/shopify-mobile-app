import { authenticate } from "../shopify.server";
import { refreshMetaobjects } from "../services/shop-sync.server";

export const action = async ({ request }) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  if (!admin) return new Response();

  const type =
    typeof payload?.type === "string"
      ? payload.type
      : typeof payload?.query_variables?.metaobjectType === "string"
        ? payload.query_variables.metaobjectType
        : null;

  try {
    await refreshMetaobjects({ admin, shop, type });
  } catch (error) {
    console.error(`Metaobject webhook failed for ${shop} (${topic})`, error);
  }

  return new Response();
};
