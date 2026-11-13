import { useEffect, useMemo, useRef, useState } from "react";
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
  const fileRef = useRef(null);

  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [previewOs, setPreviewOs] = useState("ios");
  const [firebaseText, setFirebaseText] = useState("");
  const [fileName, setFileName] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    title: "",
    message: "",
    audienceType: "ALL",
    deepLink: "",
    imageUrl: "",
  });

  useEffect(() => {
    if (actionData?.ok && actionData.message) {
      shopify.toast.show(actionData.message);
    }
  }, [actionData, shopify]);

  useEffect(() => {
    if (actionData?.ok && actionData.campaignId) {
      setDraft({
        name: "",
        title: "",
        message: "",
        audienceType: "ALL",
        deepLink: "",
        imageUrl: "",
      });
    }
  }, [actionData]);

  useEffect(() => {
    if (actionData?.ok && actionData.firebase) {
      setFirebaseText("");
      setFileName("");
    }
  }, [actionData]);

  const firebaseReady = Boolean(data.firebase?.configured);
  const hasKey = Boolean(data.mobileApp.hasRegistrationKey);
  const shopLabel = displayShopName(data.shopDomain);
  const setupComplete = firebaseReady && hasKey;
  const canSend = firebaseReady && data.deviceCount > 0;

  const filteredCampaigns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.campaigns.filter((campaign) => {
      if (tab === "drafts" && campaign.status !== "DRAFT") return false;
      if (
        tab === "sent" &&
        !["COMPLETED", "FAILED", "PROCESSING", "QUEUED"].includes(campaign.status)
      ) {
        return false;
      }
      if (!q) return true;
      return [campaign.name, campaign.title, campaign.message, campaign.status]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data.campaigns, query, tab]);

  const latestDraft = data.campaigns.find((campaign) => campaign.status === "DRAFT");
  const previewTitle = draft.title.trim() || "Notification title";
  const previewMessage =
    draft.message.trim() ||
    "Compose your push notification message and a preview will appear here.";

  const onPickFirebaseFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      setFirebaseText(text);
      setFileName(file.name);
      shopify.toast.show(`Loaded ${file.name}`);
    } catch {
      shopify.toast.show("That file is not valid service-account JSON.");
      setFileName("");
    }
    event.target.value = "";
  };

  return (
    <div className="push-shell">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onPickFirebaseFile}
      />
      <div className="push-wrap">
        <header className="push-hero">
          <div>
            <p className="push-kicker">Engage</p>
            <h1>Create a campaign</h1>
            <p>
              Write a push, preview it on a lock screen, then save a draft. Send or schedule when
              devices are ready.
            </p>
          </div>
          <div className="push-hero-meta">
            <div className="push-reach">
              <strong>{data.deviceCount}</strong>
              <span>
                Push {data.deviceCount === 1 ? "device" : "devices"} · {shopLabel}
              </span>
            </div>
            <div className="push-hero-actions">
              {latestDraft ? (
                <>
                  <Form method="post">
                    <input type="hidden" name="intent" value="send_now" />
                    <input type="hidden" name="campaignId" value={latestDraft.id} />
                    <button
                      className="push-secondary"
                      type="submit"
                      disabled={busy || !canSend}
                      title={
                        !firebaseReady
                          ? "Connect Firebase first"
                          : data.deviceCount < 1
                            ? "Register at least one device"
                            : "Send latest draft now"
                      }
                    >
                      Send now
                    </button>
                  </Form>
                  <a className="push-primary" href="#create-campaign">
                    Edit draft
                  </a>
                </>
              ) : (
                <a className="push-primary" href="#create-campaign">
                  Start composing
                </a>
              )}
            </div>
          </div>
        </header>

        {actionData?.error ? <div className="push-flash err">{actionData.error}</div> : null}
        {actionData?.ok && actionData.message ? (
          <div className="push-flash ok">{actionData.message}</div>
        ) : null}

        <section className="push-checklist" aria-label="Push readiness">
          <SetupChip
            done={firebaseReady}
            label="Firebase connected"
            detail={firebaseReady ? "Credentials saved" : "Upload service account JSON"}
            href="#push-setup"
          />
          <SetupChip
            done={hasKey}
            label="Registration key"
            detail={hasKey ? "Key configured" : "Generate for the phone app"}
            href="#push-setup"
          />
          <SetupChip
            done={data.deviceCount > 0}
            label="Devices registered"
            detail={
              data.deviceCount > 0
                ? `${data.deviceCount} ready to receive`
                : "Install app + register FCM token"
            }
            href="#create-campaign"
          />
        </section>

        {!setupComplete ? (
          <section id="push-setup" className="push-setup-card">
            <div className="push-setup-intro">
              <p className="push-step">Before you send</p>
              <h2>Connect push delivery</h2>
              <p>One-time: Firebase credentials, then a registration key for the phone app.</p>
            </div>

            <div className="push-setup-grid">
              <div className={`push-setup-block ${firebaseReady ? "is-ready" : ""}`}>
                <div className="push-setup-block-head">
                  <span className="push-setup-num">1</span>
                  <div>
                    <strong>Firebase credentials</strong>
                    <p>
                      Upload a service-account <code>.json</code> or paste it below. Stored on the
                      server only.
                    </p>
                  </div>
                </div>
                <Form method="post" className="push-form">
                  <input type="hidden" name="intent" value="save_firebase" />
                  <input type="hidden" name="mobileAppId" value={data.mobileApp.id} />
                  <input type="hidden" name="serviceAccountText" value={firebaseText} />

                  <div className="push-upload-row">
                    <button
                      className="push-secondary"
                      type="button"
                      onClick={() => fileRef.current?.click()}
                    >
                      {fileName ? "Replace JSON file" : "Upload JSON file"}
                    </button>
                    {fileName ? <span className="push-file-name">{fileName}</span> : null}
                    {firebaseReady ? (
                      <span className="push-pill is-done">Connected</span>
                    ) : (
                      <span className="push-pill is-warn">Required</span>
                    )}
                  </div>

                  <label>
                    Or paste JSON
                    <textarea
                      className="code"
                      placeholder='{"type":"service_account","project_id":"..."}'
                      value={firebaseText}
                      onChange={(event) => {
                        setFirebaseText(event.target.value);
                        setFileName("");
                      }}
                    />
                  </label>
                  <div className="push-actions">
                    <button
                      className="push-primary"
                      type="submit"
                      disabled={busy || !firebaseText.trim()}
                    >
                      {firebaseReady ? "Replace credentials" : "Save credentials"}
                    </button>
                  </div>
                </Form>
              </div>

              <div className={`push-setup-block ${hasKey ? "is-ready" : ""}`}>
                <div className="push-setup-block-head">
                  <span className="push-setup-num">2</span>
                  <div>
                    <strong>Device registration key</strong>
                    <p>Copy once into the phone app config for FCM registration.</p>
                  </div>
                </div>
                {actionData?.registrationKey ? (
                  <label className="push-form">
                    Copy this key now — it will not be shown again
                    <textarea className="code" readOnly value={actionData.registrationKey} />
                  </label>
                ) : (
                  <p className="push-inline-hint">
                    {hasKey
                      ? "A key is already stored (hash only). Rotate only if you need a new secret."
                      : "No key yet — generate one before devices can register."}
                  </p>
                )}
                <Form method="post" className="push-actions">
                  <input type="hidden" name="intent" value="rotate_registration_key" />
                  <button className="push-secondary" type="submit" disabled={busy}>
                    {hasKey ? "Rotate registration key" : "Generate registration key"}
                  </button>
                </Form>
              </div>
            </div>
          </section>
        ) : null}

        <section id="create-campaign" className="push-composer" aria-labelledby="composer-title">
          <div className="push-panel">
            <div className="push-panel-head">
              <div>
                <p className="push-step">Compose</p>
                <h2 id="composer-title">Write your message</h2>
                <p className="hint">
                  Follow the steps. Save a draft first — send and schedule live on each campaign
                  below.
                </p>
              </div>
            </div>

            <Form method="post" className="push-form">
              <input type="hidden" name="intent" value="create_campaign" />
              <input type="hidden" name="mobileAppId" value={data.mobileApp.id} />

              <div className="push-step-block">
                <div className="push-step-title">
                  <span>1</span>
                  <strong>Add an audience</strong>
                </div>
                <label>
                  Who should receive this?
                  <select
                    name="audienceType"
                    value={draft.audienceType}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, audienceType: event.target.value }))
                    }
                  >
                    <option value="ALL">All users</option>
                    <option value="ANDROID">Android only</option>
                    <option value="IOS">iOS only</option>
                  </select>
                </label>
              </div>

              <div className="push-step-block">
                <div className="push-step-title">
                  <span>2</span>
                  <strong>Choose a channel</strong>
                </div>
                <div className="push-channels" role="group" aria-label="Delivery channel">
                  <button className="push-channel is-selected" type="button" aria-pressed="true">
                    <span className="push-channel-check" aria-hidden="true">
                      ✓
                    </span>
                    <span className="push-channel-icon" aria-hidden="true">
                      ✈
                    </span>
                    <strong>Push notification</strong>
                    <span>Lock screen &amp; system tray</span>
                  </button>
                  <button
                    className="push-channel is-disabled"
                    type="button"
                    disabled
                    aria-disabled="true"
                  >
                    <span className="push-channel-icon" aria-hidden="true">
                      ✉
                    </span>
                    <strong>Inbox message</strong>
                    <span>Coming soon</span>
                  </button>
                  <button
                    className="push-channel is-disabled"
                    type="button"
                    disabled
                    aria-disabled="true"
                  >
                    <span className="push-channel-icon" aria-hidden="true">
                      ⊕
                    </span>
                    <strong>Both</strong>
                    <span>Coming soon</span>
                  </button>
                </div>
              </div>

              <div className="push-step-block">
                <div className="push-step-title">
                  <span>3</span>
                  <strong>Write your message</strong>
                </div>
                <label>
                  Internal name
                  <small>Only you see this in the campaign list.</small>
                  <input
                    name="name"
                    required
                    placeholder="Weekend edit"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Notification title
                  <input
                    name="title"
                    required
                    maxLength={80}
                    placeholder="Your weekend rotation is here"
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                  <span className="push-field-meta">
                    <span>Keep it short — under 50 characters works best</span>
                    <span>{draft.title.length}/80</span>
                  </span>
                </label>
                <label>
                  Message
                  <textarea
                    name="message"
                    required
                    maxLength={500}
                    placeholder="Fresh fits. Easy layers. Find your next everyday favourite."
                    value={draft.message}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, message: event.target.value }))
                    }
                  />
                  <span className="push-field-meta">
                    <span>Aim for under 120 characters on lock screens</span>
                    <span>{draft.message.length}/500</span>
                  </span>
                </label>
                <div className="push-optional-grid">
                  <label>
                    Deep link
                    <small>Optional · opens a screen in the app</small>
                    <input
                      name="deepLink"
                      placeholder="myapp://home"
                      value={draft.deepLink}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, deepLink: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Image URL
                    <small>Optional · rich notification image</small>
                    <input
                      name="imageUrl"
                      type="url"
                      placeholder="https://"
                      value={draft.imageUrl}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, imageUrl: event.target.value }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="push-actions">
                <button className="push-primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save draft"}
                </button>
                <a className="push-secondary" href="#campaigns">
                  View campaigns
                </a>
              </div>
            </Form>
          </div>

          <aside className="push-preview" aria-label="Lock screen preview">
            <div className="push-preview-head">
              <div>
                <p className="push-step">Live preview</p>
                <h2>Lock screen</h2>
              </div>
              <div className="push-preview-toggle" role="group" aria-label="Preview platform">
                <button
                  type="button"
                  className={previewOs === "ios" ? "is-active" : ""}
                  onClick={() => setPreviewOs("ios")}
                >
                  iOS
                </button>
                <button
                  type="button"
                  className={previewOs === "android" ? "is-active" : ""}
                  onClick={() => setPreviewOs("android")}
                >
                  Android
                </button>
              </div>
            </div>

            <div className={`push-phone is-${previewOs}`}>
              <div className="push-phone-bezel">
                <div className="push-phone-screen">
                  <div className="push-phone-island" aria-hidden="true" />
                  <p className="push-phone-time">9:41</p>
                  <p className="push-phone-date">
                    {previewOs === "ios" ? "Friday, November 13" : "Fri, Nov 13"}
                  </p>
                  <div className="push-lock-card">
                    <span className="push-lock-icon" aria-hidden="true">
                      {shopLabel.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <div className="push-lock-meta">
                        <span>{shopLabel}</span>
                        <span>now</span>
                      </div>
                      <strong>{previewTitle}</strong>
                      <p>{previewMessage}</p>
                      {draft.imageUrl ? (
                        <div
                          className="push-lock-image"
                          style={{ backgroundImage: `url(${JSON.stringify(draft.imageUrl)})` }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="push-preview-note">Updates as you type · approximate system look</p>
          </aside>
        </section>

        <section id="campaigns" className="push-panel push-history" aria-labelledby="campaigns-title">
          <div className="push-toolbar">
            <div>
              <p className="push-step">History</p>
              <h2 id="campaigns-title">All campaigns</h2>
              <p className="hint" style={{ marginBottom: 0 }}>
                “Accepted” means the provider took the request — not that every phone showed it.
              </p>
            </div>
            <div className="push-toolbar-controls">
              <div className="push-tabs" role="tablist" aria-label="Filter campaigns">
                {[
                  ["all", "All"],
                  ["drafts", "Drafts"],
                  ["sent", "Sent"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    className={tab === value ? "is-active" : ""}
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                className="push-search"
                type="search"
                placeholder="Search campaigns"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search campaigns"
              />
            </div>
          </div>

          {filteredCampaigns.length === 0 ? (
            <div className="push-empty">
              <strong>
                {data.campaigns.length === 0 ? "No campaigns yet" : "Nothing matches"}
              </strong>
              <p>
                {data.campaigns.length === 0
                  ? "Save your first draft above — it will show up here ready to send or schedule."
                  : "Try another filter or clear the search."}
              </p>
              {data.campaigns.length === 0 ? (
                <a className="push-primary" href="#create-campaign">
                  Create campaign
                </a>
              ) : null}
            </div>
          ) : (
            <div className="push-campaign-list">
              {filteredCampaigns.map((campaign) => (
                <article key={campaign.id} className="push-campaign-card">
                  <div className="push-campaign-main">
                    <div className="push-campaign-title-row">
                      <strong>{campaign.name}</strong>
                      <span className={`push-pill ${badgeTone(campaign.status)}`}>
                        {statusLabel(campaign.status)}
                      </span>
                    </div>
                    <p className="push-campaign-copy">
                      <span>{campaign.title}</span>
                      {campaign.message ? ` — ${campaign.message}` : ""}
                    </p>
                    <div className="push-campaign-meta">
                      <span>{audienceLabel(campaign.audienceType)}</span>
                      <span>
                        accepted {campaign.acceptedCount} · failed {campaign.failedCount} · invalid{" "}
                        {campaign.invalidTokenCount}
                      </span>
                    </div>
                  </div>
                  <div className="push-campaign-actions">
                    {["DRAFT", "SCHEDULED"].includes(campaign.status) ? (
                      <>
                        <Form method="post">
                          <input type="hidden" name="intent" value="send_now" />
                          <input type="hidden" name="campaignId" value={campaign.id} />
                          <button
                            className="push-primary"
                            type="submit"
                            disabled={busy || !canSend}
                            title={
                              !firebaseReady
                                ? "Add Firebase credentials first"
                                : data.deviceCount < 1
                                  ? "Register at least one device"
                                  : "Queue this campaign now"
                            }
                          >
                            Send now
                          </button>
                        </Form>
                        {campaign.status === "DRAFT" ? (
                          <Form method="post" className="push-inline-schedule">
                            <input type="hidden" name="intent" value="schedule" />
                            <input type="hidden" name="campaignId" value={campaign.id} />
                            <input
                              name="scheduledAt"
                              type="datetime-local"
                              required
                              aria-label="Schedule date and time"
                            />
                            <button className="push-secondary" type="submit" disabled={busy}>
                              Schedule
                            </button>
                          </Form>
                        ) : null}
                      </>
                    ) : (
                      <span className="push-inline-hint">No actions</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {setupComplete ? (
          <details id="push-setup" className="push-setup">
            <summary>Connections &amp; advanced setup</summary>
            <div className="push-setup-body">
              <section>
                <h2>Device registration key</h2>
                <p className="hint">
                  Rotate only if a key was exposed. The raw value is shown once after you generate
                  it.
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
                    Rotate registration key
                  </button>
                </Form>
              </section>
              <section>
                <h2>Firebase credentials</h2>
                <p className="hint">Upload a new service-account JSON or paste to replace.</p>
                <Form method="post" className="push-form">
                  <input type="hidden" name="intent" value="save_firebase" />
                  <input type="hidden" name="mobileAppId" value={data.mobileApp.id} />
                  <input type="hidden" name="serviceAccountText" value={firebaseText} />
                  <div className="push-upload-row">
                    <button
                      className="push-secondary"
                      type="button"
                      onClick={() => fileRef.current?.click()}
                    >
                      Upload JSON file
                    </button>
                    {fileName ? <span className="push-file-name">{fileName}</span> : null}
                  </div>
                  <label>
                    Or paste JSON
                    <textarea
                      className="code"
                      placeholder='{"type":"service_account","project_id":"..."}'
                      value={firebaseText}
                      onChange={(event) => {
                        setFirebaseText(event.target.value);
                        setFileName("");
                      }}
                    />
                  </label>
                  <div className="push-actions">
                    <button
                      className="push-primary"
                      type="submit"
                      disabled={busy || !firebaseText.trim()}
                    >
                      Replace credentials
                    </button>
                  </div>
                </Form>
              </section>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function SetupChip({ done, label, detail, href }) {
  return (
    <a className={`push-chip ${done ? "is-done" : "is-todo"}`} href={href}>
      <span className="push-chip-mark" aria-hidden="true">
        {done ? "✓" : "!"}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </a>
  );
}

function displayShopName(shopDomain = "") {
  return String(shopDomain).replace(/\.myshopify\.com$/i, "") || "Your store";
}

function audienceLabel(value) {
  if (value === "ANDROID") return "Android";
  if (value === "IOS") return "iOS";
  return "All users";
}

function statusLabel(status) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SCHEDULED":
      return "Scheduled";
    case "QUEUED":
      return "Queued";
    case "PROCESSING":
      return "Processing";
    case "COMPLETED":
      return "Accepted";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

function badgeTone(status) {
  if (status === "COMPLETED") return "is-done";
  if (status === "FAILED") return "is-error";
  if (["SCHEDULED", "QUEUED", "PROCESSING"].includes(status)) return "is-warn";
  return "";
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
