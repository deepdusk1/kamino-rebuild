import { createFileRoute } from "@tanstack/react-router";

async function webhook({ request }: { request: Request }) {
  const { getBillingConfig, applyStripeEvent } = await import("@/lib/kamino/billing.server");
  const config = getBillingConfig();
  const headers = { "cache-control": "no-store", "content-type": "application/json" };
  if (!config.enabled) return new Response(JSON.stringify({ error: "Payments are disabled." }), { status: 503, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response(JSON.stringify({ error: "JSON required." }), { status: 415, headers });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > 1024 * 1024) return new Response(JSON.stringify({ error: "Payload too large." }), { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) return new Response(JSON.stringify({ error: "Empty payload." }), { status: 400, headers });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > 1024 * 1024) { await reader.cancel(); return new Response(JSON.stringify({ error: "Payload too large." }), { status: 413, headers }); }
    chunks.push(next.value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  let event;
  try {
    const { verifyStripeEvent } = await import("@/lib/kamino/billing-rules");
    event = verifyStripeEvent(body, request.headers.get("stripe-signature") ?? "", config.webhookSecret, Math.floor(Date.now() / 1000), config.mode === "live");
  } catch { return new Response(JSON.stringify({ error: "Invalid signature or payment event." }), { status: 400, headers }); }
  try {
    const { internals } = await import("@/lib/kamino/server");
    const result = await applyStripeEvent(await internals.db(), event, body, config);
    return new Response(JSON.stringify({ received: true, duplicate: result.duplicate }), { headers });
  } catch { return new Response(JSON.stringify({ error: "Payment event processing failed. Retry required." }), { status: 503, headers }); }
}
export const Route = createFileRoute("/api/v1/billing/stripe-webhook")({ server: { handlers: { POST: webhook } } });
