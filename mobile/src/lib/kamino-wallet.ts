import { Linking } from "react-native";

/**
 * Opening the person's Solana wallet app (Phantom, Solflare, …) with a Solana Pay link, and waiting for the result.
 * The wallet shows exactly what will happen and the person approves it there; Kamino never sees a private key.
 */
export async function openInWallet(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    throw new Error("No Solana wallet app was found on this phone. Install Phantom or Solflare, then try again.");
  }
}

export { cleanAmountInput, pollUntil, shortAddress } from "./kamino-wallet-pure";
