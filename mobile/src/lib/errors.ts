import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { ApiError } from "@/api/client";

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function showError(error: unknown, title = "Couldn't do that") {
  Alert.alert(title, errorMessage(error));
}

/**
 * Wraps a button action: tracks "busy" (so the button can't be double-tapped) and shows any
 * failure in an alert instead of crashing.
 *   const [save, saving] = useAction(async () => { await api.something(); });
 */
export function useAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
  options?: { errorTitle?: string },
): [(...args: Args) => Promise<boolean>, boolean] {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (...args: Args) => {
      if (busy) return false;
      setBusy(true);
      try {
        await action(...args);
        return true;
      } catch (error) {
        showError(error, options?.errorTitle);
        return false;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action, busy],
  );
  return [run, busy];
}
