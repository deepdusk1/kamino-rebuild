export type ShelfKind = "mp4" | "youtube" | "vimeo" | "twitch";

export type ShelfTitle = {
  id: string;
  title: string;
  year: string;
  tagline: string;
  kind: ShelfKind;
  url: string;
  poster: string;
};

/** Open movies we can actually stream. Locked catalogs (Netflix, etc.) cannot. */
export const SHELF: ShelfTitle[] = [
  {
    id: "bunny",
    title: "Big Buck Bunny",
    year: "2008",
    tagline: "Blender open movie",
    kind: "mp4",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    poster: "/covers/starlight.jpg",
  },
  {
    id: "sintel",
    title: "Sintel",
    year: "2010",
    tagline: "Blender open movie",
    kind: "mp4",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    poster: "/covers/nightwatch.jpg",
  },
  {
    id: "tears",
    title: "Tears of Steel",
    year: "2012",
    tagline: "Blender open movie",
    kind: "mp4",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    poster: "/covers/keep.jpg",
  },
  {
    id: "elephants",
    title: "Elephants Dream",
    year: "2006",
    tagline: "The first open movie",
    kind: "mp4",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    poster: "/covers/ink-lore.jpg",
  },
];

const LOCKED =
  /\b(netflix|disneyplus|disney\+|hulu|max\.com|primevideo|amazon\.com\/gp\/video|hbomax|crunchyroll|paramountplus)\b/i;

export function parseWatchInput(raw: string): { kind: ShelfKind; url: string; title: string } | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "Paste a video link or pick a film." };
  if (LOCKED.test(t)) {
    return {
      error: "Netflix and other locked catalogs won’t share playback. Paste a YouTube, Vimeo or Twitch link, or pick a film from the shelf.",
    };
  }
  const yt =
    t.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/) ??
    t.match(/^([A-Za-z0-9_-]{11})$/);
  if (yt) {
    const id = yt[1]!;
    return { kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, title: "YouTube" };
  }
  const vimeo = t.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d{6,})/);
  if (vimeo) {
    const id = vimeo[1]!;
    return { kind: "vimeo", url: `https://player.vimeo.com/video/${id}`, title: "Vimeo" };
  }
  const twitchChannel = t.match(/^https?:\/\/(?:www\.)?twitch\.tv\/([A-Za-z0-9_]{2,25})\/?(?:\?.*)?$/i);
  const twitchVideo = t.match(/^https?:\/\/(?:www\.)?twitch\.tv\/videos\/(\d+)/i);
  if (twitchVideo) {
    return { kind: "twitch", url: `https://player.twitch.tv/?video=${twitchVideo[1]}`, title: "Twitch VOD" };
  }
  if (twitchChannel) {
    const name = twitchChannel[1]!.toLowerCase();
    if (name === "videos" || name === "directory" || name === "settings") {
      return { error: "Paste a channel link (twitch.tv/name) or a VOD link (twitch.tv/videos/123)." };
    }
    return { kind: "twitch", url: `https://player.twitch.tv/?channel=${name}`, title: "Twitch" };
  }
  if (/^https?:\/\/(?:player\.twitch\.tv\/)/i.test(t)) {
    const channel = t.match(/[?&]channel=([A-Za-z0-9_]+)/i);
    const video = t.match(/[?&]video=([A-Za-z0-9]+)/i);
    if (channel) return { kind: "twitch", url: `https://player.twitch.tv/?channel=${channel[1]!.toLowerCase()}`, title: "Twitch" };
    if (video) return { kind: "twitch", url: `https://player.twitch.tv/?video=${video[1]}`, title: "Twitch VOD" };
    return { error: "That Twitch player link is missing a channel or video." };
  }
  if (/^https?:\/\//i.test(t) && (/\.mp4(\?|$)/i.test(t) || /\.webm(\?|$)/i.test(t))) {
    return { kind: "mp4", url: t, title: "Direct video" };
  }
  if (/^https?:\/\//i.test(t)) {
    return { error: "Need a YouTube, Vimeo, Twitch link or a direct .mp4. Locked apps won’t play here." };
  }
  return { error: "Paste a YouTube, Vimeo or Twitch link, or pick a film from the shelf." };
}

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] ?? null;
}

export function vimeoId(url: string): string | null {
  const m = url.match(/player\.vimeo\.com\/video\/(\d{6,})/);
  return m?.[1] ?? null;
}

/** Live channel name or VOD id ("v1234567890") for a canonical Twitch player URL. */
export function twitchSource(url: string): { channel: string } | { video: string } | null {
  const channel = url.match(/[?&]channel=([A-Za-z0-9_]+)/i);
  if (channel) return { channel: channel[1]!.toLowerCase() };
  const video = url.match(/[?&]video=([A-Za-z0-9]+)/i);
  if (video) return { video: video[1]! };
  return null;
}
