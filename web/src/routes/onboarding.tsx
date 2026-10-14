import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Camera, Check, ImageIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { AuthTitle, Field, TextArea } from "@/components/home/auth-ui";
import { markOnboardingShown, personFromChip } from "@/components/home/home-data";
import { StepHeader } from "@/components/home/step-header";
import {
  Avatar,
  CommunityCard,
  EmptyHint,
  GradientButton,
  INTEREST_CATEGORIES,
  JoinButton,
  VerifiedTick,
  compactNumber,
  hueGradient,
  toneAt,
  useShellData,
} from "@/components/k";
import { interestArt, isInterestKey } from "@/lib/brand-art";
import { resizeImage } from "@/lib/image-resize";
import { setAvatar, setProfileCover } from "@/lib/kamino/extras";
import { joinCommunity, leaveCommunity, toggleFollowProfile, updateSettings } from "@/lib/kamino/server";
import { finishOnboarding, onboardingSuggestions, saveInterests } from "@/lib/kamino/social";
import type { CommunityCardData, CreatorCard } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

/**
 * Onboarding steps 2–5 (step 1 is creating the account on /login). 2: pick interests (mockup
 * 02-interests), 3: join a few communities, 4: follow some people, 5: photo, cover and a few words.
 * "Skip" skips one step; "Finish" marks onboarding as done and opens Home. Same steps, words and
 * rules as the phone app's `onboarding.tsx`.
 */
export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Welcome to Kamino" }] }),
  component: Onboarding,
});

type Step = 2 | 3 | 4 | 5;
const MIN_INTERESTS = 3;

const COPY: Record<Step, { lead: string; highlight: string; text: string }> = {
  2: { lead: "Pick Your ", highlight: "Interests", text: "Choose the topics you love, and we’ll personalize your feed, communities, and recommendations." },
  3: { lead: "Join ", highlight: "Communities", text: "A few places we think you’ll love. Join as many as you like." },
  4: { lead: "Follow ", highlight: "People", text: "Creators who share your interests. Follow them to see their posts." },
  5: { lead: "Your ", highlight: "Profile", text: "Add a photo and a few words so people know who you are. Everything here is optional." },
};

function Onboarding() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isPending, profile, refetchBootstrap } = useShellData();

  const [step, setStep] = useState<Step>(2);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [joined, setJoined] = useState<Record<string, "joined" | "pending" | undefined>>({});
  const [followed, setFollowed] = useState<Record<string, "following" | "requested" | "none">>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pronouns, setPronouns] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  // Signed out: creating an account comes first.
  useEffect(() => {
    if (!isPending && !user) void navigate({ to: "/login", search: { mode: "up" }, replace: true });
  }, [isPending, user, navigate]);
  // Remember onboarding was shown, so Home does not send this person here again.
  useEffect(() => {
    if (profile?.userId) markOnboardingShown(profile.userId);
  }, [profile?.userId]);

  // Start from what the person already picked (if anything).
  const interests = picked ?? profile?.interests ?? [];
  const suggestions = useQuery({
    queryKey: ["onboardingSuggestions"],
    queryFn: () => onboardingSuggestions(),
    enabled: !!user && step >= 3,
  });

  const goTo = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };
  const toggleInterest = (key: string) =>
    setPicked(interests.includes(key) ? interests.filter((k) => k !== key) : [...interests, key]);

  async function saveAndContinue() {
    setSaving(true);
    try {
      await saveInterests({ data: { keys: interests } });
      await queryClient.invalidateQueries({ queryKey: ["onboardingSuggestions"] });
      goTo(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your interests");
    } finally {
      setSaving(false);
    }
  }

  async function toggleJoin(c: CommunityCardData) {
    const state = joined[c.id] ?? (c.joined ? "joined" : undefined);
    if (state === "pending") return;
    setBusyKey(c.id);
    try {
      if (state === "joined") {
        await leaveCommunity({ data: c.id });
        setJoined((cur) => ({ ...cur, [c.id]: undefined }));
      } else {
        const result = await joinCommunity({ data: { slug: c.id } });
        setJoined((cur) => ({ ...cur, [c.id]: result.pending ? "pending" : "joined" }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleFollow(p: CreatorCard) {
    setBusyKey(p.userId);
    try {
      const result = await toggleFollowProfile({ data: p.userId });
      setFollowed((cur) => ({
        ...cur,
        [p.userId]: result.following ? "following" : result.requested ? "requested" : "none",
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function changePicture(kind: "avatar" | "cover", file: File | undefined) {
    if (!file) return;
    setBusyKey(kind);
    try {
      const dataUrl = await resizeImage(
        file,
        kind === "cover" ? { maxSide: 1600, maxChars: 1_900_000 } : { maxSide: 320, maxChars: 290_000, square: true },
      );
      if (kind === "cover") await setProfileCover({ data: { dataUrl } });
      else await setAvatar({ data: { dataUrl } });
      await refetchBootstrap();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't set the picture");
    } finally {
      setBusyKey(null);
    }
  }

  /** Saves the profile bits (when `save`), marks onboarding finished and opens Home. */
  async function finish(save: boolean) {
    setSaving(true);
    try {
      if (save && (pronouns.trim() || location.trim() || bio.trim())) {
        await updateSettings({
          data: {
            ...(pronouns.trim() ? { pronouns: pronouns.trim() } : {}),
            ...(location.trim() ? { location: location.trim() } : {}),
            ...(bio.trim() ? { bio: bio.trim() } : {}),
          },
        });
      }
      await finishOnboarding();
      await queryClient.invalidateQueries();
      await router.invalidate();
      await navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't finish setting up");
      setSaving(false);
    }
  }

  const next = () => {
    if (step === 2) return void saveAndContinue();
    if (step === 5) return void finish(true);
    goTo((step + 1) as Step);
  };
  const skip = () => {
    if (step === 5) return void finish(false);
    goTo((step + 1) as Step);
  };

  const copy = COPY[step];
  const tooFew = step === 2 && interests.length < MIN_INTERESTS;

  return (
    <AppShell chrome="none">
      <div className="flex min-h-dvh flex-col">
        <StepHeader back={step > 2 ? () => goTo((step - 1) as Step) : undefined} onSkip={skip} step={step} />

        <div className="flex-1 pb-6">
          <AuthTitle
            lead={copy.lead}
            highlight={copy.highlight}
            className="mt-[34px] gap-1.5 px-4 lg:mt-12 [&_h1]:text-[min(34px,8.2vw)] lg:[&_h1]:text-[44px] [&_p]:max-w-[390px] [&_p]:text-[14.5px] [&_p]:leading-5 lg:[&_p]:max-w-[520px] lg:[&_p]:text-[17px] lg:[&_p]:leading-6"
            text={copy.text}
          />

          <div className={cn("mx-auto mt-6 w-full lg:mt-10 lg:px-8", step === 2 ? "max-w-[1200px]" : "max-w-[1040px]")}>
            {!profile ? (
              <Loading />
            ) : step === 2 ? (
              <InterestsGrid picked={interests} onToggle={toggleInterest} />
            ) : step === 3 ? (
              <SuggestionState
                query={suggestions}
                empty={!suggestions.data?.communities.length}
                emptyTitle="No suggestions yet"
                emptyBody="You can find communities any time on the Communities page."
              >
                <div className="grid grid-cols-3 gap-2.5 px-4 sm:grid-cols-4 lg:grid-cols-6 lg:gap-4 lg:px-0">
                  {(suggestions.data?.communities ?? []).map((c, i) => {
                    const state = joined[c.id] ?? (c.joined ? "joined" : undefined);
                    return (
                      <div key={c.id} className="flex flex-col gap-1">
                        <CommunityCard
                          variant="vertical"
                          index={i}
                          community={{ ...c, tagline: c.tagline || c.description }}
                          faces={c.memberFaces.map(personFromChip)}
                          joined={!!state}
                          joinBusy={busyKey === c.id}
                          onJoin={() => void toggleJoin(c)}
                          className="h-full"
                        />
                        {state === "pending" && (
                          <p className="text-center text-[11px] font-semibold text-muted" role="status">
                            Request sent
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SuggestionState>
            ) : step === 4 ? (
              <SuggestionState
                query={suggestions}
                empty={!suggestions.data?.creators.length}
                emptyTitle="No one to suggest yet"
                emptyBody="Follow people from their profiles whenever you like."
              >
                <div className="grid gap-2.5 px-4 lg:grid-cols-2 lg:gap-4 lg:px-0">
                  {(suggestions.data?.creators ?? []).map((p, i) => {
                    const st = followed[p.userId];
                    const isFollowing = st ? st === "following" : p.following;
                    const isRequested = st ? st === "requested" : p.requested;
                    return (
                      <CreatorRow
                        key={p.userId}
                        person={p}
                        index={i}
                        following={isFollowing}
                        requested={isRequested}
                        busy={busyKey === p.userId}
                        onFollow={() => void toggleFollow(p)}
                      />
                    );
                  })}
                </div>
              </SuggestionState>
            ) : (
              <ProfileStep
                profile={profile}
                busyKey={busyKey}
                onPicture={(kind, file) => void changePicture(kind, file)}
                pronouns={pronouns}
                setPronouns={setPronouns}
                location={location}
                setLocation={setLocation}
                bio={bio}
                setBio={setBio}
              />
            )}
          </div>
        </div>

        {/* The big button stays at the bottom of the screen. */}
        <div className="sticky bottom-0 z-10 bg-bg/95 px-4 pt-2.5 pb-[calc(18px+env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[440px] flex-col gap-2">
            {tooFew && (
              <p className="text-center text-[13px] font-semibold text-muted" aria-live="polite">
                {`Pick at least ${MIN_INTERESTS} (${interests.length} picked)`}
              </p>
            )}
            <GradientButton
              gradient="hero"
              size="lg"
              full
              disabled={tooFew || saving || !profile}
              onClick={next}
              icon={step === 5 ? <Check className="size-6" strokeWidth={2.6} aria-hidden /> : undefined}
              arrow={step !== 5}
              className="h-[52px]"
            >
              {saving ? "Saving…" : step === 5 ? "Finish" : "Continue"}
            </GradientButton>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/** Step 2: the grid of 16 interest tiles (four across on phones, eight on computers). */
function InterestsGrid({ picked, onToggle }: { picked: string[]; onToggle: (key: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-[13px] px-2.5 lg:grid-cols-8 lg:gap-3.5 lg:px-0" role="group" aria-label="Interests">
      {INTEREST_CATEGORIES.map((c, i) => (
        <PickTile
          key={c.key}
          label={c.label}
          emoji={c.emoji}
          hue={i * 37}
          image={isInterestKey(c.key) ? interestArt[c.key] : undefined}
          selected={picked.includes(c.key)}
          onToggle={() => onToggle(c.key)}
        />
      ))}
    </div>
  );
}

/**
 * One interest tile, sized like the mockup: picture on top, white label row with emoji + name.
 * Selected = glowing pink-violet ring and a white check in a violet circle. (The kit's
 * `InterestTile` has a shorter label row, so "Photography" would be cut off four across.)
 */
function PickTile({
  label,
  emoji,
  image,
  hue,
  selected,
  onToggle,
}: {
  label: string;
  emoji: string;
  image?: string;
  hue: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const long = label.length > 9;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "k-focus relative flex flex-col overflow-hidden rounded-tile border-2 bg-surface text-left transition-[box-shadow,border-color,transform] duration-150 active:scale-[0.96] lg:rounded-[16px]",
        selected
          ? "border-[#D946EF] shadow-[0_0_12px_rgba(192,38,211,0.35)] dark:border-[#E879F9]"
          : "border-border shadow-card hover:border-[color-mix(in_oklab,#D946EF_40%,var(--color-border))]",
      )}
    >
      <span className="relative block aspect-[1.1] w-full overflow-hidden">
        {image ? (
          <img src={image} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <span className="grid size-full place-items-center text-[30px]" style={{ background: hueGradient(hue) }} aria-hidden>
            {emoji}
          </span>
        )}
      </span>
      <span className="flex h-[34px] items-center gap-1 px-1.5 lg:h-10 lg:gap-1.5 lg:px-2">
        <span className="text-[13.5px] leading-none lg:text-[15px]" aria-hidden>
          {emoji}
        </span>
        <span
          className={cn(
            "min-w-0 truncate font-bold text-ink lg:text-[13px] lg:tracking-[-0.2px]",
            long ? "text-[9.8px] tracking-[-0.35px]" : "text-[12px] tracking-[-0.2px]",
          )}
        >
          {label}
        </span>
      </span>
      {selected && (
        <span className="absolute top-[5px] right-[5px] grid size-[23px] place-items-center rounded-full border-2 border-white bg-violet text-white lg:top-2 lg:right-2 lg:size-7">
          <Check className="size-[13px] lg:size-4" strokeWidth={3.4} aria-hidden />
        </span>
      )}
    </button>
  );
}

/** Step 4: one suggested creator (avatar, name + tick, headline, followers, Follow). */
function CreatorRow({
  person,
  index,
  following,
  requested,
  busy,
  onFollow,
}: {
  person: CreatorCard;
  index: number;
  following: boolean;
  requested: boolean;
  busy: boolean;
  onFollow: () => void;
}) {
  return (
    <article className="k-card flex items-center gap-3 p-3">
      <Avatar person={{ name: person.displayName, hue: person.avatarHue, userId: person.userId, avatarV: person.avatarV }} size={50} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-[15px] leading-[19px] font-extrabold text-ink">{person.displayName}</span>
          {person.verified && <VerifiedTick size={14} />}
        </p>
        {person.headline && <p className="truncate text-[13px] leading-[17px] text-muted">{person.headline}</p>}
        <p className="text-[12px] leading-4 font-semibold text-subtle">
          {`${compactNumber(person.followers)} ${person.followers === 1 ? "follower" : "followers"}`}
        </p>
      </div>
      <JoinButton
        tone={toneAt(index)}
        joined={following || requested}
        busy={busy}
        onClick={onFollow}
        label="Follow"
        joinedLabel={requested && !following ? "Requested" : "Following"}
        name={person.displayName}
        size="sm"
      />
    </article>
  );
}

type ProfileBits = {
  userId: string;
  displayName: string;
  avatarHue: number;
  avatarVersion: number;
  cover: string;
};

/** Step 5: cover with the round photo overlapping it (like the profile page), then a few optional words. */
function ProfileStep({
  profile,
  busyKey,
  onPicture,
  pronouns,
  setPronouns,
  location,
  setLocation,
  bio,
  setBio,
}: {
  profile: ProfileBits;
  busyKey: string | null;
  onPicture: (kind: "avatar" | "cover", file: File | undefined) => void;
  pronouns: string;
  setPronouns: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
}) {
  const coverInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-3.5 px-4 lg:px-0">
      <div className="relative">
        <button
          type="button"
          onClick={() => coverInput.current?.click()}
          aria-label="Choose a cover picture"
          className="k-focus relative block h-[130px] w-full overflow-hidden rounded-card lg:h-[170px]"
          style={profile.cover ? undefined : { background: hueGradient(profile.avatarHue) }}
        >
          {profile.cover && <img src={profile.cover} alt="" className="size-full object-cover" />}
          <span className="absolute right-2.5 bottom-2.5 inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[rgba(15,11,42,0.6)] px-2.5 text-[12.5px] font-semibold text-white">
            <ImageIcon className="size-[15px]" aria-hidden />
            {busyKey === "cover" ? "Saving…" : "Cover"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => avatarInput.current?.click()}
          aria-label="Choose a profile photo"
          className="k-focus absolute -bottom-[38px] left-4 rounded-full"
        >
          <span className="block rounded-full ring-4 ring-surface">
            <Avatar person={{ name: profile.displayName, hue: profile.avatarHue, userId: profile.userId, avatarV: profile.avatarVersion }} size={84} />
          </span>
          <span className="absolute right-0 bottom-0.5 grid size-7 place-items-center rounded-full border-2 border-surface bg-violet text-white">
            <Camera className="size-3.5" aria-hidden />
          </span>
          {busyKey === "avatar" && <span className="sr-only">Saving your photo…</span>}
        </button>
        <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onPicture("cover", e.target.files?.[0])} />
        <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onPicture("avatar", e.target.files?.[0])} />
      </div>
      <div className="mt-10 flex flex-col gap-3">
        <Field label="Pronouns (optional)" value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={30} placeholder="e.g. she/her" autoCapitalize="none" />
        <Field label="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder="e.g. Kelowna, BC" />
        <TextArea label="Short bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} placeholder="A few words about you and what you love" />
      </div>
    </div>
  );
}

function Loading({ label = "Finding good matches…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-[14px] font-semibold text-muted" role="status">
      <span className="size-8 animate-spin rounded-full border-[3px] border-tint-violet border-t-violet" aria-hidden />
      {label}
    </div>
  );
}

/** Loading / error / empty wrapper for the suggestion steps. */
function SuggestionState({
  query,
  empty,
  emptyTitle,
  emptyBody,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  empty: boolean;
  emptyTitle: string;
  emptyBody: string;
  children: ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <EmptyHint
        icon="🌧️"
        title="Something went wrong"
        text="We couldn't load suggestions. Check your connection and try again."
        className="mx-4 lg:mx-0"
        action={
          <GradientButton size="sm" onClick={() => void query.refetch()}>
            Try again
          </GradientButton>
        }
      />
    );
  if (empty) return <EmptyHint icon="✨" title={emptyTitle} text={emptyBody} className="mx-4 lg:mx-0" />;
  return <>{children}</>;
}
