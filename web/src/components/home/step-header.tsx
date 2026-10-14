import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { KaminoLogo, ProgressSegments } from "@/components/k";
import { cn } from "@/lib/utils";

/**
 * The top of every onboarding step (mockup 02-interests) and of the sign-in pages: logo on the
 * left, "Skip" on the right, and the five progress segments with "2 / 5" underneath.
 * Same as the phone app's `StepHeader`.
 */
export function StepHeader({
  back,
  onSkip,
  skipLabel = "Skip",
  right,
  step,
  total = 5,
  className,
}: {
  /** Shows "<" before the logo: true = go back in history, a string = go to that address, a function = call it. */
  back?: boolean | string | (() => void);
  /** Violet "Skip" on the right (or pass your own `right`). */
  onSkip?: () => void;
  skipLabel?: string;
  right?: ReactNode;
  /** Onboarding step (1–5). Leave out to hide the progress bar. */
  step?: number;
  total?: number;
  className?: string;
}) {
  const router = useRouter();
  const backCls =
    "k-focus -ml-2 mr-0.5 grid h-11 w-9 place-items-center rounded-full text-ink hover:bg-surface-alt";
  const backIcon = <ChevronLeft className="size-[26px]" strokeWidth={2.4} aria-hidden />;
  return (
    <div className={cn("relative z-10 flex flex-col gap-3.5 pt-3.5 lg:pt-6", className)}>
      <div className="mx-auto flex min-h-11 w-full max-w-[1040px] items-center px-4 lg:px-8">
        {typeof back === "string" ? (
          <Link to={back} aria-label="Go back" className={backCls}>
            {backIcon}
          </Link>
        ) : back ? (
          <button
            type="button"
            aria-label="Go back"
            className={backCls}
            onClick={() => {
              if (typeof back === "function") back();
              else if (window.history.length > 1) router.history.back();
              else void router.navigate({ to: "/welcome" });
            }}
          >
            {backIcon}
          </button>
        ) : null}
        <div className="flex flex-1 items-center">
          <KaminoLogo to="/" size={34} wordSize={24} className="lg:[&_svg]:size-10 lg:[&>span]:text-[28px]!" />
        </div>
        {right ??
          (onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              aria-label={skipLabel}
              className="k-focus -mr-2 inline-flex min-h-11 min-w-11 items-center justify-end rounded-full px-2 text-[15px] font-semibold text-violet hover:underline lg:text-[16px]"
            >
              {skipLabel}
            </button>
          ) : null)}
      </div>
      {step ? (
        <div className="mx-auto w-full max-w-[640px]">
          <ProgressSegments current={step} total={total} className="pr-[18px] pl-[52px] lg:px-8" />
        </div>
      ) : null}
    </div>
  );
}
