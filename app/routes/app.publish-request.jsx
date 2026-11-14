import { authenticate } from "../shopify.server";
import {
  createPublishLead,
  latestPublishLead,
} from "../services/publish-leads.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const lead = await latestPublishLead(session.shop);
  return {
    alreadyRequested: Boolean(lead),
    requestedAt: lead?.createdAt || null,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent !== "publish_lead") {
    return { ok: false, error: "Unknown action." };
  }

  const result = await createPublishLead({
    shop: session.shop,
    name: form.get("name"),
    phone: form.get("phone"),
    note: form.get("note"),
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    message: "Thanks — we will contact you to launch your app.",
    leadId: result.lead.id,
  };
};
