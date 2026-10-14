import { createFileRoute } from "@tanstack/react-router";
import { Bot, Flag, HeartHandshake, Phone, Scale, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ScreenTitle, TONE_STYLE, type Tone } from "@/components/k";
import { cn } from "@/lib/utils";
import { PersonalSafety } from "@/components/personal-safety";

export const Route = createFileRoute("/safety")({ component: SafetyPage });

/** How Kamino keeps communities safe, in plain words, and where to find help. */
function SafetyPage() {
  return (
    <AppShell>
      <div className="space-y-3 px-4 lg:mx-auto lg:max-w-[760px] lg:space-y-4 lg:px-0 lg:pt-2">
        <ScreenTitle title="Safety" subtitle="Kamino is for kind, real connection. Here's how we keep it that way." />
        <PersonalSafety />

        <section className="space-y-2 rounded-card bg-grad-top-creator p-4 text-white shadow-card lg:p-5">
          <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
            <Phone className="size-5" aria-hidden /> If things feel heavy
          </h2>
          <p className="text-[14px] leading-relaxed text-white/95">
            You don't have to go through it alone. Talk to someone you trust, or contact a local crisis line. In Canada
            you can call or text 9-8-8; in the US, call or text 988. If you are in danger right now, call your local
            emergency number.
          </p>
        </section>

        <Card icon={<Scale />} tone="violet" title="House rules">
          Free to use, and nothing can buy you reputation or power. Kamino is for people aged 13 and up. No sexual content involving
          minors, no selling drugs, weapons or stolen goods, no threats, no hate, no scams.
        </Card>
        <Card icon={<Bot />} tone="blue" title="How moderation works">
          Everything shared is checked by built-in safety rules and, when the server has it switched on, a configured AI safety
          check. When something looks illegal or dangerous it is paused ("held") and a moderator decides whether to put it
          back or remove it. The machine never bans anyone: people decide.
        </Card>
        <Card icon={<Flag />} tone="pink" title="Report, block, mute">
          You can report anything with the Report button in the ⋯ menu on a profile, post, comment or message. Blocking
          someone hides their posts and messages from you; muting a chat stops its alerts.
        </Card>
        <Card icon={<Sparkles />} tone="orange" title="Role-play stories">
          The AI storyteller writes original, teen-safe stories inspired by the books and films you love. It does not
          copy lines or lyrics from them. Its writing goes through the same safety check as everyone else's.
        </Card>
        <Card icon={<HeartHandshake />} tone="green" title="Your privacy">
          You choose who can message you, whether people see when you're online, and whether your account is private.
          Find all of it in Settings.
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ icon, tone, title, children }: { icon: ReactNode; tone: Tone; title: string; children: ReactNode }) {
  return (
    <section className="k-card flex gap-3 rounded-card p-3.5 lg:p-5">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5", TONE_STYLE[tone].softClassName)} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-[16px] font-extrabold text-ink">{title}</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-body">{children}</p>
      </div>
    </section>
  );
}
