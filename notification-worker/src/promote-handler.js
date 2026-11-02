export async function handler() {
  const { runPromote } = await import("./promote-runtime.js");
  const result = await runPromote();
  console.log(JSON.stringify({ promote: result }));
  return result;
}
