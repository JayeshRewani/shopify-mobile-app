const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalPostgresUrl(url) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("Database URL is required.");
  }
  if (/supabase|pooler\.supabase|vercel\.app/i.test(url)) {
    throw new Error("Refusing a non-local database URL.");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Database URL must be a Postgres URL.");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Database URL must use the postgresql protocol.");
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error("Refusing a non-local database URL.");
  }

  return url;
}
