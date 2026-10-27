import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <main className={styles.page}>
      <section className={styles.brand}>
        <div>
          <p className={styles.kicker}>Mobile app</p>
          <h1>Your store, designed for a phone.</h1>
          <p>
            Merchants build the home screen in Shopify admin. The phone reads
            that design and the live catalog. A new color or layout does not
            need a new app build.
          </p>
        </div>
        <ul className={styles.points}>
          <li>
            <strong>Brand</strong>
            Colors, a tagline, and a promo bar.
          </li>
          <li>
            <strong>Type</strong>
            Heading and body fonts the phone can already draw.
          </li>
          <li>
            <strong>Home</strong>
            Banners, categories, and product sections from real collections.
          </li>
          <li>
            <strong>Publish</strong>
            The phone loads it the next time a customer opens the app.
          </li>
        </ul>
      </section>
      <section className={styles.panel}>
        <div className={styles.card}>
          <h2>Open your store</h2>
          <p>Sign in with the shop you want to turn into a mobile app.</p>
          {showForm ? (
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                Shop domain
                <input className={styles.input} type="text" name="shop" />
                <span className={styles.hint}>example.myshopify.com</span>
              </label>
              <button className={styles.button} type="submit">
                Continue
              </button>
            </Form>
          ) : (
            <p>Install the app from Shopify admin to start designing.</p>
          )}
        </div>
      </section>
    </main>
  );
}
