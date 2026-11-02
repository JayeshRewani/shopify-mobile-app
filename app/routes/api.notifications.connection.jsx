import { authenticate } from "../shopify.server";
import { probeProductionAccess } from "../services/notifications/oidc-probe.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const report = await probeProductionAccess(process.env, request);
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
};
