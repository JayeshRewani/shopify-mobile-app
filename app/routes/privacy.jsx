import { Link, useLoaderData } from "react-router";
import "../styles/legal.css";

export const meta = () => [
  { title: "Privacy Policy · AppMint" },
  {
    name: "description",
    content:
      "How AppMint collects, uses, and protects merchant and customer data for the Shopify mobile sales channel.",
  },
];

export const loader = async () => {
  return {
    supportEmail: process.env.SUPPORT_EMAIL || "rehwanij@gmail.com",
    updatedAt: "November 16, 2026",
  };
};

export default function PrivacyPolicy() {
  const { supportEmail, updatedAt } = useLoaderData();

  return (
    <main className="legal-page">
      <div className="legal-shell">
        <p className="legal-kicker">AppMint</p>
        <h1>Privacy Policy</h1>
        <p className="legal-meta">Last updated: {updatedAt}</p>

        <article className="legal-card">
          <p>
            AppMint (“we”, “us”, “our”) is a Shopify sales channel that helps
            merchants design and publish a branded mobile shopping experience
            for their store. This policy explains what personal data we process,
            why we process it, and how merchants and customers can contact us.
          </p>

          <h2>1. Who this policy covers</h2>
          <p>This policy covers:</p>
          <ul>
            <li>
              <strong>Merchants</strong> who install AppMint on a Shopify store
            </li>
            <li>
              <strong>Customers and visitors</strong> of those merchants when
              order, account, or notification features process customer-related
              data
            </li>
          </ul>

          <h2>2. Data we process</h2>
          <p>Depending on how the merchant uses AppMint, we may process:</p>
          <ul>
            <li>
              Shop domain, shop name, currency, and app configuration (design,
              navigation, brand settings)
            </li>
            <li>
              Storefront access credentials created for the mobile app (stored
              on our servers; not shown in the merchant UI)
            </li>
            <li>
              Catalog-related data needed to preview and render the mobile
              experience (products, collections, content the merchant selects)
            </li>
            <li>
              Order and fulfillment data delivered by Shopify webhooks, used to
              show order status in the mobile app and to send related push
              notifications
            </li>
            <li>
              Customer identifiers needed for order access (for example customer
              id, order number, and email for guest order verification)
            </li>
            <li>
              Device push tokens and registration keys when push notifications
              are enabled
            </li>
            <li>
              Merchant contact details submitted for “Publish my app” help
              requests (name and phone)
            </li>
            <li>
              Technical logs needed to operate, secure, and debug the service
            </li>
          </ul>
          <p>
            Admin API access tokens stay on our servers. The mobile client
            receives a Storefront access token and published design data — not
            Admin credentials.
          </p>

          <h2>3. Why we process data</h2>
          <ul>
            <li>Provide AppMint’s mobile design studio and publish features</li>
            <li>
              Sync catalog access and sales-channel configuration for the phone
              app
            </li>
            <li>
              Power order history, guest order access, and order-related push
              notifications
            </li>
            <li>
              Respond to merchant support and app-publishing assistance requests
            </li>
            <li>Maintain security, prevent abuse, and meet legal obligations</li>
          </ul>
          <p>
            We do not sell personal data. We do not use merchant customer data
            for unrelated advertising.
          </p>

          <h2>4. Legal roles</h2>
          <p>
            For merchant store data processed through Shopify APIs, the merchant
            is typically the controller of their customer data, and AppMint
            processes that data to provide the app’s features. Merchants should
            also review Shopify’s terms and their own privacy policy for their
            storefront and checkout.
          </p>

          <h2>5. Sharing</h2>
          <p>We may share data with:</p>
          <ul>
            <li>
              <strong>Shopify</strong>, as required to operate the installed app
              and APIs
            </li>
            <li>
              <strong>Infrastructure providers</strong> that host our database,
              application, email, or notification delivery (for example cloud
              hosting and push providers configured by the merchant)
            </li>
            <li>
              <strong>Service providers</strong> who help us operate support or
              infrastructure under appropriate agreements
            </li>
            <li>
              Authorities when required by law or to protect rights and safety
            </li>
          </ul>

          <h2>6. Retention</h2>
          <p>
            We keep personal data only as long as needed for the purposes above,
            including while the app remains installed and for a reasonable period
            afterward for backups, dispute handling, and legal compliance. When
            a merchant uninstalls AppMint, we process uninstall webhooks and
            remove or de-identify data that is no longer required.
          </p>

          <h2>7. Security</h2>
          <p>
            We use industry-standard safeguards, including encryption in transit
            (HTTPS), access controls for production systems, and separation of
            Admin credentials from the mobile client. No method of transmission
            or storage is 100% secure; merchants should protect their Shopify
            admin access and Firebase / push credentials.
          </p>

          <h2>8. International transfers</h2>
          <p>
            Our hosting and subprocessors may process data in regions outside
            the merchant’s or customer’s country. Where required, we rely on
            appropriate transfer mechanisms and contractual protections.
          </p>

          <h2>9. Merchant and customer rights</h2>
          <p>
            Depending on applicable law, individuals may request access,
            correction, deletion, or restriction of personal data. Customers
            should usually contact the merchant first for store-related
            requests. Merchants and individuals can also contact us at the email
            below and we will help as appropriate for data we control or process.
          </p>

          <h2>10. Children</h2>
          <p>
            AppMint is intended for merchants operating commercial Shopify
            stores. It is not directed at children.
          </p>

          <h2>11. Changes</h2>
          <p>
            We may update this policy from time to time. The “Last updated” date
            at the top will change when we publish revisions. Continued use of
            AppMint after an update means the revised policy applies.
          </p>

          <h2>12. Contact</h2>
          <p>
            Privacy or support questions:{" "}
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </p>
          <p>
            App: AppMint · Hosted at{" "}
            <a href="https://appmint-mobile-app.vercel.app">
              appmint-mobile-app.vercel.app
            </a>
          </p>
        </article>

        <p className="legal-meta" style={{ marginTop: 24 }}>
          <Link to="/">Back to AppMint</Link>
        </p>
      </div>
    </main>
  );
}
