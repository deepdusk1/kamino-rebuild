export const TITLE_COLORS = [
  { id: "violet", hex: "#8b6cff", fg: "#ffffff" },
  { id: "cyan", hex: "#2ee6d6", fg: "#08201c" },
  { id: "pink", hex: "#ff6b9d", fg: "#ffffff" },
  { id: "gold", hex: "#f5c15c", fg: "#1a1408" },
  { id: "red", hex: "#e85d6c", fg: "#ffffff" },
  { id: "white", hex: "#f4f0ff", fg: "#160e24" },
  { id: "green", hex: "#5dcc9a", fg: "#062016" },
  { id: "orange", hex: "#ff8a4c", fg: "#1a0e06" },
  { id: "blue", hex: "#5b8cff", fg: "#ffffff" },
  { id: "ink", hex: "#1a1228", fg: "#f4f0ff" },
] as const;

export type TitleColorId = (typeof TITLE_COLORS)[number]["id"];

export function titleColor(hex: string) {
  return TITLE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase()) ?? TITLE_COLORS[0];
}

export function isAllowedTitleColor(hex: string) {
  return TITLE_COLORS.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
}

export const PROFILE_COVERS = [
  { id: "starlight", src: "/covers/starlight.jpg", label: "Night windows" },
  { id: "midnight-stage", src: "/covers/midnight-stage.jpg", label: "Stage" },
  { id: "pixel-realms", src: "/covers/pixel-realms.jpg", label: "Realms" },
  { id: "ink-lore", src: "/covers/ink-lore.jpg", label: "Ink" },
  { id: "atelier", src: "/covers/atelier.jpg", label: "Atelier" },
  { id: "nightwatch", src: "/covers/nightwatch.jpg", label: "Fog" },
  { id: "keep", src: "/covers/keep.jpg", label: "Keep" },
  { id: "vinyl-club", src: "/covers/vinyl-club.jpg", label: "Vinyl" },
  { id: "hero", src: "/covers/hero.jpg", label: "Hall" },
] as const;

export function isAllowedCover(src: string) {
  return src === "" || PROFILE_COVERS.some((c) => c.src === src);
}
