import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A post's pictures (mockup 06-post): a big swipeable picture with a "1/5" counter, and a strip of thumbnails
 * under it (the one showing has a violet border). Arrow keys and the side arrows work on computers.
 * Each picture opens full size in a new tab when clicked.
 */
export function PostCarousel({
  images,
  title,
  className,
}: {
  images: string[];
  /** Used for the pictures' descriptions ("Sunset Sketches, picture 2 of 5"). */
  title: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const many = images.length > 1;

  function goTo(i: number) {
    const next = Math.max(0, Math.min(images.length - 1, i));
    const el = track.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="group relative overflow-hidden rounded-[18px] bg-surface-alt"
        role="region"
        aria-roledescription="carousel"
        aria-label={`${title}: pictures`}
        tabIndex={many ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") goTo(index + 1);
          if (e.key === "ArrowLeft") goTo(index - 1);
        }}
      >
        <div
          ref={track}
          className="k-row aspect-[2.2] w-full snap-x snap-mandatory lg:aspect-[16/9]"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {images.map((src, i) => (
            <a
              key={`${src}-${i}`}
              href={src}
              target="_blank"
              rel="noreferrer"
              tabIndex={i === index ? 0 : -1}
              aria-label={`Open picture ${i + 1} of ${images.length} full size`}
              className="block h-full w-full shrink-0 snap-center"
            >
              <img
                src={src}
                alt={`${title}, picture ${i + 1} of ${images.length}`}
                className="size-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
              />
            </a>
          ))}
        </div>
        {many && (
          <>
            <span
              className="absolute top-2.5 right-2.5 rounded-full bg-[#14112bb3] px-2.5 py-0.5 text-[12px] font-bold text-white tabular-nums lg:text-[13px]"
              aria-live="polite"
            >
              {index + 1}/{images.length}
            </span>
            <button
              type="button"
              aria-label="Previous picture"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              className="k-focus absolute top-1/2 left-2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-[#14112b80] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:hidden lg:grid"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next picture"
              disabled={index === images.length - 1}
              onClick={() => goTo(index + 1)}
              className="k-focus absolute top-1/2 right-2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-[#14112b80] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:hidden lg:grid"
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Choose a picture">
          {images.slice(0, 10).map((src, i) => (
            <button
              key={`${src}-t${i}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show picture ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "k-focus aspect-[1.65] overflow-hidden rounded-[10px] border-2 bg-surface-alt transition-[border-color,opacity]",
                i === index ? "border-violet" : "border-transparent opacity-90 hover:opacity-100",
              )}
            >
              <img src={src} alt="" className="size-full object-cover" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
