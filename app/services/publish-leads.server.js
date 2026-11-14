import db from "../db.server";

const PHONE = /^\+?[0-9][0-9\s\-()]{6,18}$/;

export function normalizePublishLeadInput(input = {}) {
  const name = String(input.name || "").trim().slice(0, 80);
  const phone = String(input.phone || "").trim().replace(/\s+/g, " ").slice(0, 24);
  const note = String(input.note || "").trim().slice(0, 280);

  if (name.length < 2) {
    return { ok: false, error: "Enter your full name." };
  }
  if (!PHONE.test(phone)) {
    return { ok: false, error: "Enter a valid mobile number with country code if needed." };
  }

  return {
    ok: true,
    data: {
      name,
      phone,
      note: note || null,
    },
  };
}

export async function createPublishLead({ shop, name, phone, note }) {
  const parsed = normalizePublishLeadInput({ name, phone, note });
  if (!parsed.ok) return parsed;

  const shopRow = await db.shopConfig.findUnique({ where: { shop } });
  if (!shopRow) {
    return { ok: false, error: "Shop is not synced yet. Connect your store first." };
  }

  const lead = await db.publishLead.create({
    data: {
      shop,
      name: parsed.data.name,
      phone: parsed.data.phone,
      note: parsed.data.note,
      status: "NEW",
    },
  });

  return { ok: true, lead };
}

export async function latestPublishLead(shop) {
  return db.publishLead.findFirst({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}
