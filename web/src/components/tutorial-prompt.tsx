import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { KaminoMark } from "@/components/k";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getIdentityDashboard } from "@/lib/kamino/identity-v9";

/** Welcome-tour invite at the end of Home, in the brand gradient like the hero banners. Hidden once the tour is done. */
export function TutorialPrompt() {
  const { user } = useCurrentUserState();
  const query = useQuery({ queryKey: ["identityDashboard"], queryFn: () => getIdentityDashboard(), enabled: !!user });
  if (!query.data || query.data.preferences.tutorialComplete) return null;
  return (
    <section
      aria-label="Welcome tour"
      className="relative overflow-hidden rounded-card bg-grad-hero p-4 text-white shadow-glow lg:p-6"
    >
      {/* Soft light circles for depth; purely decorative. */}
      <span className="pointer-events-none absolute -top-10 -right-8 size-36 rounded-full bg-white/15" aria-hidden />
      <span className="pointer-events-none absolute -bottom-14 right-16 size-28 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/95 shadow-card">
          <KaminoMark size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16.5px] leading-snug font-extrabold text-white lg:text-[20px]">Make yourself at home</h2>
          <p className="mt-1 text-[13.5px] leading-[19px] text-white/85 lg:text-[15px]">
            Four quick steps to find your people, share something and choose your privacy.
          </p>
          <Link
            to="/tutorial"
            className="k-focus mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-extrabold text-[#5b21b6] shadow-card transition-transform active:scale-95"
          >
            Take the welcome tour
            <ArrowRight className="size-4" strokeWidth={2.6} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
