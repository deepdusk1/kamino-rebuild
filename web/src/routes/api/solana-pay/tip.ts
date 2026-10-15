import { createFileRoute } from "@tanstack/react-router";
import { solanaPayLabel, solanaPayOptions, solanaPayTransaction } from "@/lib/kamino/solana-pay.server";

/** Solana Pay transaction request for a KAMINO tip (opened from the app as `solana:https://…/api/solana-pay/tip?ref=…`). */
export const Route = createFileRoute("/api/solana-pay/tip")({
  server: {
    handlers: {
      GET: () => solanaPayLabel(),
      POST: ({ request }: { request: Request }) => solanaPayTransaction(request, "tip"),
      OPTIONS: () => solanaPayOptions(),
    },
  },
});
