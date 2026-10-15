import { createFileRoute } from "@tanstack/react-router";
import { solanaPayLabel, solanaPayOptions, solanaPayTransaction } from "@/lib/kamino/solana-pay.server";

/** Solana Pay transaction request that proves wallet ownership (a signed memo; no tokens move). */
export const Route = createFileRoute("/api/solana-pay/link")({
  server: {
    handlers: {
      GET: () => solanaPayLabel(),
      POST: ({ request }: { request: Request }) => solanaPayTransaction(request, "link"),
      OPTIONS: () => solanaPayOptions(),
    },
  },
});
