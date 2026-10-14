import { KaminoMark } from "@/components/k/Brand";

/**
 * The Kamino logo (old name, kept for existing screens). It now draws the redesigned planet mark; `size` is the
 * height, as before.
 */
export function KMark({ size = 40 }: { size?: number }) {
  return <KaminoMark size={size} />;
}
