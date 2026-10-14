import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GradientButton } from "./buttons";

export type HeroSlide = {
  id: string;
  /** Big white headline (3 lines max). */
  title: ReactNode;
  /** Small white text under it. */
  text?: ReactNode;
  /** Button label ("Start Exploring"). */
  cta?: string;
  /** Where the button goes (inside the app) … */
  to?: string;
  /** … or what it does. */
  onCta?: () => void;
  /** Artwork. Without it the slide gets a colourful gradient from `hue`. */
  image?: string;
  hue?: number;
};

/** Dots for a carousel. Active = white, others white 50%. Each dot is a real button. */
function Dots({
  count,
  index,
  onPick,
}: {
  count: number;
  index: number;
  onPick: (i: number) => void;
}) {
  if (count < 2) return null;
  return (
    <div className="absolute right-2.5 bottom-1 z-10 flex items-center lg:right-4 lg:bottom-3">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(i)}
          aria-label={`Show slide ${i + 1} of ${count}`}
          aria-current={i === index ? "true" : undefined}
          className="k-focus grid size-6 place-items-center rounded-full"
        >
          <span
            className={cn(
              "block rounded-full transition-all duration-200",
              i === index ? "size-[7px] bg-white" : "size-[6px] bg-white/50",
            )}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Rounded hero card carousel (Home "Good People Brighter Days", Explore "Discover Your People").
 * Swipe or use the dots; it moves on by itself every `interval` ms, and stops while you
 * hover, touch or tab into it (and never for people who prefer reduced motion).
 */
export function HeroCarousel({
  slides,
  interval = 5000,
  label = "Highlights",
  className,
  heightClassName = "h-[224px] min-[361px]:h-[196px] sm:h-[220px] lg:h-[300px]",
}: {
  slides: HeroSlide[];
  interval?: number;
  label?: string;
  className?: string;
  heightClassName?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  // Keep the dots in step with swiping.
  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(Math.max(0, Math.min(count - 1, i)));
  };

  useEffect(() => {
    if (count < 2 || paused) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      goTo((index + 1) % count);
    }, interval);
    return () => window.clearInterval(t);
  }, [count, paused, index, interval, goTo]);

  if (!count) return null;
  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-hero shadow-card",
        heightClassName,
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerDown={() => setPaused(true)}
    >
      <div
        ref={track}
        onScroll={onScroll}
        className="k-row size-full snap-x snap-mandatory"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
            className="relative size-full snap-center"
            style={{ width: "100%" }}
          >
            <SlideBackground slide={s} />
            <div className="relative z-[1] flex h-full max-w-[58%] flex-col justify-center gap-[5px] py-3 pr-4 pl-[18px] lg:max-w-[52%] lg:gap-2 lg:p-8">
              <h2 className="shrink-0 text-[23px] leading-[26px] font-extrabold tracking-[-0.6px] text-white drop-shadow-[0_2px_10px_rgba(20,12,60,0.35)] sm:text-[30px] sm:leading-[1.05] lg:text-[40px]">
                {s.title}
              </h2>
              {s.text && (
                <p className="line-clamp-2 text-[11.5px] leading-[15px] font-medium text-white/90 sm:text-[13px] sm:leading-snug lg:text-[15px]">
                  {s.text}
                </p>
              )}
              {s.cta && (
                <div className="mt-[5px] lg:mt-2">
                  <GradientButton
                    to={s.to}
                    onClick={s.onCta}
                    arrow
                    tabIndex={i === index ? undefined : -1}
                    size="sm"
                    className="h-[29px] px-[18px] text-[14px] lg:h-11 lg:px-6 lg:text-[16px]"
                  >
                    {s.cta}
                  </GradientButton>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Dots count={count} index={index} onPick={goTo} />
    </section>
  );
}

/** Artwork (or hue gradient) with a soft dark wash on the left so the white words read. */
function SlideBackground({ slide }: { slide: HeroSlide }) {
  const h = slide.hue ?? 262;
  return (
    <>
      {slide.image ? (
        <img
          src={slide.image}
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 85% 20%, hsl(${(h + 60) % 360} 95% 80% / 0.9), transparent 45%), linear-gradient(120deg, hsl(${h} 70% 42%) 0%, hsl(${(h + 30) % 360} 75% 55%) 55%, hsl(${(h + 70) % 360} 85% 70%) 100%)`,
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(24,12,64,0.45) 0%, rgba(24,12,64,0.15) 55%, rgba(24,12,64,0) 85%)",
        }}
      />
    </>
  );
}
