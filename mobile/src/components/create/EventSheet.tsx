import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import { GradientButton, Pill } from "@/components/k";
import { Field, Sheet, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, parseLocalDateTime } from "@/lib/format";
import { space } from "@/theme";
import { canLeadRole, CommunityChoice, useMyCommunities } from "./communities";

/** A few ready-made start times so nobody has to type a date. */
function eventPresets(now = new Date()) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const list: { key: string; label: string; iso: string }[] = [];
  const tonight = at(0, 20);
  if (tonight.getTime() - now.getTime() > 60 * 60_000) list.push({ key: "tonight", label: "Tonight, 8 PM", iso: tonight.toISOString() });
  list.push({ key: "tomorrow", label: "Tomorrow, 7 PM", iso: at(1, 19).toISOString() });
  const saturday = at((6 - now.getDay() + 7) % 7 || 7, 18);
  list.push({ key: "saturday", label: "Saturday, 6 PM", iso: saturday.toISOString() });
  return list;
}

type Props = { visible: boolean; onClose: () => void; initialSlug?: string | null };

/** "New event" for leaders: pick a community you lead, a name, a start time and a short description. */
export function EventSheet({ visible, onClose, initialSlug }: Props) {
  const queryClient = useQueryClient();
  const { list } = useMyCommunities();
  const led = list.filter((c) => canLeadRole(c.role));
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const presets = useMemo(() => eventPresets(), []);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Each time the sheet opens, start from the community the screen suggests (React's "adjust state while rendering").
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSlug(initialSlug ?? null);
      setProblem(null);
    }
  }

  const picked = list.find((c) => c.slug === slug) ?? null;
  // The suggested community only counts when you lead it; otherwise start from the first one you lead.
  const chosen = picked && canLeadRole(picked.role) ? picked : (led[0] ?? null);
  const when = custom.trim() ? parseLocalDateTime(custom) : startsAt;

  const create = async () => {
    if (!chosen) return;
    if (title.trim().length < 3) return setProblem("Give the event a name (at least 3 characters).");
    if (!when) return setProblem(custom.trim() ? "Write the time like 2026-10-31 19:30." : "Pick when it starts.");
    setBusy(true);
    setProblem(null);
    try {
      await api.createEvent({ slug: chosen.slug, title: title.trim(), body: body.trim(), kind: "event", startsAt: when });
      void queryClient.invalidateQueries({ queryKey: ["events", chosen.slug] });
      void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
      setTitle("");
      setBody("");
      setCustom("");
      onClose();
      router.push(`/community/${chosen.slug}/events`);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="New Event" onClose={onClose}>
      {!chosen ? (
        <View style={{ gap: space.md }}>
          <Txt tone="muted">
            {picked
              ? `Only the leaders of ${picked.name} can schedule its events. Ask one of them, or start your own community to host events.`
              : "Events are scheduled by community leaders. Start your own community to host events, or ask a leader of yours."}
          </Txt>
          <GradientButton label="Start a community" icon="people" full onPress={() => { onClose(); router.push("/new-community"); }} />
        </View>
      ) : (
        <>
          {picked && !canLeadRole(picked.role) ? (
            <Txt variant="small" tone="muted">{`Only leaders can schedule events in ${picked.name}, so here are the communities you lead.`}</Txt>
          ) : null}
          <View style={{ gap: space.sm }}>
            <Txt variant="caption" tone="muted">Community</Txt>
            <CommunityChoice communities={led} value={chosen.slug} onChange={setSlug} />
          </View>
          <Field label="Event name" value={title} onChangeText={setTitle} maxLength={80} placeholder="Community Talent Show" />
          <View style={{ gap: space.sm }}>
            <Txt variant="caption" tone="muted">Starts</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {presets.map((p) => {
                const on = !custom.trim() && startsAt === p.iso;
                return <Pill key={p.key} label={p.label} size="md" tone={on ? "violet" : "neutral"} variant={on ? "solid" : "tint"} onPress={() => { setStartsAt(p.iso); setCustom(""); }} accessibilityLabel={`${p.label}${on ? ", chosen" : ""}`} />;
              })}
            </View>
            <Field value={custom} onChangeText={setCustom} placeholder="Or type a time: 2026-10-31 19:30" autoCapitalize="none" autoCorrect={false} />
            {when ? <Txt variant="small" tone="accent">{formatDateTime(when)}</Txt> : null}
          </View>
          <Field label="What’s happening? (optional)" value={body} onChangeText={setBody} multiline maxLength={800} placeholder="Share the plan, who can join, what to bring…" />
          {problem ? <Txt variant="small" tone="danger">{problem}</Txt> : null}
          <GradientButton label="Create event" icon="calendar" size="lg" full busy={busy} onPress={() => void create()} />
        </>
      )}
    </Sheet>
  );
}
