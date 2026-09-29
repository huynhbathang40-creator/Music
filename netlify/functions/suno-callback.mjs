// SunoAPI requires a callBackUrl on every task. The app polls for results,
// so this endpoint only needs to acknowledge the callback with a 200.
export default async () =>
  new Response(JSON.stringify({ code: 200, msg: "received" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
