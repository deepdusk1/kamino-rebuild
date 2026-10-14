import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** The pictures in order: the cover first, then the album. */
  scenes: string[];
  /** One caption per scene; missing or empty ones show nothing. */
  captions?: string[];
};

/**
 * A story with several scenes: one picture at a time, a progress bar on top, and Back / Next buttons.
 * Nothing advances on its own, so people read at their own pace. Arrow keys work too.
 */
export function StoryViewer({ scenes, captions = [] }: Props) {
  const [index, setIndex] = useState(0);
  const last = scenes.length - 1;
  const go = (delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta)));
  const caption = captions[index]?.trim();

  return (
    <section
      aria-label={`Story, scene ${index + 1} of ${scenes.length}`}
      tabIndex={0}
      className="relative overflow-hidden rounded-[18px] bg-[#0f0b2a] shadow-card outline-none focus-visible:ring-2 focus-visible:ring-violet lg:rounded-card"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <img
        key={index}
        src={scenes[index]}
        alt={caption || `Scene ${index + 1}`}
        className="mx-auto max-h-[70vh] min-h-[220px] w-full object-contain"
      />
      {scenes.length > 1 && (
        <>
          <div className="absolute inset-x-3 top-3 flex gap-1" aria-hidden="true">
            {scenes.map((_, i) => (
              <span
                key={i}
                className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-white" : "bg-white/35")}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Previous scene"
            disabled={index === 0}
            onClick={() => go(-1)}
            className="absolute inset-y-0 left-0 grid w-1/4 place-items-center text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:hidden [@media(hover:none)]:opacity-80"
          >
            <span className="grid size-11 place-items-center rounded-full bg-[#14112b80] backdrop-blur-sm">
              <ChevronLeft className="size-6" aria-hidden />
            </span>
          </button>
          <button
            type="button"
            aria-label="Next scene"
            disabled={index === last}
            onClick={() => go(1)}
            className="absolute inset-y-0 right-0 grid w-1/4 place-items-center text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:hidden [@media(hover:none)]:opacity-80"
          >
            <span className="grid size-11 place-items-center rounded-full bg-[#14112b80] backdrop-blur-sm">
              <ChevronRight className="size-6" aria-hidden />
            </span>
          </button>
        </>
      )}
      {caption ? (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-3.5 text-[14px] leading-5 font-semibold text-white">
          {caption}
        </p>
      ) : null}
    </section>
  );
}
