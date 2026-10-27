export async function adminGraphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();

  if (body.errors?.length) {
    const error = new Error(
      body.errors.map((entry) => entry.message).join("; "),
    );
    error.graphQLErrors = body.errors;
    throw error;
  }

  return body.data;
}

export function isAccessDenied(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("access denied") ||
    message.includes("required access") ||
    message.includes("not approved to access")
  );
}
