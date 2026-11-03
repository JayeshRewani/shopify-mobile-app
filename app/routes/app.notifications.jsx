import { useEffect } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  createDraftCampaign,
  loadNotificationsAdmin,
  rotateRegistrationKey,
  saveFirebaseJson,
  scheduleCampaignForShop,
  sendCampaignNow,
} from "../services/notifications/admin.server";
import "../styles/notifications.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return loadNotificationsAdmin(db, session.shop);
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "save_firebase") {
      const firebase = await saveFirebaseJson(db, {
        shopDomain: session.shop,
        mobileAppId: String(form.get("mobileAppId") || ""),
        serviceAccountText: String(form.get("serviceAccountText") || ""),
      });
      return { ok: true, message: "Firebase credentials saved.", firebase };
    }

    if (intent === "create_campaign") {
      const campaign = await createDraftCampaign(db, {
        shopDomain: session.shop,
        mobileAppId: String(form.get("mobileAppId") || ""),
        name: String(form.get("name") || ""),
        title: String(form.get("title") || ""),
        message: String(form.get("message") || ""),
        audienceType: String(form.get("audienceType") || "ALL"),
        imageUrl: String(form.get("imageUrl") || ""),
        deepLink: String(form.get("deepLink") || ""),
      });
      return { ok: true, message: "Draft campaign created.", campaignId: campaign.id };
    }

    if (intent === "send_now") {
      const result = await sendCampaignNow(db, request, {
        shopDomain: session.shop,
        campaignId: String(form.get("campaignId") || ""),
      });
      if (!result.enqueued) {
        return { ok: false, error: `Could not send (${result.reason}).` };
      }
      return { ok: true, message: "Campaign queued. The worker will process it." };
    }

    if (intent === "schedule") {
      const result = await scheduleCampaignForShop(db, {
        shopDomain: session.shop,
        campaignId: String(form.get("campaignId") || ""),
        scheduledAt: String(form.get("scheduledAt") || ""),
      });
      if (!result.scheduled) {
        return { ok: false, error: "Only draft campaigns can be scheduled." };
      }
      return { ok: true, message: "Campaign scheduled." };
    }

    if (intent === "rotate_registration_key") {
      const issued = await rotateRegistrationKey(db, session.shop);
      return {
        ok: true,
        message: "Registration key created. Copy it now — it will not be shown again.",
        registrationKey: issued.registrationKey,
      };
    }

    return { ok: false, error: "Unknown action." };
  } catch (error) {
    return { ok: false, error: error?.code || error?.message || "request_failed" };
  }
};

export default function NotificationsPage() {
  const data = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const busy = navigation.state !== "idle";

  useEffect(() => {
    if (actionData?.ok && actionData.message) {
      shopify.toast.show(actionData.message);
    }
  }, [actionData, shopify]);

  const firebaseReady = Boolean(data.firebase?.configured);

  return (
    <div className="push-shell">
      <div className="push-wrap">
        <header className="push-hero">
          <p className="push-kicker" style={{ color: "rgba(255,255,255,0.8)" }}>
            Push notifications
          </p>
          <h1>Reach every install without leaving the browser.</h1>
          <p>
            Compose a campaign, save Firebase once, and queue delivery to your
            DigitalOcean worker through SQS. Device registration still has to
            land tokens before phones can receive a push.
          </p>
        </header>

        {actionData?.error ? <div className="push-flash err">{actionData.error}</div> : null}
        {actionData?.ok ? <div className="push-flash ok">{actionData.message}</div> : null}

        <section className="push-stats">
          <div className="push-stat">
            <span>Firebase</span>
            <strong>{firebaseReady ? "Ready" : "Missing"}</strong>
          </div>
          <div className="push-stat">
            <span>Active devices</span>
            <strong>{data.deviceCount}</strong>
          </div>
          <div className="push-stat">
            <span>Campaigns</span>
            <strong>{data.campaigns.length}</strong>
          </div>
        </section>

        <section className="push-panel">
          <h2>Device registration key</h2>
          <p className="hint">
            The phone app must send this key when registering an FCM token.
            Storefront tokens alone cannot register devices. The raw key is shown
            only once after you generate or rotate it.
          </p>
          <p className="hint">
            Status:{" "}
            {data.mobileApp.hasRegistrationKey
              ? "A key is configured (hash stored)."
              : "No key yet — generate one before the phone can register."}
          </p>
          {actionData?.registrationKey ? (
            <label className="push-form">
              Copy this key into the mobile app config
              <textarea className="code" readOnly value={actionData.registrationKey} />
            </label>
          ) : null}
          <Form method="post" className="push-actions">
            <input type="hidden" name="intent" value="rotate_registration_key" />
            <button className="push-secondary" type="submit" disabled={busy}>
              {data.mobileApp.hasRegistrationKey ? "Rotate registration key" : "Generate registration key"}
            </button>
          </Form>
        </section>

        <div className="push-grid">
          <section className="push-panel">
            <h2>New campaign</h2>
            <p className="hint">Creates a draft. Send queues one SQS message — no direct FCM from Vercel.</p>
            <Form method="post" className="push-form">
              <input type="hidden" name="intent" value="create_campaign" />
              <input type="hidden" name="mobileAppId" value={data.mobileApp.id} />
              <label>
                Internal name
                <input name="name" required placeholder="Spring sale blast" />
              </label>
              <label>
                Notification title
                <input name="title" required maxLength={80} placeholder="Weekend sale" />
              </label>
              <label>
                Message
                <textarea name="message" required maxLength={500} placeholder="Short body for the lock screen" />
              </label>
              <label>
                Audience
                <select name="audienceType" defaultValue="ALL">
                  <option value="ALL">All devices</option>
                  <option value="ANDROID">Android only</option>
                  <option value="IOS">iOS only</option>
                </select>
              </label>
              <label>
                Deep link (optional)
                <input name="deepLink" placeholder="myapp://home" />
              </label>
              <label>
                Image URL (optional)
                <input name="imageUrl" type="url" placeholder="https://" />
              </label>
              <div className="push-actions">
                <button className="push-primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save draft"}
                </button>
              </div>
            </Form>
          </section>

          <section className="push-panel">
            <h2>Firebase credentials</h2>
            <p className="hint">
              Paste the service-account JSON. It stays on the server and never
              returns to the browser.
            </p>
            <Form method="post" className="push-form">
              <input type="hidden" name="intent" value="save_firebase" />
              <input type="hidden" name="mobileAppId" value={data.mobileApp.id} />
              <label>
                Service account JSON
                <textarea
                  className="code"
                  name="serviceAccountText"
                  required
                  placeholder='{"type":"service_account","project_id":"..."}'
                />
              </label>
              <div className="push-actions">
                <button className="push-primary" type="submit" disabled={busy}>
                  {firebaseReady ? "Replace credentials" : "Save credentials"}
                </button>
              </div>
            </Form>
          </section>
        </div>

        <section className="push-panel">
          <h2>Campaigns</h2>
          <p className="hint">
            Send now needs Firebase + at least one registered device token for a
            visible phone push.
          </p>
          {data.campaigns.length === 0 ? (
            <p className="hint">No campaigns yet.</p>
          ) : (
            <div className="push-list">
              {data.campaigns.map((campaign) => (
                <article key={campaign.id} className="push-item">
                  <div className="push-item-top">
                    <div>
                      <h3>{campaign.name}</h3>
                      <p>
                        {campaign.title} — {campaign.message}
                      </p>
                    </div>
                    <span className="push-badge">{campaign.status}</span>
                  </div>
                  <div className="push-meta">
                    <span>{campaign.audienceType}</span>
                    <span>accepted {campaign.acceptedCount}</span>
                    <span>failed {campaign.failedCount}</span>
                    <span>invalid {campaign.invalidTokenCount}</span>
                  </div>
                  {["DRAFT", "SCHEDULED"].includes(campaign.status) ? (
                    <div className="push-actions">
                      <Form method="post">
                        <input type="hidden" name="intent" value="send_now" />
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <button className="push-danger" type="submit" disabled={busy || !firebaseReady}>
                          Send now
                        </button>
                      </Form>
                      {campaign.status === "DRAFT" ? (
                        <Form method="post" className="push-form" style={{ gridTemplateColumns: "1fr auto", alignItems: "end" }}>
                          <input type="hidden" name="intent" value="schedule" />
                          <input type="hidden" name="campaignId" value={campaign.id} />
                          <label>
                            Schedule (local)
                            <input name="scheduledAt" type="datetime-local" required />
                          </label>
                          <button className="push-secondary" type="submit" disabled={busy}>
                            Schedule
                          </button>
                        </Form>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
