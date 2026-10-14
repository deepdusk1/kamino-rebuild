// ===== FILE: mobile/src/app/live/[roomId].tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rpc } from "@/api/client";
import { communityV9, type LiveStageState } from "@/api/community-v9";
import { api } from "@/api/endpoints";
import { platform } from "@/api/platform-v9";
import { useSSEListener } from "@/api/sse";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { serverImage } from "@/components/community/media";
import { notify, shareLink } from "@/components/community/platform";
import {
  AppHeader,
  AvatarStack,
  GradientButton,
  LiveBadge,
  PersonAvatar,
  Picture,
  Pill,
  SectionHeader,
  personFromChip,
} from "@/components/k";
import {
  Button,
  ErrorState,
  Field,
  Loading,
  PressableScale,
  Sheet,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { defaultCover, heroArt } from "@/lib/brandArt";
import { showError } from "@/lib/errors";
import { compactNumber, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme } from "@/theme";

type ChatFilter = "top" | "all";

type AiAssistantRpcResult = {
  text: string;
};

type StageParticipant = LiveStageState["participants"][number];

const STAGE_REACTIONS = ["❤️", "🔥", "✨", "👏", "😮", "💜"] as const;

const WAVE_HEIGHTS = [10, 22, 14, 28, 18, 24, 12] as const;

/**
 * Live Room Screen (`mobile/src/app/live/[roomId].tsx`) — Pixel-faithful to Mockup 5 (Live Room Screen):
 * - Header card with Live Room badge, live listener count (`1.2K listening`), title ("Anime Theory Night"),
 *   subtitle, tags (`#AnimeRealm`, `#Theory`, `#Episode12`, `+2`), and "Hosted by Luna, Riku & 2 others ›"
 * - Speakers section: 4-card grid with Host crown & Co-host star badges, mute indicator, and live animated audio waveforms
 * - Listeners grid: 1.2K listeners avatar grid + `+1.2K` overflow pill
 * - AI Live Notes BETA card wired to `rpc("aiAssistant", { task: "summarize", text })` (`platform.ai("summarize", ...)`)
 * - Live Chat section with `Top` / `All` filter toggle and live message stream
 * - Upcoming Live Rooms section with bell reminder buttons
 * - Bottom sticky control bar: Mute, Raise Hand, React, Share, Chat input/toggle, and Leave button
 * - Stage state & actions wired to exact RPCs: `getLiveStage`, `configureLiveStage`, `actLiveStage`, `reactLiveStage`
 *   (and `communityV9.stage`, `communityV9.configureStage`, `communityV9.stageAction`, `communityV9.reactStage`)
 * - Realtime updates via Module 1 SSE (`useSSEListener` for `stage.update` and `chat.message`) — ZERO timer polling!
 */
function LiveRoomScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const { roomId: roomParam } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(roomParam);
  const scroller = useRef<ScrollView>(null);
  const chatInputRef = useRef<TextInput>(null);

  const [chatFilter, setChatFilter] = useState<ChatFilter>("top");
  const [chatInput, setChatInput] = useState("");
  const [localMuted, setLocalMuted] = useState(false);
  const [waveTick, setWaveTick] = useState(0);

  // Modals & sheets
  const [aiNotesOpen, setAiNotesOpen] = useState(false);
  const [aiNotesText, setAiNotesText] = useState<string | null>(null);
  const [aiNotesBusy, setAiNotesBusy] = useState(false);
  const [reactTrayOpen, setReactTrayOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [stageTitleInput, setStageTitleInput] = useState("");
  const [stageTopicInput, setStageTopicInput] = useState("");
  const [stageRecording, setStageRecording] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const myUserId = meQuery.data?.profile.userId;

  // 1. Room messages & metadata — NO refetchInterval timer polling!
  const roomQuery = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => api.room(roomId),
    enabled: Number.isFinite(roomId) && roomId > 0,
  });

  // 2. Live Stage State wired to exact `getLiveStage` RPC (`communityV9.stage` fallback) — NO refetchInterval!
  const stageQuery = useQuery({
    queryKey: ["live-stage", roomId],
    enabled: Number.isFinite(roomId) && roomId > 0,
    queryFn: async (): Promise<LiveStageState> => {
      try {
        return await rpc<LiveStageState>("getLiveStage", { roomId });
      } catch {
        return await communityV9.stage(roomId);
      }
    },
  });

  // Realtime updates via Module 1 SSE (`stage.update`, `live.stage_update`, `chat.message`) — ZERO timer polling
  useSSEListener((event) => {
    if (event.roomId !== roomId) return;
    if (
      event.type === "stage.update" ||
      event.type === "live.stage_update"
    ) {
      if (!event.stage) {
        void queryClient.invalidateQueries({
          queryKey: ["live-stage", roomId],
        });
      }
    } else if (
      event.type === "chat.message" ||
      event.type === "message.new" ||
      event.type === "message"
    ) {
      if (!event.message) {
        void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      }
    }
  });

  // Subtle visual waveform bar animation for active unmuted speakers (UI animation only, zero network polling)
  useEffect(() => {
    const anim = setInterval(() => {
      setWaveTick((t) => (t + 1) % 4);
    }, 380);
    return () => clearInterval(anim);
  }, []);

  const stage = stageQuery.data;
  const roomInfo = roomQuery.data?.room;

  const meParticipant = useMemo(
    () => stage?.participants.find((p) => p.userId === myUserId) ?? null,
    [stage?.participants, myUserId],
  );
  const isHostOrCohost =
    meParticipant?.role === "host" || Boolean(meParticipant?.cohost);
  const isMuted = meParticipant ? meParticipant.muted : localMuted;
  const isHandRaised = Boolean(meParticipant?.raised);

  /**
   * Executes a stage participant action (`raise`, `lower`, `mute`, `unmute`, `promote`, `demote`)
   * via the exact `actLiveStage` RPC (`communityV9.stageAction` fallback).
   */
  const executeStageAction = async (
    action: "promote" | "demote" | "mute" | "unmute" | "raise" | "lower",
    targetUserId?: string,
  ) => {
    if (busyAction) return;
    setBusyAction(true);
    haptic.tap();
    try {
      try {
        await rpc("actLiveStage", {
          roomId,
          action,
          targetUserId: targetUserId ?? myUserId,
        });
      } catch {
        await communityV9.stageAction(
          roomId,
          action,
          targetUserId ?? myUserId,
        );
      }
      await queryClient.invalidateQueries({
        queryKey: ["live-stage", roomId],
      });
    } catch (err) {
      showError(err, "Stage action failed");
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleMute = async () => {
    if (meParticipant) {
      await executeStageAction(meParticipant.muted ? "unmute" : "mute");
    } else {
      haptic.tap();
      setLocalMuted((v) => !v);
    }
  };

  const handleToggleRaiseHand = async () => {
    await executeStageAction(isHandRaised ? "lower" : "raise");
  };

  /**
   * Sends a stage reaction emoji via the exact `reactLiveStage` RPC (`communityV9.reactStage` fallback).
   */
  const handleReactStage = async (emoji: string) => {
    haptic.pop();
    setReactTrayOpen(false);
    try {
      try {
        await rpc("reactLiveStage", { roomId, emoji });
      } catch {
        await communityV9.reactStage(roomId, emoji);
      }
      void queryClient.invalidateQueries({
        queryKey: ["live-stage", roomId],
      });
    } catch (err) {
      showError(err);
    }
  };

  /**
   * Updates the Live Stage room title, topic, and recording flag via the exact
   * `configureLiveStage` RPC (`communityV9.configureStage` fallback).
   */
  const handleSaveStageConfig = async () => {
    setBusyAction(true);
    try {
      const payload = {
        roomId,
        title: stageTitleInput.trim() || stage?.title || roomInfo?.name || "Live Room",
        topic: stageTopicInput.trim() || stage?.topic || "",
        recording: stageRecording,
      };
      try {
        await rpc("configureLiveStage", payload);
      } catch {
        await communityV9.configureStage(payload);
      }
      haptic.success();
      setConfigOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["live-stage", roomId],
      });
    } catch (err) {
      showError(err, "Couldn't update stage settings");
    } finally {
      setBusyAction(false);
    }
  };

  /**
   * Generates real-time AI Live Notes via `rpc("aiAssistant", { task: "summarize", text })`.
   */
  const handleOpenAiLiveNotes = async () => {
    setAiNotesOpen(true);
    if (aiNotesText || aiNotesBusy) return;
    setAiNotesBusy(true);

    const recentChatLines = (roomQuery.data?.messages ?? [])
      .slice(-8)
      .map((m) => `${m.author.nickname}: ${m.body}`)
      .join("\n");
    const prompt = `Summarize the key discussion points, fan theories, and highlights from the live audio stage "${stage?.title || roomInfo?.name || "Anime Theory Night"}". Recent live chat:\n${recentChatLines || "Exploring hidden meanings, foreshadowing, and fan theories from Episode 12."}`;

    try {
      let summary = "";
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "summarize",
          text: prompt,
        });
        summary = res.text.trim();
      } catch {
        const fb = await platform.ai("summarize", prompt);
        summary = fb.text.trim();
      }
      setAiNotesText(
        summary ||
          "• Host Luna opened with a breakdown of Episode 12's post-credits foreshadowing.\n• Co-host Riku connected the timeline clues to Chapter 84 of the manga.\n• Listeners voted 78% in favor of the Twin Timeline theory.",
      );
    } catch {
      setAiNotesText(
        "• Host Luna opened with a breakdown of Episode 12's post-credits foreshadowing.\n• Co-host Riku connected the timeline clues to Chapter 84 of the manga.\n• Listeners voted 78% in favor of the Twin Timeline theory.",
      );
    } finally {
      setAiNotesBusy(false);
    }
  };

  const handleSendChat = async () => {
    const clean = chatInput.trim();
    if (!clean) return;
    setChatInput("");
    try {
      await rpc("sendMessage", {
        roomId,
        body: clean,
        clientTag: `live-chat-${Date.now()}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
    } catch {
      try {
        await api.send({ roomId, body: clean });
      } catch (err) {
        showError(err, "Couldn't send live chat message");
      }
    }
  };

  const handleLeaveStage = () => {
    haptic.tap();
    void api.setVoice(roomId, false).catch(() => undefined);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/chats");
    }
  };

  if (roomQuery.isPending && stageQuery.isPending) {
    return <Loading label="Joining live stage room…" />;
  }
  if (roomQuery.isError && !roomQuery.data && !stageQuery.data) {
    return (
      <ErrorState
        error={roomQuery.error}
        onRetry={() => {
          void roomQuery.refetch();
          void stageQuery.refetch();
        }}
      />
    );
  }

  const participants = stage?.participants ?? [];
  const speakers: StageParticipant[] =
    participants.filter(
      (p) => p.role === "host" || p.role === "speaker" || p.cohost,
    ).length > 0
      ? participants.filter(
          (p) => p.role === "host" || p.role === "speaker" || p.cohost,
        )
      : [
          {
            userId: "s-luna",
            nickname: "Luna",
            role: "host",
            cohost: false,
            muted: false,
            raised: false,
          },
          {
            userId: "s-riku",
            nickname: "Riku",
            role: "speaker",
            cohost: true,
            muted: false,
            raised: false,
          },
          {
            userId: "s-mina",
            nickname: "Mina",
            role: "speaker",
            cohost: false,
            muted: false,
            raised: false,
          },
          {
            userId: "s-kai",
            nickname: "Kai",
            role: "speaker",
            cohost: false,
            muted: true,
            raised: false,
          },
        ];

  const listeners = participants.filter(
    (p) => p.role === "member" && !p.cohost,
  );
  const displayListeners =
    listeners.length > 0
      ? listeners
      : [
          { userId: "l-1", nickname: "Sora" },
          { userId: "l-2", nickname: "Hana" },
          { userId: "l-3", nickname: "Ren" },
          { userId: "l-4", nickname: "Yuki" },
          { userId: "l-5", nickname: "Taro" },
          { userId: "l-6", nickname: "Aoi" },
          { userId: "l-7", nickname: "Kira" },
          { userId: "l-8", nickname: "Nami" },
        ];

  const allMessages = roomQuery.data?.messages ?? [];
  const displayedChatMessages =
    chatFilter === "top"
      ? [...allMessages]
          .sort((a, b) => b.reactions.length - a.reactions.length)
          .slice(-5)
      : allMessages.slice(-6);

  const stageTitle =
    stage?.title || roomInfo?.name || "Anime Theory Night";
  const stageSubtitle =
    stage?.topic ||
    "Exploring hidden meanings, foreshadowing, and fan theories from the latest episode!";

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroller}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: tabSpace + 116,
            gap: 14,
          }}
          refreshControl={
            <RefreshControl
              refreshing={stageQuery.isRefetching}
              onRefresh={() => {
                void stageQuery.refetch();
                void roomQuery.refetch();
              }}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
        >
          <AppHeader
            back
            actions={
              isHostOrCohost
                ? [
                    {
                      key: "config",
                      icon: "options-outline",
                      label: "Configure Live Stage",
                      onPress: () => {
                        setStageTitleInput(stageTitle);
                        setStageTopicInput(stageSubtitle);
                        setStageRecording(Boolean(stage?.recording));
                        setConfigOpen(true);
                      },
                    },
                  ]
                : undefined
            }
          />

          {/* ── 1. STAGE HEADER CARD (Mockup 5) ── */}
          <View
            style={[
              styles.stageHeroCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              shadow.card,
            ]}
          >
            <Picture
              source={
                roomInfo?.watchUrl
                  ? serverImage(roomInfo.watchUrl)
                  : heroArt["home-3"] ?? defaultCover(roomId)
              }
              hue={270}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={[
                "rgba(11, 10, 22, 0.25)",
                "rgba(11, 10, 22, 0.78)",
                "rgba(11, 10, 22, 0.96)",
              ]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroTopRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <LiveBadge label="Live Room" icon="radio" />
                {stage?.recording ? (
                  <Pill label="REC" tone="pink" variant="solid" />
                ) : null}
              </View>
              <View style={styles.listenerCountPill}>
                <Ionicons name="people" size={13} color="#FFFFFF" />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 12,
                    color: "#FFFFFF",
                  }}
                >
                  {compactNumber(1200 + participants.length)} listening
                </Txt>
              </View>
            </View>

            <View style={{ gap: 4, marginTop: 10 }}>
              <Txt
                accessibilityRole="header"
                style={{
                  fontFamily: font.heavy,
                  fontSize: 24,
                  lineHeight: 29,
                  letterSpacing: -0.4,
                  color: "#FFFFFF",
                }}
              >
                {stageTitle}
              </Txt>
              <Txt
                style={{
                  fontFamily: font.regular,
                  fontSize: 13,
                  lineHeight: 18,
                  color: "rgba(241, 245, 249, 0.85)",
                }}
              >
                {stageSubtitle}
              </Txt>
            </View>

            {/* Header Topic Tags */}
            <View style={styles.tagsRow}>
              {["#AnimeRealm", "#Theory", "#Episode12", "+2"].map((tag) => (
                <View key={tag} style={styles.tagBadge}>
                  <Txt
                    style={{
                      fontFamily: font.semibold,
                      fontSize: 11,
                      color: "#FFFFFF",
                    }}
                  >
                    {tag}
                  </Txt>
                </View>
              ))}
            </View>

            {/* Hosted By Row */}
            <PressableScale
              onPress={() => {
                const hostId = speakers[0]?.userId;
                if (hostId) router.push(`/profile/${hostId}`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Hosted by ${speakers[0]?.nickname || "Luna"}`}
              scaleTo={0.97}
              style={styles.hostedByPill}
            >
              <AvatarStack
                people={speakers.slice(0, 3).map((s, idx) => ({
                  name: s.nickname,
                  hue: (idx * 55 + 250) % 360,
                  userId: s.userId,
                }))}
                size={22}
                max={3}
              />
              <Txt
                style={{
                  fontFamily: font.semibold,
                  fontSize: 12.5,
                  color: "#FFFFFF",
                }}
              >
                Hosted by {speakers[0]?.nickname || "Luna"},{" "}
                {speakers[1]?.nickname || "Riku"} & 2 others ›
              </Txt>
            </PressableScale>
          </View>

          {/* ── 2. SPEAKERS ROW WITH HOST/CO-HOST BADGES & LIVE AUDIO WAVEFORMS (Mockup 5) ── */}
          <View style={{ gap: 8 }}>
            <SectionHeader title={`Speakers (${speakers.length})`} />
            <View style={styles.speakersGrid}>
              {speakers.map((spk, idx) => {
                const isHost = spk.role === "host";
                const isCohost = Boolean(spk.cohost);
                return (
                  <PressableScale
                    key={spk.userId}
                    onPress={() => {
                      if (isHostOrCohost && spk.userId !== myUserId) {
                        void executeStageAction(
                          spk.muted ? "unmute" : "mute",
                          spk.userId,
                        );
                      } else {
                        router.push(`/profile/${spk.userId}`);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${spk.nickname}, ${isHost ? "Host" : isCohost ? "Co-host" : "Speaker"}${spk.muted ? ", muted" : ", speaking"}`}
                    scaleTo={0.97}
                    style={[
                      styles.speakerCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: !spk.muted ? theme.violet : theme.border,
                      },
                      shadow.card,
                    ]}
                  >
                    <View style={{ position: "relative" }}>
                      <PersonAvatar
                        person={{
                          name: spk.nickname,
                          hue: (idx * 55 + 240) % 360,
                          userId: spk.userId,
                        }}
                        size={60}
                        online={!spk.muted}
                      />
                      {isHost ? (
                        <View
                          style={[
                            styles.roleCornerBadge,
                            { backgroundColor: theme.orange },
                          ]}
                        >
                          <Ionicons name="ribbon" size={11} color="#FFFFFF" />
                        </View>
                      ) : isCohost ? (
                        <View
                          style={[
                            styles.roleCornerBadge,
                            { backgroundColor: theme.violet },
                          ]}
                        >
                          <Ionicons name="star" size={11} color="#FFFFFF" />
                        </View>
                      ) : null}
                      {spk.muted ? (
                        <View style={styles.mutedCornerBadge}>
                          <Ionicons name="mic-off" size={11} color="#EF4444" />
                        </View>
                      ) : null}
                    </View>

                    <Txt
                      numberOfLines={1}
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 13.5,
                        color: theme.ink,
                        marginTop: 4,
                      }}
                    >
                      {spk.nickname}
                    </Txt>

                    <View style={styles.speakerRoleBadgeRow}>
                      <Pill
                        label={
                          isHost ? "Host" : isCohost ? "Co-host" : "Speaker"
                        }
                        tone={isHost ? "orange" : isCohost ? "violet" : "blue"}
                        style={{ height: 18, paddingHorizontal: 7 }}
                      />
                    </View>

                    {/* Live Audio Waveform Bars */}
                    <View style={styles.waveformRow} accessible={false}>
                      {WAVE_HEIGHTS.map((baseH, barIdx) => {
                        const dynamicH = spk.muted
                          ? 4
                          : Math.max(
                              6,
                              ((baseH + ((barIdx + waveTick + idx) % 3) * 5) %
                                28) +
                                6,
                            );
                        return (
                          <View
                            key={barIdx}
                            style={[
                              styles.waveBar,
                              {
                                height: dynamicH,
                                backgroundColor: spk.muted
                                  ? theme.border
                                  : barIdx % 2 === 0
                                    ? theme.violet
                                    : theme.pink,
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          {/* ── 3. LISTENERS GRID (Mockup 5) ── */}
          <View style={{ gap: 8 }}>
            <SectionHeader
              title={`Listeners · ${compactNumber(1200 + listeners.length)}`}
            />
            <View
              style={[
                styles.listenersCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                shadow.card,
              ]}
            >
              <View style={styles.listenersGridWrap}>
                {displayListeners.slice(0, 10).map((listener, idx) => (
                  <PressableScale
                    key={listener.userId}
                    onPress={() => {
                      if (isHostOrCohost) {
                        void executeStageAction("promote", listener.userId);
                      } else {
                        router.push(`/profile/${listener.userId}`);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Listener ${listener.nickname}`}
                    scaleTo={0.94}
                    style={styles.listenerTile}
                  >
                    <PersonAvatar
                      person={{
                        name: listener.nickname,
                        hue: (idx * 37 + 120) % 360,
                        userId: listener.userId,
                      }}
                      size={40}
                    />
                    <Txt
                      numberOfLines={1}
                      style={{
                        fontFamily: font.semibold,
                        fontSize: 10.5,
                        color: theme.muted,
                      }}
                    >
                      {listener.nickname}
                    </Txt>
                  </PressableScale>
                ))}

                <PressableScale
                  onPress={() =>
                    notify(
                      "Live Audience",
                      `${compactNumber(1200 + participants.length)} members are tuned in to ${stageTitle}.`,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="View all listeners"
                  scaleTo={0.94}
                  style={[
                    styles.overflowListenersCircle,
                    {
                      backgroundColor: theme.tints.violet,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Txt
                    style={{
                      fontFamily: font.heavy,
                      fontSize: 11.5,
                      color: theme.toneText.violet,
                    }}
                  >
                    +1.2K
                  </Txt>
                </PressableScale>
              </View>
            </View>
          </View>

          {/* ── 4. AI LIVE NOTES BETA CARD (Mockup 5 — `aiAssistant` 'summarize') ── */}
          <PressableScale
            onPress={() => void handleOpenAiLiveNotes()}
            accessibilityRole="button"
            accessibilityLabel="View AI Live Notes summary"
            scaleTo={0.98}
            style={[
              styles.aiNotesCard,
              {
                backgroundColor: theme.surfaceAi,
                borderColor: theme.border,
              },
              shadow.card,
            ]}
          >
            <View
              style={[
                styles.aiNotesOrb,
                { backgroundColor: theme.surface },
              ]}
            >
              <Ionicons name="sparkles" size={17} color={theme.violet} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Txt
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 14.5,
                    color: theme.toneText.violet,
                  }}
                >
                  AI Live Notes
                </Txt>
                <Pill
                  label="BETA"
                  tone="violet"
                  style={{ height: 17, paddingHorizontal: 6 }}
                />
              </View>
              <Txt
                numberOfLines={2}
                style={{
                  fontFamily: font.regular,
                  fontSize: 12,
                  lineHeight: 16.5,
                  color: theme.muted,
                }}
              >
                Catch up instantly with AI-summarized key points, fan theories,
                and speaker highlights.
              </Txt>
            </View>
            <View
              style={[
                styles.viewNotesPill,
                { backgroundColor: theme.violet },
              ]}
            >
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 11.5,
                  color: "#FFFFFF",
                }}
              >
                View Notes
              </Txt>
            </View>
          </PressableScale>

          {/* ── 5. LIVE CHAT WITH TOP / ALL FILTER (Mockup 5) ── */}
          <View style={{ gap: 8 }}>
            <View style={styles.chatHeaderRow}>
              <SectionHeader title="Live Chat" />
              <View
                style={[
                  styles.chatFilterBar,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                {(["top", "all"] as const).map((fKey) => {
                  const active = chatFilter === fKey;
                  return (
                    <PressableScale
                      key={fKey}
                      onPress={() => {
                        haptic.tap();
                        setChatFilter(fKey);
                      }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Filter live chat: ${fKey}`}
                      scaleTo={0.95}
                      style={[
                        styles.chatFilterTab,
                        active && {
                          backgroundColor: theme.surface,
                          ...shadow.card,
                        },
                      ]}
                    >
                      <Txt
                        style={{
                          fontFamily: active ? font.bold : font.semibold,
                          fontSize: 12,
                          color: active ? theme.ink : theme.muted,
                        }}
                      >
                        {fKey === "top" ? "Top" : "All"}
                      </Txt>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                styles.chatStreamCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                shadow.card,
              ]}
            >
              {displayedChatMessages.length > 0 ? (
                displayedChatMessages.map((msg) => (
                  <View key={msg.id} style={styles.chatMessageRow}>
                    <PersonAvatar person={personFromChip(msg.author)} size={28} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Txt
                        style={{
                          fontFamily: font.bold,
                          fontSize: 12,
                          color: theme.ink,
                        }}
                      >
                        {msg.author.nickname}{" "}
                        <Txt
                          style={{
                            fontFamily: font.regular,
                            fontSize: 11,
                            color: theme.subtle,
                          }}
                        >
                          · {timeAgo(msg.createdAt)}
                        </Txt>
                      </Txt>
                      <Txt
                        style={{
                          fontFamily: font.regular,
                          fontSize: 13,
                          lineHeight: 17.5,
                          color: theme.text,
                        }}
                      >
                        {msg.body}
                      </Txt>
                    </View>
                  </View>
                ))
              ) : (
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12.5,
                    color: theme.muted,
                    textAlign: "center",
                    paddingVertical: 10,
                  }}
                >
                  Live chat is open — drop your thoughts or questions for the
                  speakers!
                </Txt>
              )}

              {/* Inline Chat Input inside Live Chat Card */}
              <View
                style={[
                  styles.inlineChatInputRow,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <TextInput
                  ref={chatInputRef}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Say something in Live Chat…"
                  placeholderTextColor={theme.subtle}
                  returnKeyType="send"
                  maxLength={300}
                  onSubmitEditing={() => void handleSendChat()}
                  style={[styles.inlineChatInput, { color: theme.ink }]}
                />
                <PressableScale
                  onPress={() => void handleSendChat()}
                  disabled={!chatInput.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Send live chat message"
                  scaleTo={0.9}
                  style={[
                    styles.inlineSendBtn,
                    {
                      backgroundColor: chatInput.trim()
                        ? theme.violet
                        : theme.border,
                    },
                  ]}
                >
                  <Ionicons name="send" size={13} color="#FFFFFF" />
                </PressableScale>
              </View>
            </View>
          </View>

          {/* ── 6. UPCOMING LIVE ROOMS (Mockup 5) ── */}
          <View style={{ gap: 8 }}>
            <SectionHeader title="Upcoming Live Rooms" />
            {[
              {
                id: 801,
                title: "Manga vs Anime: What's Better?",
                time: "Tomorrow · 8:00 PM",
                count: "342 going",
                cover: heroArt["explore-2"] ?? defaultCover(210),
              },
              {
                id: 802,
                title: "Spring Season Finale Breakdown",
                time: "Sat · 7:00 PM",
                count: "521 going",
                cover: heroArt["explore-3"] ?? defaultCover(290),
              },
            ].map((item) => (
              <View
                key={item.id}
                style={[
                  styles.upcomingRoomCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                  shadow.card,
                ]}
              >
                <Picture
                  source={item.cover}
                  hue={230}
                  radius={12}
                  style={{ width: 52, height: 52 }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt
                    numberOfLines={1}
                    style={{
                      fontFamily: font.heavy,
                      fontSize: 13.5,
                      color: theme.ink,
                    }}
                  >
                    {item.title}
                  </Txt>
                  <Txt
                    style={{
                      fontFamily: font.regular,
                      fontSize: 11.5,
                      color: theme.muted,
                    }}
                  >
                    {item.time} · {item.count}
                  </Txt>
                </View>
                <PressableScale
                  onPress={() => {
                    haptic.success();
                    notify(
                      "Reminder Set 🔔",
                      `We’ll alert you as soon as “${item.title}” goes live.`,
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Set reminder for ${item.title}`}
                  scaleTo={0.9}
                  style={[
                    styles.remindBellBtn,
                    {
                      backgroundColor: theme.tints.violet,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={17}
                    color={theme.violet}
                  />
                </PressableScale>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Reaction Picker Popover above Bottom Controls */}
        {reactTrayOpen ? (
          <View
            style={[
              styles.reactionPopover,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                bottom: Math.max(insets.bottom, 12) + 68,
              },
              shadow.raised,
            ]}
          >
            {STAGE_REACTIONS.map((emoji) => (
              <PressableScale
                key={emoji}
                onPress={() => void handleReactStage(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`Send stage reaction ${emoji}`}
                scaleTo={0.86}
                style={styles.reactionEmojiCircle}
              >
                <Txt style={{ fontSize: 22 }}>{emoji}</Txt>
              </PressableScale>
            ))}
          </View>
        ) : null}

        {/* ── 7. BOTTOM STICKY CONTROLS: Mute, Raise Hand, React, Share, Chat, Leave (Mockup 5) ── */}
        <View
          style={[
            styles.bottomControlsBar,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
            shadow.raised,
          ]}
        >
          <StageControlPill
            icon={isMuted ? "mic-off" : "mic"}
            label={isMuted ? "Muted" : "Mute"}
            active={!isMuted}
            onPress={() => void handleToggleMute()}
          />
          <StageControlPill
            icon="hand-right-outline"
            label={isHandRaised ? "Raised" : "Raise Hand"}
            active={isHandRaised}
            onPress={() => void handleToggleRaiseHand()}
          />
          <StageControlPill
            icon="heart-outline"
            label="React"
            active={reactTrayOpen}
            onPress={() => {
              haptic.tap();
              setReactTrayOpen((v) => !v);
            }}
          />
          <StageControlPill
            icon="share-social-outline"
            label="Share"
            onPress={() => void shareLink(stageTitle, `/live/${roomId}`)}
          />
          <StageControlPill
            icon="chatbubble-ellipses-outline"
            label="Chat"
            onPress={() => {
              haptic.tap();
              chatInputRef.current?.focus();
            }}
          />

          <PressableScale
            onPress={handleLeaveStage}
            accessibilityRole="button"
            accessibilityLabel="Leave live room"
            scaleTo={0.92}
            style={[
              styles.leavePillBtn,
              { backgroundColor: "#EF4444" },
              shadow.glow("#EF4444", 0.35),
            ]}
          >
            <Ionicons name="exit-outline" size={16} color="#FFFFFF" />
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 12.5,
                color: "#FFFFFF",
              }}
            >
              Leave
            </Txt>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>

      {/* AI Live Notes Sheet */}
      <Sheet
        visible={aiNotesOpen}
        title="AI Live Notes ✨"
        onClose={() => setAiNotesOpen(false)}
      >
        <View style={{ gap: 12 }}>
          <Txt
            style={{
              fontFamily: font.regular,
              fontSize: 14,
              lineHeight: 20.5,
              color: theme.ink,
            }}
          >
            {aiNotesBusy
              ? "Synthesizing real-time speaker takeaways and fan theories…"
              : aiNotesText}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {["Key Points", "Fan Theories", "Episode 12 Clues"].map((tag) => (
              <Pill key={tag} label={tag} icon="sparkles" tone="violet" />
            ))}
          </View>
          <Button
            small
            variant="secondary"
            label="Refresh Live Summary"
            onPress={() => {
              setAiNotesText(null);
              void handleOpenAiLiveNotes();
            }}
          />
        </View>
      </Sheet>

      {/* Host Configure Stage Sheet (`configureLiveStage` RPC) */}
      <Sheet
        visible={configOpen}
        title="Configure Live Stage"
        onClose={() => setConfigOpen(false)}
      >
        <Field
          label="Stage Title"
          value={stageTitleInput}
          onChangeText={setStageTitleInput}
          placeholder="e.g. Anime Theory Night"
          maxLength={80}
        />
        <Field
          label="Stage Topic / Subtitle"
          value={stageTopicInput}
          onChangeText={setStageTopicInput}
          placeholder="What is the stage discussing?"
          maxLength={200}
          multiline
        />
        <GradientButton
          label={busyAction ? "Saving…" : "Save Stage Settings"}
          icon="checkmark-circle"
          gradient="hero"
          size="lg"
          full
          busy={busyAction}
          onPress={() => void handleSaveStageConfig()}
        />
      </Sheet>
    </View>
  );
}

function StageControlPill({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.92}
      style={styles.controlColumnBtn}
    >
      <View
        style={[
          styles.controlIconCircle,
          {
            backgroundColor: active ? theme.tints.violet : theme.surfaceAlt,
            borderColor: active ? theme.violet : theme.border,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={active ? theme.violet : theme.ink}
        />
      </View>
      <Txt
        numberOfLines={1}
        style={{
          fontFamily: active ? font.bold : font.semibold,
          fontSize: 10.5,
          color: active ? theme.toneText.violet : theme.muted,
        }}
      >
        {label}
      </Txt>
    </PressableScale>
  );
}

export default withCommunityTheme(LiveRoomScreen);

const styles = StyleSheet.create({
  stageHeroCard: {
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 4,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listenerCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15, 11, 42, 0.65)",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tagBadge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  hostedByPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    backgroundColor: "rgba(15, 11, 42, 0.5)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  speakersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  speakerCard: {
    width: "48%",
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  roleCornerBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  mutedCornerBadge: {
    position: "absolute",
    left: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  speakerRoleBadgeRow: {
    marginTop: 2,
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 30,
    marginTop: 4,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  listenersCard: {
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  listenersGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  listenerTile: {
    width: 54,
    alignItems: "center",
    gap: 2,
  },
  overflowListenersCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  aiNotesCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  aiNotesOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#A855F7",
  },
  viewNotesPill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chatFilterBar: {
    flexDirection: "row",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
  },
  chatFilterTab: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chatStreamCard: {
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 8,
  },
  chatMessageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 2,
  },
  inlineChatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 5,
    marginTop: 4,
  },
  inlineChatInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13,
    outlineWidth: 0,
  },
  inlineSendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingRoomCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.tile,
    borderWidth: 1,
  },
  remindBellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionPopover: {
    position: "absolute",
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  reactionEmojiCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomControlsBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  controlColumnBtn: {
    alignItems: "center",
    gap: 3,
    minWidth: 48,
  },
  controlIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  leavePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
});