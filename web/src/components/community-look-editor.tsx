import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { GradientButton, hueGradient } from "@/components/k";
import { fieldClass } from "@/components/community/sheet";
import { communityColors } from "@/lib/kamino/theme";
import { PROFILE_COVERS } from "@/lib/kamino/titles";
import { getCommunityPage, updateCommunityLook } from "@/lib/kamino/server";
import { THEME_STYLES, type Community, type ThemeStyle } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

const STYLE_LABELS: Record<ThemeStyle, string> = {
  aurora: "Aurora",
  solid: "Solid",
  vivid: "Vivid",
  soft: "Soft",
  night: "Night",
};
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Reads a chosen picture file as a data URL, or explains what is wrong with it. */
function readPicture(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!PICTURE_TYPES.includes(file.type))
      return reject(new Error("Choose a PNG, JPEG or WebP picture."));
    if (file.size > maxBytes)
      return reject(
        new Error(
          `That picture is too large (limit ${Math.round((maxBytes / 1024 / 1024) * 10) / 10} MB).`,
        ),
      );
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that picture."));
    reader.readAsDataURL(file);
  });
}

/** Leaders: name, words, colour, style, banner and icon of the community, with a live preview. */
export function CommunityLookEditor({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ["community", slug],
    queryFn: () => getCommunityPage({ data: { slug } }),
  });
  const c = q.data?.community;
  if (!c) return null;
  // Keyed by the saved values, so the form starts fresh after every save.
  return (
    <Editor
      key={`${c.name}|${c.hue}|${c.themeStyle}|${c.cover}|${c.icon}`}
      slug={slug}
      community={c}
    />
  );
}

function Editor({ slug, community: c }: { slug: string; community: Community }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(c.name);
  const [tagline, setTagline] = useState(c.tagline);
  const [description, setDescription] = useState(c.description);
  const [rules, setRules] = useState(c.rules);
  const [hue, setHue] = useState(c.hue);
  const [style, setStyle] = useState<ThemeStyle>(c.themeStyle);
  const [cover, setCover] = useState(c.cover);
  const [coverUpload, setCoverUpload] = useState<string | undefined>();
  const [iconUpload, setIconUpload] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colors = communityColors(hue, style);
  const shownCover = coverUpload ?? cover;
  const shownIcon = iconUpload === null ? "" : (iconUpload ?? c.icon);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateCommunityLook({
        data: {
          slug,
          name,
          tagline,
          description,
          rules,
          hue,
          themeStyle: style,
          ...(coverUpload !== undefined ? { coverUpload } : cover !== c.cover ? { cover } : {}),
          ...(iconUpload !== undefined ? { iconUpload } : {}),
        },
      });
      await queryClient.invalidateQueries();
      toast.success("Saved. Your community looks new.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined, maxBytes: number, apply: (dataUrl: string) => void) {
    if (!file) return;
    try {
      apply(await readPicture(file, maxBytes));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use that picture.");
    }
  }

  const label = "block space-y-1.5 text-[13.5px] font-bold text-ink";
  return (
    <section id="look" className="k-card scroll-mt-24 space-y-4 rounded-card p-4 lg:p-5" aria-labelledby="look-title">
      <div>
        <h2 id="look-title" className="flex items-center gap-2 text-[18px] font-extrabold text-ink">
          <span aria-hidden>🎨</span> Community look
        </h2>
        <p className="mt-0.5 text-[13.5px] text-muted">
          Name, words, colour, banner and icon. Every option is free. Uploaded pictures are shown publicly on
          listings.
        </p>
      </div>

      {/* Live preview in the same shape as the community page header. */}
      <div aria-label="Preview" className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="relative h-24 bg-surface-alt">
          {shownCover ? <img src={shownCover} alt="" className="size-full object-cover" /> : null}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(120deg, ${colors.from}, ${colors.to})`, opacity: colors.tint }}
          />
        </div>
        <div className="flex items-start gap-3 px-3 pb-3">
          <span className="-mt-7 grid size-16 shrink-0 place-items-center overflow-hidden rounded-[18px] border-4 border-surface bg-surface shadow-card">
            {shownIcon ? (
              <img src={shownIcon} alt="" className="size-full rounded-[14px] object-cover" />
            ) : (
              <span
                className="grid size-full place-items-center rounded-[14px] text-[22px] font-extrabold text-white"
                style={{ background: hueGradient(hue) }}
              >
                {(name || "K").charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 pt-1.5">
            <p className="truncate text-[16px] font-extrabold text-ink">{name || "Name"}</p>
            <p className="truncate text-[12.5px] text-muted">{tagline}</p>
            <p className="mt-1 text-[12.5px] font-bold" style={{ color: colors.accent }}>
              Links and tabs use this colour
            </p>
          </div>
          <span className="mt-2 inline-flex h-8 shrink-0 items-center rounded-full bg-grad-primary px-4 text-[13px] font-bold text-white">
            Join
          </span>
        </div>
      </div>

      <div className="space-y-3.5">
        <label className={label}>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={fieldClass} />
        </label>
        <label className={label}>
          <span>Tagline</span>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} className={fieldClass} />
        </label>
        <label className={label}>
          <span>About</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            className={fieldClass}
          />
        </label>
        <label className={label}>
          <span>Rules</span>
          <textarea value={rules} onChange={(e) => setRules(e.target.value)} maxLength={2000} rows={4} className={fieldClass} />
        </label>
        <label className={label}>
          <span className="flex items-center gap-2">
            Colour
            <span className="inline-block size-4 rounded-full" style={{ background: colors.accent }} aria-hidden />
          </span>
          <input
            type="range"
            min={0}
            max={360}
            value={hue}
            onChange={(e) => setHue(Number(e.target.value))}
            className="k-focus h-11 w-full accent-[var(--color-violet)]"
            aria-label="Community colour"
          />
        </label>
        <fieldset>
          <legend className="text-[13.5px] font-bold text-ink">Colour style</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {THEME_STYLES.map((s) => (
              <label
                key={s}
                className={cn(
                  "k-hit flex h-9 cursor-pointer items-center rounded-full border-[1.5px] px-4 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet",
                  style === s
                    ? "border-violet bg-tint-violet font-bold text-violet-ink"
                    : "border-border bg-surface font-semibold text-ink",
                )}
              >
                <input
                  type="radio"
                  name="themeStyle"
                  value={s}
                  checked={style === s}
                  onChange={() => setStyle(s)}
                  className="sr-only"
                />
                {STYLE_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[13.5px] font-bold text-ink">Banner</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PROFILE_COVERS.map((b) => (
              <label key={b.id} className="block cursor-pointer rounded-tile has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet">
                <input
                  type="radio"
                  name="banner"
                  checked={!coverUpload && cover === b.src}
                  onChange={() => {
                    setCover(b.src);
                    setCoverUpload(undefined);
                  }}
                  className="sr-only"
                />
                <img
                  src={b.src}
                  alt={b.label}
                  className={cn(
                    "h-14 w-full rounded-tile border-2 object-cover",
                    !coverUpload && cover === b.src ? "border-violet" : "border-transparent",
                  )}
                />
              </label>
            ))}
          </div>
          <label className="mt-3 block space-y-1 text-[13px] text-muted">
            <span>Or upload your own (PNG, JPEG or WebP, up to 1.5 MB)</span>
            <input
              type="file"
              accept={PICTURE_TYPES.join(",")}
              className="k-focus w-full text-[13px] file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-tint-violet file:px-4 file:font-bold file:text-violet-ink"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                void pick(f, 1.5 * 1024 * 1024, setCoverUpload);
              }}
            />
          </label>
        </fieldset>
        <div>
          <p className="text-[13.5px] font-bold text-ink">Icon</p>
          <div className="mt-2 flex items-center gap-3">
            {shownIcon ? (
              <img src={shownIcon} alt="Community icon" className="size-14 rounded-[16px] object-cover" />
            ) : (
              <span className="grid size-14 place-items-center rounded-[16px] bg-surface-alt text-[12px] text-subtle">
                None
              </span>
            )}
            <input
              aria-label="Upload an icon"
              type="file"
              accept={PICTURE_TYPES.join(",")}
              className="k-focus w-full min-w-0 text-[13px] file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-tint-violet file:px-4 file:font-bold file:text-violet-ink"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                void pick(f, 220 * 1024, setIconUpload);
              }}
            />
            {shownIcon ? (
              <button
                type="button"
                className="k-focus k-hit shrink-0 rounded-full px-2 text-[13px] font-bold text-danger"
                onClick={() => setIconUpload(null)}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {error}
        </p>
      ) : null}
      <GradientButton size="md" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save look"}
      </GradientButton>
    </section>
  );
}
