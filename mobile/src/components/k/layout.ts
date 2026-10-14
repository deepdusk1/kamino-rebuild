import { useWindowDimensions } from "react-native";

/**
 * Width of one card when `columns` cards fit across the screen, like the mockups' rows of four
 * (16px side padding, 8px gaps: about 94px each on a 430px-wide phone). Wide screens are capped at 600px of
 * content so cards don't grow huge on tablets / the web.
 */
export function useColumnWidth(columns = 4, { inset = 16, gap = 8, maxWidth = 600 }: { inset?: number; gap?: number; maxWidth?: number } = {}): number {
  const { width } = useWindowDimensions();
  const usable = Math.min(width, maxWidth) - inset * 2 - gap * (columns - 1);
  return Math.max(72, Math.floor(usable / columns));
}
