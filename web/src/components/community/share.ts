import { toast } from "sonner";

/**
 * Shares a link inside Kamino (`path` like "/c/anime-haven") with the device's share sheet when there is one,
 * otherwise copies it and says so.
 */
export async function shareLink(title: string, path: string) {
  const url = `${window.location.origin}${path}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
  } catch {
    return; // The person closed the share sheet.
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy the link");
  }
}
