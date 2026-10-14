import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Ban,
  Bell,
  Bot,
  CalendarDays,
  ChevronRight,
  CloudDownload,
  Download,
  FileText,
  Grid3x3,
  Heart,
  Info,
  Sun,
  UserPlus,
  Lock,
  Mail,
  MessageCircleMore,
  Minus,
  Moon,
  Palette,
  Plus,
  Shield,
  Sparkles,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { DesktopInstallCard } from "@/components/pwa";
import { PROFILE_FRAMES } from "@/components/avatar-frame";
import { Sheet, fieldClass } from "@/components/community/sheet";
import { SUPPORT_EMAIL } from "@/components/legal-page";
import { Avatar, GradientButton, ScreenTitle, TONE_STYLE, type Tone } from "@/components/k";
import { hourLabel, normalizeWebsite, toggleLimited } from "@/components/profile/helpers";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { getMyReferral } from "@/lib/kamino/referrals";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BUBBLE_STYLE_LABELS } from "@/lib/kamino/cosmetics";
import { deleteMyAccount } from "@/lib/kamino/extras";
import { importMyData } from "@/lib/kamino/library";
import { blockUser, exportMyData, getMe, updateSettings } from "@/lib/kamino/server";
import { applyThemeChoice, getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme";
import { PROFILE_COVERS } from "@/lib/kamino/titles";
import {
  BUBBLE_STYLES,
  INTEREST_OPTIONS,
  MOOD_PRESETS,
  PROFILE_CATEGORY_OPTIONS,
  type NotifyPrefs,
  type Profile,
} from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({ component: SettingsRoute });

type Me = Awaited<ReturnType<typeof getMe>>;
type Patch = Parameters<typeof updateSettings>[0]["data"];
type FineToggle = "notifyLikes" | "notifyComments" | "notifyFollows" | "notifyChat" | "notifyWall";

const MAX_CATEGORIES = 6;

/** The older, finer switches (still used by the server for each kind of activity). */
const FINE_TUNE: { key: FineToggle; label: string }[] = [
  { key: "notifyLikes", label: "Likes on my posts" },
  { key: "notifyComments", label: "Comments and replies" },
  { key: "notifyFollows", label: "New followers" },
  { key: "notifyChat", label: "Chat messages" },
  { key: "notifyWall", label: "Wall notes" },
];

/** Alerts by notification category (the in-app list always fills). */
const CATEGORIES: { key: keyof NotifyPrefs; label: string; hint: string; icon: ReactNode; tone: Tone }[] = [
  { key: "social", label: "Social", hint: "Likes, comments, mentions, follows", icon: <Heart />, tone: "pink" },
  { key: "community", label: "Community", hint: "Invites, announcements, achievements", icon: <Users />, tone: "blue" },
  { key: "events", label: "Events & live", hint: "Event reminders, live rooms, calls", icon: <CalendarDays />, tone: "orange" },
  { key: "messages", label: "Messages", hint: "New chat messages", icon: <MessageCircleMore />, tone: "violet" },
];

const DM_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "members", label: "People I share a community with" },
  { value: "none", label: "No one" },
] as const;

const HUES = [0, 25, 50, 140, 175, 210, 250, 290, 330];

/** The browser's time zone, e.g. "America/Vancouver" (quiet hours use it). */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

const fail = (e: unknown, fallback = "Couldn't save that") => toast.error(e instanceof Error ? e.message : fallback);

function SettingsRoute() {
  const { user, isPending } = useCurrentUserState();
  if (!isPending && !user) return <RedirectToSignIn />;
  return <Settings enabled={!!user} email={user?.primaryEmail ?? user?.displayName ?? ""} />;
}

/**
 * Settings: your profile (name, headline, pronouns, bio, location, website, profile categories, interests and
 * look), privacy, notifications (by category, quiet hours, digest), blocked people, your data, help and legal,
 * sign out and delete account. Switches save straight away; the profile card saves with its button.
 * Mirrors the phone app's Edit profile + Settings screens.
 */
function Settings({ enabled, email }: { enabled: boolean; email: string }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe(), enabled });
  const sentZone = useRef(false);

  const save = async (patch: Patch) => {
    // Show the change straight away; the server copy comes back with the refresh.
    queryClient.setQueryData<Me>(["me"], (prev) =>
      prev
        ? {
            ...prev,
            profile: {
              ...prev.profile,
              ...(patch as Partial<Profile>),
              notifyPrefs: { ...prev.profile.notifyPrefs, ...(patch.notifyPrefs ?? {}) },
            },
          }
        : prev,
    );
    try {
      await updateSettings({ data: patch });
    } catch (e) {
      fail(e);
    }
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
    void queryClient.invalidateQueries({ queryKey: ["shell"] });
  };

  // Tell the server the browser's time zone once, so quiet hours follow local time.
  const profile = me.data?.profile;
  useEffect(() => {
    if (!profile || sentZone.current) return;
    sentZone.current = true;
    const zone = browserTimeZone();
    if (zone && zone !== profile.timezone) updateSettings({ data: { timezone: zone } }).catch(() => undefined);
  }, [profile]);

  // Jump to #profile / #privacy once the cards are on screen.
  useEffect(() => {
    if (!profile || typeof window === "undefined" || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [profile]);

  return (
    <AppShell>
      <div className="space-y-3 px-4 lg:mx-auto lg:max-w-[760px] lg:space-y-4 lg:px-0 lg:pt-2">
        <ScreenTitle title="Settings" subtitle="Your profile, privacy, notifications and account." />
        <DesktopInstallCard />
        <div className="flex flex-wrap gap-3 py-2"><Link to="/privacy-dashboard" className="k-focus font-bold text-violet">Privacy dashboard and muted people</Link><Link to="/security" className="k-focus font-bold text-violet">Account security and devices</Link><Link to="/tutorial" className="k-focus font-bold text-violet">Welcome tour</Link></div>
        <div className="flex flex-wrap gap-3 py-2"><Link to="/discover-plus" className="k-focus font-bold text-violet">Discovery tools</Link><Link to="/creator" className="k-focus font-bold text-violet">Creator studio</Link><Link to="/marketplace" className="k-focus font-bold text-violet">Marketplace</Link><Link to="/support" className="k-focus font-bold text-violet">Contact support</Link></div>
        {me.isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading settings">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-card bg-surface-alt" />
            ))}
          </div>
        ) : me.isError || !me.data ? (
          <Card title="Couldn't load your settings" icon={<Info />} tone="pink">
            <p className="text-[13.5px] text-muted">{me.error?.message ?? "Please try again."}</p>
            <GradientButton size="sm" onClick={() => void me.refetch()}>
              Try again
            </GradientButton>
          </Card>
        ) : (
          <SettingsCards me={me.data} save={save} email={email} />
        )}
      </div>
    </AppShell>
  );
}

function SettingsCards({ me, save, email }: { me: Me; save: (patch: Patch) => Promise<void>; email: string }) {
  const queryClient = useQueryClient();
  const p = me.profile;
  // Older accounts may miss some keys; anything missing counts as on (digest as off).
  const prefs: NotifyPrefs = {
    ...{ social: true, community: true, events: true, messages: true, digest: false },
    ...(p.notifyPrefs as Partial<NotifyPrefs>),
  };
  const quietOn = p.quietStart !== null && p.quietEnd !== null;
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const payload = await exportMyData();
      const blob = new Blob([payload.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kamino-export.json";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      fail(e, "Could not export your data");
    } finally {
      setExporting(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return void toast.error("That file is too large to import.");
    setImporting(true);
    try {
      const result = await importMyData({ data: { json: await file.text() } });
      toast.success(
        `${result.imported} draft${result.imported === 1 ? "" : "s"} added${result.skipped ? `, ${result.skipped} skipped` : ""}. Nothing was published.`,
      );
    } catch (e) {
      fail(e, "Could not import that file");
    } finally {
      setImporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await deleteMyAccount({ data: { confirm: confirmText.trim() } });
      await signOut("/");
    } catch (e) {
      fail(e, "Could not delete your account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ProfileForm profile={p} onSaved={() => queryClient.invalidateQueries()} />

      <Card id="privacy" title="Privacy" icon={<Lock />} tone="violet">
        <SwitchRow
          label="Private account"
          hint="Only people you approve can follow you and see your posts, badges and communities."
          value={p.privateAccount}
          onChange={(privateAccount) => void save({ privateAccount })}
        />
        <SwitchRow
          label="Show when I'm online"
          hint="A green dot on your picture while you use Kamino."
          value={p.showOnline}
          onChange={(showOnline) => void save({ showOnline })}
        />
        <SwitchRow
          label="Read receipts"
          hint="Let people see when you've read their messages. Turning it off hides theirs from you too."
          value={p.showReadReceipts}
          onChange={(showReadReceipts) => void save({ showReadReceipts })}
        />
        <SwitchRow
          label="Hide the communities I've joined"
          value={p.hideJoined}
          onChange={(hideJoined) => void save({ hideJoined })}
        />
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[14px] font-bold text-ink">Who can message me</legend>
          {DM_OPTIONS.map((o) => {
            const selected = p.dmPrivacy === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-tile border px-3 text-[13.5px] focus-within:ring-2 focus-within:ring-violet",
                  selected ? "border-violet bg-tint-violet font-bold text-violet-ink" : "border-border bg-surface font-semibold text-ink",
                )}
              >
                <input
                  type="radio"
                  name="dmPrivacy"
                  value={o.value}
                  checked={selected}
                  onChange={() => void save({ dmPrivacy: o.value })}
                  className="size-4 accent-[var(--color-violet)]"
                />
                {o.label}
              </label>
            );
          })}
        </fieldset>
      </Card>

      <AppearanceCard />

      <Card
        id="notifications"
        title="Notifications"
        icon={<Bell />}
        tone="orange"
        hint="Kamino only tells you about real activity. No reminders or promotions. These switches control alerts on your devices; your notification list always fills."
      >
        {CATEGORIES.map((c) => (
          <SwitchRow
            key={c.key}
            label={c.label}
            hint={c.hint}
            icon={c.icon}
            tone={c.tone}
            value={prefs[c.key]}
            onChange={(value) => void save({ notifyPrefs: { [c.key]: value } })}
          />
        ))}
        <SwitchRow
          label="Weekly digest"
          hint="A short summary of what you missed."
          icon={<Mail />}
          tone="green"
          value={prefs.digest}
          onChange={(digest) => void save({ notifyPrefs: { digest } })}
        />
        <hr className="border-border" />
        <SwitchRow
          label="Quiet hours"
          hint="No alerts during these hours (your local time)."
          icon={<Moon />}
          tone="violet"
          value={quietOn}
          onChange={(on) => void save(on ? { quietStart: 22, quietEnd: 7 } : { quietStart: null, quietEnd: null })}
        />
        {quietOn ? (
          <div className="space-y-2 pl-[46px]">
            <HourStepper label="From" hour={p.quietStart!} onChange={(quietStart) => void save({ quietStart })} />
            <HourStepper label="Until" hour={p.quietEnd!} onChange={(quietEnd) => void save({ quietEnd })} />
            <p className="text-[12px] text-subtle">Time zone: {p.timezone || browserTimeZone() || "UTC"}</p>
          </div>
        ) : null}
        <hr className="border-border" />
        <p className="text-[14px] font-bold text-ink">Fine-tune</p>
        {FINE_TUNE.map((n) => (
          <SwitchRow key={n.key} label={n.label} value={p[n.key]} onChange={(value) => void save({ [n.key]: value })} />
        ))}
      </Card>

      <Card title="Blocked people" icon={<Ban />} tone="pink">
        {me.blocked.length === 0 ? <p className="text-[13.5px] text-muted">No one blocked.</p> : null}
        {me.blocked.map((b) => (
          <div key={b.blocked_id} className="flex items-center gap-2.5">
            <Avatar person={{ name: b.display_name, hue: 260 }} size={34} />
            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
              {b.display_name} <span className="font-medium text-subtle">@{b.handle}</span>
            </p>
            <button
              type="button"
              className="k-focus k-hit relative h-8 rounded-full border border-border bg-surface px-3.5 text-[13px] font-bold text-violet hover:bg-surface-alt"
              onClick={() =>
                void blockUser({ data: b.blocked_id }).then(() => queryClient.invalidateQueries({ queryKey: ["me"] }), fail)
              }
            >
              Unblock
            </button>
          </div>
        ))}
      </Card>

      <Card title="Account" icon={<UserRound />} tone="blue">
        <p className="text-[13.5px] text-muted">{email}</p>
        <UserButton />
      </Card>

      <Card title="Your data" icon={<CloudDownload />} tone="blue">
        <p className="text-[13px] text-muted">
          Take your writing with you: posts, wiki pages, quiz questions, drafts, characters, comments, your own chat
          messages, wall notes and shared links, as a JSON file.
        </p>
        <LinkRow icon={<Download />} label={exporting ? "Preparing your archive…" : "Export everything I've posted"} onClick={() => void exportData()} disabled={exporting} />
        <label className="k-focus flex min-h-11 cursor-pointer items-center gap-2.5 rounded-tile text-[14px] font-semibold text-ink focus-within:ring-2 focus-within:ring-violet">
          <Upload className="size-[19px] text-violet" aria-hidden />
          <span className="flex-1">{importing ? "Importing…" : "Import an exported file"}</span>
          <ChevronRight className="size-4 text-subtle" aria-hidden />
          <input
            type="file"
            accept="application/json,.json"
            disabled={importing}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void importFile(file);
            }}
          />
        </label>
        <p className="text-[12px] text-muted">
          Your posts and drafts come back as private drafts in the communities you are in. Importing the same file
          twice is safe.
        </p>
      </Card>

      <ReferralCard />

      <Card title="Help & legal" icon={<Info />} tone="green">
        <LinkRow icon={<Shield />} label="Safety and house rules" to="/safety" />
        <LinkRow icon={<Shield />} label="Privacy policy" href="/privacy" />
        <LinkRow icon={<FileText />} label="Terms of use" href="/terms" />
        <LinkRow icon={<FileText />} label="Copyright & takedown policy" href="/copyright" />
        <LinkRow icon={<Mail />} label="Contact support" href={`mailto:${SUPPORT_EMAIL}`} />
      </Card>

      <BotApiCard />

      <div className="space-y-2 pb-4">
        <button
          type="button"
          onClick={() => setSignOutOpen(true)}
          className="k-focus h-12 w-full rounded-full border border-border bg-surface text-[15px] font-bold text-ink shadow-card hover:bg-surface-alt"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="k-focus h-12 w-full rounded-full bg-tint-pink text-[15px] font-bold text-danger hover:brightness-95"
        >
          Delete my account
        </button>
      </div>

      <Sheet open={signOutOpen} onOpenChange={setSignOutOpen} title="Sign out?" description="You can sign back in any time.">
        <div className="flex gap-2">
          <button type="button" onClick={() => setSignOutOpen(false)} className="k-focus h-11 flex-1 rounded-full border border-border text-[15px] font-bold text-ink">
            Not now
          </button>
          <GradientButton size="md" className="h-11 flex-1" onClick={() => void signOut("/")}>
            Sign out
          </GradientButton>
        </div>
      </Sheet>

      <Sheet
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete account"
        description="This permanently deletes your profile, posts, comments, messages and follows. It can't be undone. Export your data first if you want a copy."
      >
        <label className="block space-y-1.5">
          <span className="block text-[13.5px] font-bold text-ink">Type DELETE to confirm</span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoComplete="off"
            className={fieldClass}
          />
        </label>
        <button
          type="button"
          disabled={confirmText.trim() !== "DELETE" || deleting}
          onClick={() => void deleteAccount()}
          className="k-focus h-11 w-full rounded-full bg-red-strong text-[15px] font-bold text-white disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete forever"}
        </button>
      </Sheet>
    </>
  );
}

/**
 * Your profile: name, headline, pronouns, bio, status, location, website, the profile category tiles (up to six),
 * interests, mood, frame, chat bubbles and cover banner. Saved with the "Save profile" button.
 */
function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<unknown> }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [pronouns, setPronouns] = useState(profile.pronouns ?? "");
  const [bio, setBio] = useState(profile.bio);
  const [status, setStatus] = useState(profile.status);
  const [location, setLocation] = useState(profile.location ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [categories, setCategories] = useState<string[]>(profile.profileCategories ?? []);
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [mood, setMood] = useState(profile.mood);
  const [frame, setFrame] = useState<string>(profile.frame);
  const [bubbleHue, setBubbleHue] = useState(profile.bubbleHue);
  const [bubbleStyle, setBubbleStyle] = useState<string>(profile.bubbleStyle);
  const [cover, setCover] = useState(profile.cover);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const websiteValue = normalizeWebsite(website);

  async function save() {
    setError(null);
    if (displayName.trim().length < 2) return setError("Your name needs at least 2 characters.");
    if (websiteValue === null) return setError("That website doesn't look right. Try something like linktr.ee/yourname.");
    setBusy(true);
    try {
      await updateSettings({
        data: {
          displayName: displayName.trim(),
          headline: headline.trim(),
          pronouns: pronouns.trim(),
          bio,
          status,
          location: location.trim(),
          website: websiteValue,
          profileCategories: categories,
          interests,
          mood,
          frame,
          bubbleHue,
          bubbleStyle,
          cover,
        },
      });
      await onSaved();
      toast.success("Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-3 lg:space-y-4"
    >
      <Card id="profile" title="About you" icon={<UserRound />} tone="violet">
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className={fieldClass} />
        </Field>
        <Field label="Headline" hint="A few words under your name.">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={40} placeholder="Digital Artist, Gamer, Bookworm…" className={fieldClass} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pronouns (optional)">
            <input value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={24} placeholder="she/her, he/him, they/them…" autoCapitalize="none" className={fieldClass} />
          </Field>
          <Field label="Location (optional)">
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={40} placeholder="City or region" className={fieldClass} />
          </Field>
        </div>
        <Field label="Bio" hint={`${bio.length}/280`}>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} className={fieldClass} />
        </Field>
        <Field label="Status">
          <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={80} placeholder="What are you up to?" className={fieldClass} />
        </Field>
        <Field label="Website (optional)" hint={websiteValue === null ? "Use a web address like linktr.ee/yourname" : undefined} error={websiteValue === null}>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            maxLength={200}
            placeholder="linktr.ee/yourname"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
            aria-invalid={websiteValue === null}
            className={fieldClass}
          />
        </Field>
      </Card>

      <Card
        title="Profile categories"
        icon={<Grid3x3 />}
        tone="orange"
        hint={`Tiles on your profile that open your posts with that tag (#art, #daily…). Pick up to ${MAX_CATEGORIES}: ${categories.length}/${MAX_CATEGORIES}.`}
      >
        <div className="flex flex-wrap gap-2">
          {PROFILE_CATEGORY_OPTIONS.map((c) => {
            const on = categories.includes(c.key);
            return (
              <ChoiceChip
                key={c.key}
                label={`${c.emoji} ${c.label}`}
                selected={on}
                disabled={!on && categories.length >= MAX_CATEGORIES}
                onClick={() => setCategories((list) => toggleLimited(list, c.key, MAX_CATEGORIES))}
              />
            );
          })}
        </div>
      </Card>

      <Card title="Interests" icon={<Sparkles />} tone="pink" hint="We use these to suggest communities and posts.">
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((o) => (
            <ChoiceChip
              key={o.key}
              label={`${o.emoji} ${o.label}`}
              selected={interests.includes(o.key)}
              onClick={() => setInterests((list) => toggleLimited(list, o.key, INTEREST_OPTIONS.length))}
            />
          ))}
        </div>
      </Card>

      <Card title="Your look" icon={<Palette />} tone="blue">
        <p className="text-[13px] font-bold text-ink">Mood</p>
        <div className="flex flex-wrap gap-2">
          {MOOD_PRESETS.map((m) => (
            <ChoiceChip key={m} label={m} selected={mood === m} onClick={() => setMood(mood === m ? "" : m)} />
          ))}
        </div>
        <p className="text-[13px] font-bold text-ink">Profile frame</p>
        <div className="flex flex-wrap gap-2">
          {PROFILE_FRAMES.map((f) => (
            <ChoiceChip key={f.id} label={f.label} selected={frame === f.id} onClick={() => setFrame(f.id)} />
          ))}
        </div>
        <p className="text-[13px] font-bold text-ink">Chat bubble colour</p>
        <div className="flex flex-wrap gap-2">
          {HUES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`Bubble colour ${h}`}
              aria-pressed={bubbleHue === h}
              onClick={() => setBubbleHue(h)}
              className={cn("k-focus size-10 rounded-full", bubbleHue === h && "ring-[3px] ring-ink ring-offset-2 ring-offset-surface")}
              style={{ background: `hsl(${h} 70% 62%)` }}
            />
          ))}
        </div>
        <p className="text-[13px] font-bold text-ink">Chat bubble style</p>
        <div className="flex flex-wrap gap-2">
          {BUBBLE_STYLES.map((b) => (
            <ChoiceChip key={b} label={BUBBLE_STYLE_LABELS[b]} selected={bubbleStyle === b} onClick={() => setBubbleStyle(b)} />
          ))}
        </div>
        <p className="text-[13px] font-bold text-ink">Cover banner</p>
        <div className="grid grid-cols-3 gap-2">
          {PROFILE_COVERS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cover === c.src}
              aria-label={`Use the ${c.label} banner`}
              onClick={() => setCover(c.src)}
              className={cn("k-focus overflow-hidden rounded-[12px] ring-offset-2 ring-offset-surface", cover === c.src && "ring-2 ring-violet")}
            >
              <img src={c.src} alt="" className="h-14 w-full object-cover" />
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted">
          Upload your own cover or photo from the ⋯ menu on <Link to="/me" className="font-bold text-violet">your profile</Link>.
        </p>
        <Link to="/privacy-dashboard" className="k-focus font-bold text-violet">Manage checked age eligibility</Link>
      </Card>

      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-tile bg-tint-pink p-3 text-[13px] font-semibold text-danger">
          <Info className="size-[18px] shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <GradientButton type="submit" size="lg" gradient="hero" full disabled={busy} className="h-12 text-[16px]">
        {busy ? "Saving…" : "Save profile"}
      </GradientButton>
    </form>
  );
}

/** A white card with a tinted icon circle and a title (the redesign's section look). */
function ReferralCard() {
  const referral = useQuery({ queryKey: ["myReferral"], queryFn: () => getMyReferral(), staleTime: 30_000 });
  if (!referral.data) return null;
  const link = `${window.location.origin}${referral.data.path}`;
  return (
    <Card title="Invite friends" icon={<UserPlus />} tone="orange">
      <p className="text-[13px] text-muted">
        Share your link. When a friend joins and claims it, you earn <strong>{referral.data.repPerInvite} reputation</strong>{" "}
        and they start with <strong>{referral.data.repForFriend}</strong>. Reputation is earned, never bought.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-full bg-surface-alt px-3 py-1.5 text-[13px] font-extrabold tracking-[0.12em] text-ink">
          {referral.data.code}
        </code>
        <button
          type="button"
          className="k-focus rounded-full bg-grad-primary px-4 py-1.5 text-[13px] font-bold text-white"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(
              () => toast.success("Invite link copied"),
              () => toast.error("Could not copy — your code is " + referral.data!.code),
            );
          }}
        >
          Copy invite link
        </button>
      </div>
      <p className="text-[12px] text-muted">
        {referral.data.invited} {referral.data.invited === 1 ? "friend" : "friends"} joined through your link ·{" "}
        {referral.data.repEarned} reputation earned
      </p>
    </Card>
  );
}

/** Bot API tokens: lets automated accounts read and post messages. */
function BotApiCard() {
  const [tokens, setTokens] = useState<{ id: number; name: string; createdAt: string; lastUsedAt: string | null; revoked: boolean }[]>([]);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const { listBotTokens } = await import("@/lib/kamino/bots");
    setTokens(await listBotTokens({}));
  };
  useEffect(() => { void refresh(); }, []);

  const create = async () => {
    setBusy(true);
    setNewToken(null);
    try {
      const { createBotToken } = await import("@/lib/kamino/bots");
      const t = await createBotToken({ data: { name: name.trim() || "Unnamed bot" } });
      setNewToken(t.token);
      setName("");
      await refresh();
      toast.success("Bot token created — copy it now, it won't be shown again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create token.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    try {
      const { revokeBotToken } = await import("@/lib/kamino/bots");
      await revokeBotToken({ data: id });
      await refresh();
      toast.success("Token revoked.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revoke token.");
    }
  };

  return (
    <Card
      title="Bot API"
      icon={<Bot />}
      tone="violet"
      hint="Give an automated account its own token to read and post messages where it's a member."
    >
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bot name, e.g. French teacher"
          className={fieldClass}
          maxLength={60}
        />
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="k-focus h-11 shrink-0 rounded-full bg-tint-violet px-4 text-[14px] font-bold text-violet-ink disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create token"}
        </button>
      </div>
      {newToken && (
        <div className="rounded-xl bg-surface-alt p-3">
          <p className="text-[12.5px] font-bold text-ink">Copy this token now — it won't be shown again:</p>
          <code className="mt-1 block break-all rounded-lg bg-ink px-2 py-1.5 font-mono text-[12px] text-white select-all">
            {newToken}
          </code>
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-xl bg-surface-alt px-3 py-2">
              <div>
                <p className="text-[13.5px] font-bold text-ink">{t.name}</p>
                <p className="text-[12px] text-muted">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : " · never used"}
                  {t.revoked ? " · revoked" : ""}
                </p>
              </div>
              {!t.revoked && (
                <button
                  type="button"
                  onClick={() => revoke(t.id)}
                  className="k-focus rounded-full px-3 py-1.5 text-[13px] font-bold text-danger hover:bg-tint-pink"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Card({
  id,
  title,
  icon,
  tone,
  hint,
  children,
}: {
  id?: string;
  title: string;
  icon: ReactNode;
  tone: Tone;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="k-card scroll-mt-20 space-y-3 rounded-card p-3.5 lg:p-5" aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="flex items-center gap-2.5">
        <span className={cn("grid size-8 place-items-center rounded-full [&_svg]:size-[17px]", TONE_STYLE[tone].softClassName)} aria-hidden>
          {icon}
        </span>
        <h2 id={id ? `${id}-title` : undefined} className="text-[17px] font-extrabold text-ink">
          {title}
        </h2>
      </div>
      {hint ? <p className="-mt-1 text-[12.5px] text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13.5px] font-bold text-ink">{label}</span>
      {children}
      {hint ? <span className={cn("block text-[12px]", error ? "font-semibold text-danger" : "text-muted")}>{hint}</span> : null}
    </label>
  );
}

/** A label with an on/off switch (saved by the caller). */
/** Light / dark / system theme switch. Applies instantly via data-theme on <html> (see styles.css). */
function AppearanceCard() {
  const [choice, setChoice] = useState<ThemeChoice>(() => getThemeChoice());
  useEffect(() => {
    applyThemeChoice(getThemeChoice());
  }, []);
  const pick = (next: ThemeChoice) => {
    setChoice(next);
    setThemeChoice(next);
  };
  return (
    <Card title="Appearance" icon={<Palette />} tone="violet" hint="System follows your phone or computer's light/dark setting.">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour theme">
        {(["system", "light", "dark"] as ThemeChoice[]).map((c) => (
          <ChoiceChip
            key={c}
            label={c === "system" ? "System" : c === "light" ? "Light" : "Dark"}
            selected={choice === c}
            onClick={() => pick(c)}
          />
        ))}
      </div>
    </Card>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
  icon,
  tone = "violet",
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      {icon ? (
        <span className={cn("grid size-[34px] shrink-0 place-items-center rounded-full [&_svg]:size-4", TONE_STYLE[tone].softClassName)} aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{label}</p>
        {hint ? <p className="text-[12px] leading-4 text-muted">{hint}</p> : null}
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
            "absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform",
            value && "translate-x-5",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}

/** A pickable pill: white with a border, or violet when chosen. */
function ChoiceChip({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "k-focus k-hit relative h-9 rounded-full border px-3.5 text-[13px] transition-colors disabled:opacity-45",
        selected ? "border-transparent bg-grad-primary font-bold text-white" : "border-border bg-surface font-semibold text-ink hover:bg-surface-alt",
      )}
    >
      {label}
    </button>
  );
}

function LinkRow({
  icon,
  label,
  to,
  href,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <span className="text-violet [&_svg]:size-[19px]" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-4 text-subtle" aria-hidden />
    </>
  );
  const cls = "k-focus flex min-h-11 w-full items-center gap-2.5 rounded-tile text-left text-[14px] font-semibold text-ink hover:text-violet disabled:opacity-60";
  if (to)
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  if (href)
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** "From  [-] 10 PM [+]": picks an hour 0–23, wrapping around midnight. */
function HourStepper({ label, hour, onChange }: { label: string; hour: number; onChange: (h: number) => void }) {
  const step = (d: number) => onChange((hour + d + 24) % 24);
  const btn = "k-focus grid size-9 place-items-center rounded-full bg-tint-violet text-violet-ink";
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-12 text-[13.5px] font-semibold text-muted">{label}</span>
      <button type="button" className={btn} onClick={() => step(-1)} aria-label={`${label}: one hour earlier`}>
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="min-w-16 text-center text-[15px] font-extrabold text-ink" aria-live="polite">
        {hourLabel(hour)}
      </span>
      <button type="button" className={btn} onClick={() => step(1)} aria-label={`${label}: one hour later`}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
