import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { KaminoLogo } from "@/components/k";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { heroArt, interestArt, welcomeArt } from "@/lib/brand-art";
import { cn } from "@/lib/utils";
import { CloudEdge, GradientWord, HeartDoodle, ShineDashes, Sparkle, Swoosh } from "./decor";

/**
 * The first screen signed-out visitors see (mockup 01-welcome), shown at /welcome and at / when
 * nobody is signed in. A dreamy sky with three tilted picture cards, "Find Your People", a few
 * interest chips, "Get Started" (create an account) and "I already have an account" (sign in).
 * Swipe sideways (or use the dots) for two more slides. "Skip" lets people look around as a guest.
 *
 * Phones get the mockup layout; from 1024px wide the same pieces sit side by side: the words on a
 * white cloud panel on the left, the picture cards fanned out over the sky on the right.
 * Same slides, words and links as the phone app's `welcome.tsx`.
 */

type Tone = "violet" | "pink" | "blue" | "orange" | "green";
type Chip = { label: string; emoji: string; tone: Tone };
type Slide = {
  key: string;
  /** Headline: plain words, then the gradient word. */
  lead: string;
  highlight: string;
  text: string;
  chips: Chip[];
  /** Left, middle and right card pictures. */
  cards: [string, string, string];
};

const SLIDES: Slide[] = [
  {
    key: "people",
    lead: "Find Your ",
    highlight: "People",
    text: "Join communities, share your passions, and make new friends.",
    chips: [
      { label: "Gaming", emoji: "🎮", tone: "violet" },
      { label: "Art", emoji: "🎨", tone: "orange" },
      { label: "Music", emoji: "🎵", tone: "pink" },
      { label: "Anime", emoji: "🐾", tone: "orange" },
      { label: "K-Pop", emoji: "📘", tone: "blue" },
      { label: "Writing", emoji: "✍️", tone: "violet" },
      { label: "Fitness", emoji: "🏋️", tone: "green" },
      { label: "Pets", emoji: "🐱", tone: "pink" },
    ],
    cards: [welcomeArt.cards[1]!, welcomeArt.cards[0]!, welcomeArt.cards[2]!],
  },
  {
    key: "story",
    lead: "Live the ",
    highlight: "Story",
    text: "Jump into AI role-play stories with your friends and communities.",
    chips: [
      { label: "Stories", emoji: "📖", tone: "violet" },
      { label: "AI characters", emoji: "🤖", tone: "blue" },
      { label: "Role-play", emoji: "🎭", tone: "pink" },
      { label: "Worlds", emoji: "🗺️", tone: "orange" },
    ],
    cards: [interestArt.books, interestArt.writing, interestArt.manga],
  },
  {
    key: "achievements",
    lead: "Earn ",
    highlight: "Achievements",
    text: "Check in every day, keep your streak, and collect badges along the way.",
    chips: [
      { label: "Streaks", emoji: "🔥", tone: "orange" },
      { label: "Badges", emoji: "🏅", tone: "violet" },
      { label: "Levels", emoji: "⭐", tone: "blue" },
      { label: "Top Creator", emoji: "🏆", tone: "pink" },
    ],
    cards: [interestArt.fitness, heroArt["home-3"]!, interestArt.astrology],
  },
];

const TINT: Record<Tone, string> = {
  violet: "bg-tint-violet",
  pink: "bg-tint-pink",
  blue: "bg-tint-blue",
  orange: "bg-tint-orange",
  green: "bg-tint-green",
};

/**
 * Phone geometry, measured on the mockup (pt = CSS px at 430 wide) and the same as the phone app:
 * --edge is where the white lower half begins (388 on an 813-tall screen; taller screens give a
 * little of the extra room to the sky), --ku is one "mockup point" scaled to the screen height,
 * --sx one point scaled to the screen width.
 */
const PHONE_VARS = {
  "--w": "min(100vw, 560px)",
  "--sx": "calc(var(--w) / 430)",
  "--edge":
    "max(260px, min(calc(388px + (100dvh - 813px) * 0.6), calc(388px + (100dvh - 813px) * 0.8)))",
  "--ku": "clamp(0.68px, calc(var(--edge) / 388), 1.1px)",
} as CSSProperties;

export function WelcomeScreen() {
  const { user } = useCurrentUserState();
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  // Dots: scroll the phone track (it reports the new index back through onScroll) and switch the
  // desktop slides directly.
  const goTo = (i: number) => {
    setIndex(i);
    const el = track.current;
    if (el && el.clientWidth) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const onTrackScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index && i >= 0 && i < SLIDES.length) setIndex(i);
  };

  return (
    <div className="kamino-welcome relative min-h-dvh overflow-x-hidden bg-[var(--k-lower)] text-body [--k-lower:#ffffff] dark:[--k-lower:var(--color-bg)]">
      <h1 className="sr-only">Welcome to Kamino</h1>
      <PhoneWelcome index={index} track={track} onTrackScroll={onTrackScroll} goTo={goTo} signedIn={!!user} />
      <DesktopWelcome index={index} goTo={goTo} signedIn={!!user} />
    </div>
  );
}

/** "Skip >" white pill (top right). Kamino can be browsed without an account, so it opens Explore. */
function SkipPill({ className }: { className?: string }) {
  return (
    <Link
      to="/explore"
      aria-label="Skip: look around as a guest"
      className={cn(
        "k-focus k-hit inline-flex h-[34px] min-w-[70px] items-center justify-center gap-[3px] rounded-full bg-white/92 px-3.5 text-[13.5px] font-semibold text-body shadow-card transition-colors hover:bg-white dark:bg-[#17132ed9] dark:hover:bg-[#17132e]",
        className,
      )}
    >
      Skip
      <ChevronRight className="size-3.5" strokeWidth={2.6} aria-hidden />
    </Link>
  );
}

/** Get Started, "I already have an account" and the page dots. */
function Actions({
  index,
  goTo,
  signedIn,
  className,
  buttonClassName,
}: {
  index: number;
  goTo: (i: number) => void;
  signedIn: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <Link
        to={signedIn ? "/" : "/login"}
        search={signedIn ? undefined : { mode: "up" }}
        aria-label={signedIn ? "Open Kamino" : "Get started: create an account"}
        className={cn(
          "k-focus inline-flex h-14 w-[min(333px,calc(100vw-64px))] items-center justify-center gap-2.5 rounded-full bg-grad-hero text-[19px] font-bold text-white shadow-[0_10px_26px_rgba(117,60,249,0.35)] transition-[transform,filter] duration-150 hover:brightness-105 active:scale-[0.98]",
          buttonClassName,
        )}
      >
        {signedIn ? "Open Kamino" : "Get Started"}
        <ArrowRight className="size-6" strokeWidth={2.4} aria-hidden />
      </Link>
      {!signedIn && (
        <Link
          to="/login"
          search={{ mode: "in" }}
          aria-label="I already have an account: sign in"
          className="k-focus mt-2 inline-flex min-h-11 items-center rounded-full px-3 text-[15.5px] font-semibold text-violet hover:underline"
        >
          I already have an account
        </Link>
      )}
      <div className={cn("flex gap-1", signedIn ? "mt-3" : "mt-1")}>
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show slide ${i + 1} of ${SLIDES.length}`}
            aria-current={i === index ? "true" : undefined}
            className="k-focus k-hit grid size-[22px] place-items-center rounded-full"
          >
            <span
              className={cn(
                "block size-2 rounded-full transition-colors",
                i === index ? "bg-violet" : "bg-[#C9C6D6] dark:bg-[#4A4470]",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Headline with the gradient word, its swoosh and the little sparkles. */
function Headline({
  slide,
  className,
  style,
  sparkleSize = 20,
}: {
  slide: Slide;
  className?: string;
  style?: CSSProperties;
  sparkleSize?: number;
}) {
  return (
    <p
      role="heading"
      aria-level={2}
      className={cn("relative inline-block font-extrabold whitespace-nowrap text-ink", className)}
      style={style}
    >
      <span className="pointer-events-none absolute top-[0.1em] -left-[0.75em] flex flex-col" aria-hidden>
        <Sparkle size={sparkleSize * 0.7} style={{ marginLeft: sparkleSize * 0.5 }} />
        <Sparkle size={sparkleSize} />
      </span>
      {slide.lead}
      <span className="relative inline-block">
        <GradientWord>{slide.highlight}</GradientWord>
        <Swoosh className="absolute -bottom-[0.2em] left-[0.05em] h-[0.33em] w-[calc(100%+0.25em)]" />
        <ShineDashes size={sparkleSize * 0.9} className="absolute top-0 -right-[0.45em]" />
      </span>
    </p>
  );
}

function Chips({ chips, className }: { chips: Chip[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-[5px] gap-y-[9px]", className)} aria-label="Things you can find here">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className={cn(
            "inline-flex h-[39px] items-center gap-1.5 rounded-full px-[11px]",
            TINT[chip.tone],
          )}
        >
          <span className="text-[17px] leading-none" aria-hidden>
            {chip.emoji}
          </span>
          <span className="text-[13.5px] font-semibold text-ink">{chip.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** One tilted picture card with a white frame. */
function TiltCard({ src, style, className }: { src: string; style: CSSProperties; className?: string }) {
  return (
    <div
      className={cn(
        "absolute overflow-hidden border-[3px] border-white/95 shadow-[0_8px_24px_rgba(60,30,120,0.18)] dark:border-white/35",
        className,
      )}
      style={style}
      aria-hidden
    >
      <img src={src} alt="" className="size-full object-cover" draggable={false} />
    </div>
  );
}

/* ───────────────────────────── Phones and tablets ───────────────────────────── */

function PhoneWelcome({
  index,
  track,
  onTrackScroll,
  goTo,
  signedIn,
}: {
  index: number;
  track: React.RefObject<HTMLDivElement | null>;
  onTrackScroll: () => void;
  goTo: (i: number) => void;
  signedIn: boolean;
}) {
  return (
    <div
      className="relative lg:hidden"
      // Short screens scroll instead of letting the buttons cover the chips.
      style={{ ...PHONE_VARS, minHeight: "max(100dvh, calc(var(--edge) + 420px))" }}
    >
      {/* The sky stays still while the slides move over it. */}
      <div className="absolute inset-x-0 top-0 h-[calc(var(--edge)+40px)] overflow-hidden">
        <img
          src={welcomeArt.sky}
          alt=""
          className="size-full object-cover object-top"
          draggable={false}
          fetchPriority="high"
        />
        <div className="absolute inset-0 hidden bg-[rgba(14,11,31,0.35)] dark:block" />
      </div>

      <div
        ref={track}
        onScroll={onTrackScroll}
        className="k-row absolute inset-0 snap-x snap-mandatory [scroll-padding-inline:0]"
        aria-roledescription="carousel"
        aria-label="About Kamino"
      >
        {SLIDES.map((slide, i) => (
          <PhoneSlide key={slide.key} slide={slide} active={i === index} position={i} />
        ))}
      </div>

      {/* Logo and Skip (stay put). */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-center justify-between [&>*]:pointer-events-auto">
        <KaminoLogo to="/welcome" size={38} wordSize={29} />
        <SkipPill />
      </div>

      {/* Buttons and page dots (stay put). */}
      <Actions
        index={index}
        goTo={goTo}
        signedIn={signedIn}
        className="absolute inset-x-0 bottom-[calc(18px+env(safe-area-inset-bottom))] z-10"
      />
    </div>
  );
}

/** One phone slide: the three tilted cards, the cloud edge, the headline, the line under it and the chips. */
function PhoneSlide({ slide, active, position }: { slide: Slide; active: boolean; position: number }) {
  const u = (n: number) => `calc(var(--ku) * ${n})`;
  const sx = (n: number) => `calc(var(--sx) * ${n})`;
  // Card boxes measured on the mockup (pt); bottoms are measured up from the cloud edge.
  const cards = [
    { left: `calc(50% - var(--w) / 2 + ${sx(-16)})`, w: 108, h: 184, bottom: 16, rot: -9, src: slide.cards[0] },
    { left: `calc(50% - var(--w) / 2 + ${sx(324)})`, w: 128, h: 198, bottom: 30, rot: 6, src: slide.cards[2] },
    { left: `calc(50% - ${sx(4)} - ${u(102)})`, w: 204, h: 248, bottom: 20, rot: 6, src: slide.cards[1] },
  ];
  return (
    <section
      className="relative h-full w-full shrink-0 snap-center overflow-hidden"
      aria-roledescription="slide"
      aria-label={`${position + 1} of ${SLIDES.length}: ${slide.lead}${slide.highlight}`}
      aria-hidden={!active}
      inert={!active}
    >
      {cards.map((c, i) => (
        <TiltCard
          key={i}
          src={c.src}
          style={{
            left: c.left,
            top: `calc(var(--edge) - ${c.bottom}px - ${u(c.h)})`,
            width: u(c.w),
            height: u(c.h),
            borderRadius: u(22),
            transform: `rotate(${c.rot}deg)`,
          }}
        />
      ))}

      {/* Little hearts and sparkles floating over the sky. */}
      <HeartDoodle size={22} className="absolute" style={{ left: sx(14), top: `calc(var(--edge) - ${u(238)})` }} />
      <HeartDoodle size={20} className="absolute" style={{ right: sx(14), top: `calc(var(--edge) - ${u(92)})` }} />
      <Sparkle size={14} className="absolute" style={{ left: sx(60), top: `calc(var(--edge) - ${u(270)})` }} />

      {/* Cloud edge into the lower half, then a solid block so nothing shows through behind the text. */}
      <div className="absolute inset-x-0 top-[calc(var(--edge)-78px)] h-[130px]">
        <CloudEdge className="h-full" />
      </div>
      <div className="absolute inset-x-0 top-[calc(var(--edge)+50px)] bottom-0 bg-[var(--k-lower)]" />
      <Sparkle size={26} className="absolute top-[calc(var(--edge)+4px)]" style={{ right: sx(22) }} />

      <div className="absolute inset-x-0 top-[calc(var(--edge)+44px)] flex flex-col items-center px-2.5 text-center">
        <Headline
          slide={slide}
          // As big as the mockup (42) but never wider than the screen.
          style={{ fontSize: `min(42px, calc((100vw - 64px) / ${(slide.lead.length + slide.highlight.length) * 0.56}))` }}
          className="leading-[1.2] tracking-[-0.8px]"
        />
        <p className="mt-4 max-w-[330px] text-[17px] leading-[22px] font-medium text-[#4A4766] dark:text-muted">
          {slide.text}
        </p>
        <Chips chips={slide.chips} className="mt-4 max-w-[410px] justify-center" />
      </div>
      <HeartDoodle size={26} className="absolute top-[calc(var(--edge)+110px)]" style={{ right: sx(14) }} />
    </section>
  );
}

/* ───────────────────────────── Computers (1024px and wider) ───────────────────────────── */

function DesktopWelcome({ index, goTo, signedIn }: { index: number; goTo: (i: number) => void; signedIn: boolean }) {
  return (
    <div className="relative hidden min-h-dvh flex-col lg:flex">
      {/* Sky over the whole page, with a soft light wash on the left behind the panel. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <img src={welcomeArt.sky} alt="" className="size-full scale-105 object-cover object-top blur-[1px]" draggable={false} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0)_55%)] dark:bg-[linear-gradient(90deg,rgba(14,11,31,0.6)_0%,rgba(14,11,31,0.3)_100%)]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between px-10 pt-7">
        <KaminoLogo to="/welcome" size={46} wordSize={34} />
        <SkipPill className="h-10 px-5 text-[15px]" />
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-[minmax(0,600px)_minmax(0,1fr)] items-center gap-12 px-10 pt-4 pb-36">
        {/* The words, on a white cloud panel. */}
        <section className="relative rounded-[36px] bg-[var(--k-lower)]/92 px-10 pt-12 pb-9 shadow-[0_24px_60px_rgba(60,30,120,0.18)] backdrop-blur-xl">
          <Sparkle size={34} className="absolute -top-4 right-10" />
          <HeartDoodle size={30} className="absolute -right-3 bottom-28" />
          <div className="grid grid-cols-[minmax(0,1fr)]">
            {SLIDES.map((slide, i) => (
              <div
                key={slide.key}
                className={cn(
                  "[grid-area:1/1] transition-[opacity,transform] duration-500 ease-out",
                  i === index ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
                )}
                aria-hidden={i !== index}
                inert={i !== index}
              >
                <div className="pl-7">
                  <Headline slide={slide} className="text-[clamp(40px,3.8vw,54px)] leading-[1.18] tracking-[-1.2px] whitespace-normal" sparkleSize={26} />
                </div>
                <p className="mt-5 max-w-[420px] text-[19px] leading-[28px] font-medium text-[#4A4766] dark:text-muted">
                  {slide.text}
                </p>
                <Chips chips={slide.chips} className="mt-6" />
              </div>
            ))}
          </div>
          <Actions
            index={index}
            goTo={goTo}
            signedIn={signedIn}
            className="mt-9 w-[360px]"
            buttonClassName="w-[360px] h-[60px] text-[20px]"
          />
        </section>

        {/* The picture cards, fanned out over the sky. */}
        <div className="relative mx-auto h-[min(560px,64dvh)] w-full max-w-[620px]" aria-hidden>
          {SLIDES.map((slide, i) => (
            <div
              key={slide.key}
              className={cn(
                "absolute inset-0 transition-[opacity,transform] duration-700 ease-out",
                i === index ? "scale-100 opacity-100" : "scale-95 opacity-0",
              )}
            >
              <TiltCard src={slide.cards[0]} className="rounded-[28px]" style={{ left: "0%", top: "26%", width: "32%", height: "58%", transform: "rotate(-9deg)" }} />
              <TiltCard src={slide.cards[2]} className="rounded-[28px]" style={{ right: "0%", top: "14%", width: "34%", height: "60%", transform: "rotate(7deg)" }} />
              <TiltCard src={slide.cards[1]} className="z-[1] rounded-[32px]" style={{ left: "26%", top: "2%", width: "48%", height: "76%", transform: "rotate(5deg)" }} />
            </div>
          ))}
          <HeartDoodle size={30} className="absolute top-[6%] left-[4%]" />
          <HeartDoodle size={26} className="absolute right-[2%] bottom-[8%]" />
          <Sparkle size={22} className="absolute top-[2%] right-[18%]" />
          <Sparkle size={16} className="absolute bottom-[18%] left-[22%]" />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[170px]">
        <CloudEdge tiles={4} className="h-full" />
      </div>
    </div>
  );
}
