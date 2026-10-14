import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Hourglass,
  Link2,
  Loader2,
  MapPin,
  Plus,
  Radio,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { TONE_STYLE, type Tone } from "@/components/k";
import { cn } from "@/lib/utils";
import type { CreateKind } from "./compose";

/**
 * Small building blocks of the Create screen (07-create mockup), mirroring the phone app's
 * `src/components/create/parts.tsx`. They take plain props and never fetch.
 */

// ── Type tiles (Post · Story · Community · Live Room · Event) ────────────────

/** The coloured artwork for each tile, drawn with gradients + icons like the mockup's glossy icons. */
function TileArt({ kind, selected }: { kind: CreateKind; selected: boolean }) {
  switch (kind) {
    case "post":
      return (
        <svg
          viewBox="0 0 24 24"
          className={cn("size-[26px] lg:size-8", selected ? "text-white" : "text-violet")}
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M15.6 3.6a2.1 2.1 0 0 1 3 0l1.8 1.8a2.1 2.1 0 0 1 0 3L9.6 19.2l-5.1 1.3 1.3-5.1L15.6 3.6Z"
          />
          <path fill="currentColor" opacity=".55" d="M14.5 21h6a1 1 0 1 0 0-2h-4l-2 2Z" />
        </svg>
      );
    case "story":
      return (
        <span className="relative block size-[30px] lg:size-9">
          <span className="grid size-[27px] place-items-center rounded-full bg-[linear-gradient(135deg,#FF4FA3,#FF9F1A)] lg:size-8">
            <span className="block size-[15px] rounded-full border-[2.5px] border-white/90 lg:size-[18px]" />
          </span>
          <span className="absolute -right-px -bottom-px grid size-[15px] place-items-center rounded-full bg-pink ring-[1.5px] ring-surface lg:size-[17px]">
            <Plus className="size-[11px] text-white" strokeWidth={3.4} />
          </span>
        </span>
      );
    case "community":
      return (
        <Users
          className="size-[30px] text-[#2E72FE] lg:size-9"
          fill="#2E72FE"
          strokeWidth={1.4}
          aria-hidden
        />
      );
    case "live":
      return (
        <Radio className="size-[29px] text-[#C13CF0] lg:size-9" strokeWidth={2.2} aria-hidden />
      );
    case "event":
      return (
        <span className="relative mt-1 grid h-[26px] w-[27px] place-items-center rounded-[7px] bg-[linear-gradient(135deg,#FF5C8A,#FF3D6E)] lg:h-8 lg:w-[33px]">
          <span className="absolute -top-[3px] left-[6px] h-[7px] w-[3px] rounded-sm bg-[#E0245E]" />
          <span className="absolute -top-[3px] right-[6px] h-[7px] w-[3px] rounded-sm bg-[#E0245E]" />
          <span className="mt-[5px] flex h-[11px] w-[18px] items-center justify-center gap-1 rounded-[3px] bg-white/90 lg:w-[22px]">
            <span className="size-[3px] rounded-full bg-[#FF5C8A]" />
            <span className="size-[3px] rounded-full bg-[#FF5C8A]" />
          </span>
        </span>
      );
  }
}

/** One square-ish tile; the selected one is a violet gradient with white text. */
export function TypeTile({
  kind,
  label,
  hint,
  selected,
  onClick,
  className,
}: {
  kind: CreateKind;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={hint}
      className={cn(
        "k-focus flex h-[62px] min-w-0 flex-col items-center justify-center gap-[5px] overflow-hidden rounded-[14px] transition-transform active:scale-[0.96] lg:h-[96px] lg:gap-2 lg:rounded-[18px]",
        selected
          ? "bg-[linear-gradient(135deg,#9A5BFC,#6B4DFB)] shadow-[0_6px_18px_rgba(123,77,251,0.35)]"
          : "border border-border bg-surface shadow-card hover:bg-surface-alt",
        className,
      )}
    >
      <span className="grid h-[31px] place-items-center lg:h-10" aria-hidden>
        <TileArt kind={kind} selected={selected} />
      </span>
      <span
        className={cn(
          "max-w-full truncate px-1 text-[11.5px] leading-[14px] font-semibold lg:text-[15px]",
          selected ? "text-white" : "text-ink",
        )}
      >
        {label}
      </span>
    </button>
  );
}

// ── Media row ────────────────────────────────────────────────────────────────

/** The dashed "+ Add Photos" tile (a label around a hidden file input). */
export function AddMediaTile({
  label,
  busy,
  onFiles,
  className,
}: {
  label: string;
  busy?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "k-focus relative flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-dashed border-violet/45 bg-surface p-1.5 text-center focus-within:ring-2 focus-within:ring-violet",
        busy && "pointer-events-none opacity-60",
        className,
      )}
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="sr-only"
        aria-label={label}
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <span
        className="grid size-6 place-items-center rounded-full bg-violet-strong text-white lg:size-8"
        aria-hidden
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-[18px]" strokeWidth={2.6} />
        )}
      </span>
      <span className="text-[10.5px] leading-[13px] font-semibold text-violet-ink lg:text-[13px] lg:leading-4">
        {label}
      </span>
    </label>
  );
}

/** A chosen picture with a dark round ✕ in the corner. */
export function MediaThumb({
  src,
  index,
  onRemove,
  className,
}: {
  src: string;
  index: number;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-[12px] bg-surface-alt", className)}
    >
      <img
        src={src}
        alt={`Picture ${index + 1}`}
        className="size-full object-cover"
        draggable={false}
      />
      {index === 0 ? (
        <span className="absolute bottom-1 left-1 rounded-full bg-[#14112bb3] px-1.5 py-px text-[9.5px] font-bold text-white">
          Cover
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove picture ${index + 1}`}
        className="k-focus k-hit absolute top-1 right-1 grid size-[22px] place-items-center rounded-full bg-[#282634b8] text-white lg:size-7"
      >
        <X className="size-[15px]" strokeWidth={2.8} aria-hidden />
      </button>
    </div>
  );
}

// ── Add Poll / Add Location / Add Link ───────────────────────────────────────

const ACTION_ICON: Record<"poll" | "location" | "link", ReactNode> = {
  poll: <BarChart3 className="size-4 lg:size-5" strokeWidth={2.6} aria-hidden />,
  location: (
    <MapPin
      className="size-4 lg:size-5"
      fill="currentColor"
      stroke="var(--color-surface)"
      strokeWidth={1.6}
      aria-hidden
    />
  ),
  link: <Link2 className="size-4 lg:size-5" strokeWidth={2.6} aria-hidden />,
};

export function ActionButton({
  icon,
  label,
  tone,
  active,
  onClick,
}: {
  icon: "poll" | "location" | "link";
  label: string;
  tone: Tone;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={cn(
        "k-focus k-hit flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border px-1 text-[12px] font-semibold transition-colors lg:h-11 lg:text-[14.5px]",
        active ? "" : "border-transparent bg-surface-alt hover:brightness-[0.98]",
      )}
      style={
        active
          ? { background: TONE_STYLE[tone].tint, borderColor: TONE_STYLE[tone].bright }
          : undefined
      }
    >
      <span style={{ color: TONE_STYLE[tone].bright }} className="grid place-items-center">
        {ACTION_ICON[icon]}
      </span>
      <span className="truncate" style={{ color: TONE_STYLE[tone].ink }}>
        {label}
      </span>
    </button>
  );
}

/** A one-line input with an icon and a ✕ (location, link). */
export function InlineInput({
  icon,
  tone,
  value,
  onChange,
  placeholder,
  label,
  onRemove,
  type = "text",
}: {
  icon: "location" | "link";
  tone: Tone;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  label: string;
  onRemove: () => void;
  type?: "text" | "url";
}) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-[12px] border border-border bg-surface pr-0.5 pl-3 focus-within:ring-2 focus-within:ring-violet lg:h-12">
      <span style={{ color: TONE_STYLE[tone].bright }} className="grid place-items-center">
        {ACTION_ICON[icon]}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        type={type}
        inputMode={type === "url" ? "url" : undefined}
        autoCapitalize={type === "url" ? "none" : undefined}
        maxLength={type === "url" ? 500 : 60}
        className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-[13.5px] placeholder:text-subtle lg:text-[15px]"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label.toLowerCase()}`}
        className="k-focus grid size-10 place-items-center rounded-full text-subtle hover:text-ink"
      >
        <XCircle className="size-[19px]" aria-hidden />
      </button>
    </div>
  );
}

// ── Poll editor ──────────────────────────────────────────────────────────────

export function PollEditor({
  options,
  onChange,
  onRemove,
  max,
}: {
  options: string[];
  onChange: (options: string[]) => void;
  onRemove: () => void;
  max: number;
}) {
  return (
    <div className="space-y-2 rounded-[14px] bg-tint-violet p-2.5">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="size-[15px] text-violet" strokeWidth={2.6} aria-hidden />
        <p className="flex-1 text-[13px] font-bold text-violet-ink">Poll options</p>
        <button
          type="button"
          onClick={onRemove}
          className="k-focus h-8 rounded-full px-2 text-[12px] font-semibold text-violet-ink hover:underline"
        >
          Remove
        </button>
      </div>
      {options.map((option, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={option}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? e.target.value : o)))}
            placeholder={`Option ${i + 1}`}
            aria-label={`Poll option ${i + 1}`}
            maxLength={200}
            className="k-focus h-[38px] min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-[13.5px] placeholder:text-subtle focus:ring-2 focus:ring-violet lg:text-[15px]"
          />
          {options.length > 2 ? (
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              aria-label={`Remove option ${i + 1}`}
              className="k-focus grid h-[38px] w-8 place-items-center rounded-full text-muted hover:text-ink"
            >
              <X className="size-[18px]" aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
      {options.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...options, ""])}
          className="k-focus inline-flex h-8 items-center gap-1 rounded-full text-[12.5px] font-semibold text-violet-ink"
        >
          <Plus className="size-4" aria-hidden /> Add option
        </button>
      ) : null}
    </div>
  );
}

// ── Tags ─────────────────────────────────────────────────────────────────────

const TAG_TONES: readonly Tone[] = ["pink", "orange", "blue", "violet"];

/** Tag chips: chosen tags have a coloured ring and a check; suggestions are plain tinted chips you tap to add. */
export function TagChips({
  chosen,
  suggestions,
  onToggle,
  onAdd,
}: {
  chosen: string[];
  suggestions: string[];
  onToggle: (tag: string) => void;
  onAdd: () => void;
}) {
  const lower = new Set(chosen.map((t) => t.toLowerCase()));
  const all = [...chosen, ...suggestions.filter((s) => !lower.has(s.toLowerCase()))];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags">
      {all.map((tag, i) => {
        const on = lower.has(tag.toLowerCase());
        const tone = TONE_STYLE[TAG_TONES[i % TAG_TONES.length]!];
        return (
          <button
            key={tag}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-label={`Tag ${tag}`}
            onClick={() => onToggle(tag)}
            className="k-focus k-hit inline-flex h-[27px] items-center gap-0.5 rounded-full border-[1.5px] px-2.5 text-[12.5px] font-semibold lg:h-9 lg:px-3.5 lg:text-[14px]"
            style={{
              background: tone.tint,
              color: tone.ink,
              borderColor: on ? tone.bright : "transparent",
            }}
          >
            {on ? <CheckCircle2 className="size-3" strokeWidth={3} aria-hidden /> : null}#{tag}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="k-focus k-hit inline-flex h-[27px] items-center gap-1 rounded-full border-[1.5px] border-dashed border-violet/45 bg-surface px-2.5 text-[12.5px] font-semibold text-violet-ink lg:h-9 lg:px-3.5 lg:text-[14px]"
      >
        <Plus className="size-[15px]" aria-hidden /> Add Tag
      </button>
    </div>
  );
}

// ── Little rows ──────────────────────────────────────────────────────────────

/** Icon + bold label (+ optional right side) — "Post to", "Tags". */
export function RowTitle({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex min-h-7 items-center gap-2.5">
        <span
          className="grid w-[22px] place-items-center text-violet [&_svg]:size-[19px] lg:w-7 lg:[&_svg]:size-6"
          aria-hidden
        >
          {icon}
        </span>
        <h3 className="flex-1 text-[14px] leading-[18px] font-bold text-ink lg:text-[17px]">
          {title}
        </h3>
        {right}
      </div>
      {subtitle ? (
        <p className="ml-[32px] text-[11.5px] leading-[15px] text-muted lg:ml-[38px] lg:text-[14px]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/** A label with an on/off switch. */
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-[18px] font-semibold text-ink lg:text-[15px]">
          {label}
        </p>
        {hint ? (
          <p className="text-[11.5px] leading-[15px] text-muted lg:text-[13px]">{hint}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn(
          "k-focus k-hit relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors",
          value ? "bg-violet-strong" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-6 rounded-full bg-white shadow transition-[left]",
            value ? "left-[23px]" : "left-[3px]",
          )}
        />
      </button>
    </div>
  );
}

/** A rounded option button used in sheets (Public / Members only, drafts…). */
export function OptionRow({
  icon,
  title,
  text,
  selected,
  onClick,
  right,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  selected?: boolean;
  onClick: () => void;
  right?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "k-focus flex w-full items-center gap-3 rounded-[14px] border-[1.5px] p-3 text-left transition-colors",
        selected ? "border-violet bg-tint-violet" : "border-border bg-surface hover:bg-surface-alt",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full text-violet [&_svg]:size-[18px]",
          selected ? "bg-surface" : "bg-tint-violet",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-ink">{title}</span>
        {text ? <span className="line-clamp-2 block text-[12px] text-muted">{text}</span> : null}
      </span>
      {right ??
        (selected ? (
          <CheckCircle2 className="size-[22px] shrink-0 text-violet" aria-hidden />
        ) : null)}
    </button>
  );
}

/** A kind red note under the form ("Write a few words first"). */
export function Problem({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-[12px] bg-tint-pink p-2.5 text-[12.5px] leading-[17px] font-semibold text-danger lg:text-[14px]"
    >
      <AlertCircle className="mt-px size-[17px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

/** What happened after Publish (posted / scheduled / held), shown kindly under the button. */
export type Outcome = {
  kind: "posted" | "scheduled" | "held" | "draft";
  title: string;
  text: string;
  to?: string;
};

export function OutcomeCard({ outcome, onOpen }: { outcome: Outcome; onOpen: () => void }) {
  const tone: Tone =
    outcome.kind === "held" ? "orange" : outcome.kind === "scheduled" ? "blue" : "green";
  const Icon =
    outcome.kind === "held" ? Hourglass : outcome.kind === "scheduled" ? Clock : CheckCircle2;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-live="polite"
      className={cn(
        "k-focus flex w-full items-center gap-2.5 rounded-[14px] p-3 text-left",
        TONE_STYLE[tone].softClassName,
      )}
    >
      <Icon className="size-[22px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold text-ink">{outcome.title}</span>
        <span className="block text-[12px] text-body">{outcome.text}</span>
      </span>
      {outcome.to ? (
        <ChevronRight className="size-[17px] shrink-0 text-muted" aria-hidden />
      ) : (
        <X className="size-4 shrink-0 text-muted" aria-hidden />
      )}
    </button>
  );
}
