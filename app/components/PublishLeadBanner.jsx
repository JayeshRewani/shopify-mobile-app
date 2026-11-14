import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import "../styles/publish-lead.css";

/**
 * Banner / modal shown when a merchant wants to publish the native app.
 * Collects name + mobile so the team can set up Play Console, App Store, and Firebase.
 */
export function PublishLeadBanner({
  open,
  onClose,
  onSubmitted,
  shopName = "your store",
  action = "/app/publish-request",
  alreadyRequested = false,
}) {
  const fetcher = useFetcher();
  const titleId = useId();
  const handledLeadRef = useRef("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const busy = fetcher.state !== "idle";
  const submitted = fetcher.data?.ok === true;
  const error = fetcher.data?.ok === false ? fetcher.data.error : "";

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const leadId = fetcher.data?.ok ? String(fetcher.data.leadId || "ok") : "";
    if (!leadId || handledLeadRef.current === leadId) return undefined;
    handledLeadRef.current = leadId;
    onSubmitted?.();
    const timer = window.setTimeout(() => onClose?.(), 2200);
    return () => window.clearTimeout(timer);
  }, [fetcher.data, onClose, onSubmitted]);

  if (!open) return null;

  return (
    <div className="publish-lead-overlay" role="presentation" onClick={onClose}>
      <div
        className="publish-lead-banner"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="publish-lead-close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>

        {submitted || alreadyRequested ? (
          <div className="publish-lead-success">
            <span className="publish-lead-check" aria-hidden="true">
              ✓
            </span>
            <h2 id={titleId}>
              {submitted ? "Request received" : "We already have your request"}
            </h2>
            <p>
              Our team will contact you to set up Google Play, App Store, and Firebase — then build
              and launch {shopName} on both platforms.
            </p>
          </div>
        ) : (
          <>
            <p className="publish-lead-kicker">Go live</p>
            <h2 id={titleId}>Publish {shopName} on the stores</h2>
            <p className="publish-lead-copy">
              Native apps need a Google Play developer account, Apple developer setup, and Firebase
              for push. Leave your name and mobile — we handle the console setup, build, and
              launch on both platforms.
            </p>

            <ul className="publish-lead-points">
              <li>Google Play Console &amp; developer account</li>
              <li>Apple App Store setup</li>
              <li>Firebase push notification account</li>
              <li>App build &amp; store listing live</li>
            </ul>

            <fetcher.Form method="post" action={action} className="publish-lead-form">
              <input type="hidden" name="intent" value="publish_lead" />
              <label>
                Your name
                <input
                  name="name"
                  required
                  autoComplete="name"
                  minLength={2}
                  maxLength={80}
                  placeholder="Priya Sharma"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Mobile number
                <input
                  name="phone"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={24}
                  placeholder="+91 98XXX XXXXX"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
              {error ? <p className="publish-lead-error">{error}</p> : null}
              <div className="publish-lead-actions">
                <button className="publish-lead-primary" type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Request app launch"}
                </button>
                <button className="publish-lead-ghost" type="button" onClick={onClose}>
                  Not now
                </button>
              </div>
            </fetcher.Form>
          </>
        )}
      </div>
    </div>
  );
}
