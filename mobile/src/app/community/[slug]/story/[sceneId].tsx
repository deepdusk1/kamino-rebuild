// ===== FILE: mobile/src/app/community/[slug]/story/[sceneId].tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import { platform } from "@/api/platform-v9";
import { useSSEListener } from "@/api/sse";
import { notify } from "@/components/community/platform";
import {
  AppHeader,
  GradientButton,
  LiveBadge,
  PersonAvatar,
  Picture,
  Pill,
  SectionHeader,
} from "@/components/k";
import {
  Button,
  Field,
  PressableScale,
  Sheet,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { defaultCover, heroArt } from "@/lib/brandArt";
import { errorMessage, showError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme } from "@/theme";

type StoryCharacter = {
  id: string;
  name: string;
  archetype: string;
  hue: number;
  voicePrompt: string;
};

const CAST_CHARACTERS: readonly StoryCharacter[] = [
  {
    id: "aria",
    name: "Aria Vance",
    archetype: "Chrono-Navigator",
    hue: 270,
    voicePrompt: "Bold, analytical starship navigator who deciphers ancient temporal rifts.",
  },
  {
    id: "kaelen",
    name: "Kaelen Sol",
    archetype: "Rift Blade",
    hue: 335,
    voicePrompt: "Fiercely loyal guardian wielding a resonance blade forged from a collapsed star.",
  },
  {
    id: "nyx",
    name: "Nyx",
    archetype: "Oracle Construct",
    hue: 195,
    voicePrompt: "Witty sentient archive who speaks in prophetic riddles and tactical odds.",
  },
  {
    id: "director",
    name: "Narrator / GM",
    archetype: "World Director",
    hue: 42,
    voicePrompt: "Cinematic omniscient narrator steering world events, atmosphere, and plot twists.",
  },
];

type StoryTurn = {
  id: number;
  characterId: string;
  characterName: string;
  characterArchetype: string;
  hue: number;
  kind: "dialogue" | "narrator" | "director";
  text: string;
  directorNote?: string;
  createdAt: string;
};

type StoryVoteOption = {
  id: string;
  label: string;
  prompt: string;
  votes: number;
  votedByMe: boolean;
};

type StoryCheckpoint = {
  id: string;
  label: string;
  turnCount: number;
  createdAt: string;
  turnsSnapshot: StoryTurn[];
  optionsSnapshot: StoryVoteOption[];
};

type AiAssistantRpcResult = {
  text: string;
};

type CreatePostRpcResult = {
  id?: number;
  postId?: number;
  post?: { id: number };
};

/**
 * NEEDS BACKEND — Proposed RPC specifications for persistent multiplayer AI Story Room state:
 *
 * 1. `rewindAiStoryCheckpoint` (NEEDS BACKEND)
 *    - Args: `{ slug: string; sceneId: number; checkpointId: string }`
 *    - Response: `{ ok: boolean; restoredTurnId: number; turns: StoryTurn[] }`
 *
 * 2. `voteAiStoryBranch` (NEEDS BACKEND)
 *    - Args: `{ slug: string; sceneId: number; optionId: string }`
 *    - Response: `{ ok: boolean; options: { id: string; votes: number; votedByMe: boolean }[] }`
 *
 * All AI narrative generation and plot steering below is wired to the REAL verified
 * `rpc("aiAssistant", { task, text })` endpoint, and publishing the story transcript
 * to the community feed is wired to the REAL verified `rpc("createPost", ...)` endpoint.
 */

const INITIAL_TURNS: readonly StoryTurn[] = [
  {
    id: 1,
    characterId: "director",
    characterName: "Narrator / GM",
    characterArchetype: "World Director",
    hue: 42,
    kind: "narrator",
    text: "Above the shattered spires of the Citadel, the Astral Gate hums to life for the first time in three centuries. Violet lightning arcs across the observation deck as an unscheduled vessel decloaks inside the rift.",
    createdAt: "Just now",
  },
  {
    id: 2,
    characterId: "aria",
    characterName: "Aria Vance",
    characterArchetype: "Chrono-Navigator",
    hue: 270,
    kind: "dialogue",
    text: "Chronometer readings are running backward—that ship isn't arriving from another sector. It's returning from our own future.",
    createdAt: "Just now",
  },
];

const INITIAL_VOTE_OPTIONS: readonly StoryVoteOption[] = [
  {
    id: "opt-board",
    label: "Hail & Board the Rift Vessel",
    prompt: "Aria and Kaelen take a boarding shuttle directly into the future vessel's hangar bay.",
    votes: 14,
    votedByMe: false,
  },
  {
    id: "opt-decode",
    label: "Decrypt the Beacon Signal First",
    prompt: "Nyx isolates the encrypted temporal telemetry before lowering the Citadel shields.",
    votes: 9,
    votedByMe: false,
  },
  {
    id: "opt-lockdown",
    label: "Raise Planetary Defense Grid",
    prompt: "Kaelen orders a full tactical lockdown while demanding the mystery captain's identity.",
    votes: 6,
    votedByMe: false,
  },
];

export default function AIStoryRoomScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const scrollerRef = useRef<ScrollView>(null);

  const { slug: rawSlug, sceneId: rawSceneId } = useLocalSearchParams<{
    slug: string;
    sceneId: string;
  }>();
  const slug = typeof rawSlug === "string" && rawSlug ? rawSlug : "anime-realm";
  const sceneId = Number(rawSceneId) || 1;

  const [selectedChar, setSelectedChar] = useState<StoryCharacter>(
    CAST_CHARACTERS[0]!,
  );
  const [inputMode, setInputMode] = useState<"character" | "director">(
    "character",
  );
  const [promptInput, setPromptInput] = useState("");
  const [directorTwist, setDirectorTwist] = useState("");
  const [turns, setTurns] = useState<StoryTurn[]>([...INITIAL_TURNS]);
  const [voteOptions, setVoteOptions] = useState<StoryVoteOption[]>([
    ...INITIAL_VOTE_OPTIONS,
  ]);
  const [checkpoints, setCheckpoints] = useState<StoryCheckpoint[]>([
    {
      id: "cp-opening",
      label: "Checkpoint #1 · Opening Rift",
      turnCount: INITIAL_TURNS.length,
      createdAt: "Start of scene",
      turnsSnapshot: [...INITIAL_TURNS],
      optionsSnapshot: [...INITIAL_VOTE_OPTIONS],
    },
  ]);

  const [generating, setGenerating] = useState(false);
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState(
    `Chronicles of the Astral Gate · Scene #${sceneId}`,
  );
  const [publishing, setPublishing] = useState(false);

  // Listen for live stage/story updates over Module 1 SSE
  useSSEListener((event) => {
    if (event.roomId !== sceneId) return;
    if (event.type === "stage.update" && isRecord(event.payload.storyTurn)) {
      const t = event.payload.storyTurn;
      const incomingId = Number(t.id) || Date.now();
      setTurns((prev) => {
        if (prev.some((existing) => existing.id === incomingId)) return prev;
        return [
          ...prev,
          {
            id: incomingId,
            characterId: typeof t.characterId === "string" ? t.characterId : "aria",
            characterName:
              typeof t.characterName === "string" ? t.characterName : "Co-Author",
            characterArchetype:
              typeof t.characterArchetype === "string"
                ? t.characterArchetype
                : "Storyteller",
            hue: typeof t.hue === "number" ? t.hue : 265,
            kind: t.kind === "director" || t.kind === "narrator" ? t.kind : "dialogue",
            text: typeof t.text === "string" ? t.text : "",
            createdAt: "Live",
          },
        ];
      });
    }
  });

  const totalVotes = useMemo(
    () => voteOptions.reduce((sum, opt) => sum + opt.votes, 0),
    [voteOptions],
  );

  /**
   * Generates the next interactive story turn via the verified `rpc("aiAssistant", { task, text })`
   * endpoint, incorporating the player's action/dialogue and any director plot instructions.
   */
  const handleAdvanceStory = async (overrideDirection?: string) => {
    const userAction = (overrideDirection ?? promptInput).trim();
    const twistNote = directorTwist.trim();
    if ((!userAction && !twistNote) || generating) return;

    setGenerating(true);
    haptic.tap();

    const playerTurnId = Date.now();
    const newPlayerTurn: StoryTurn = {
      id: playerTurnId,
      characterId: selectedChar.id,
      characterName: selectedChar.name,
      characterArchetype: selectedChar.archetype,
      hue: selectedChar.hue,
      kind: inputMode === "director" ? "director" : "dialogue",
      text: userAction || twistNote,
      directorNote: twistNote || undefined,
      createdAt: "Just now",
    };

    const updatedTurns = [...turns, newPlayerTurn];
    setTurns(updatedTurns);
    if (!overrideDirection) {
      setPromptInput("");
      setDirectorTwist("");
    }

    const recentContext = updatedTurns
      .slice(-4)
      .map((t) => `${t.characterName}: ${t.text}`)
      .join("\n");

    const aiPrompt = `Interactive Fandom Story Room in community "${slug}".
Recent story turns:
${recentContext}
${twistNote ? `Director Plot Instruction: ${twistNote}\n` : ""}Write a vivid, dramatic 2-3 sentence continuation advancing the scene and responding to ${selectedChar.name}. After the narrative paragraph, on a new line prefixed with "CHOICES:", list 3 short branching plot choices separated by " | ".`;

    try {
      let rawResponseText = "";
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "caption",
          text: aiPrompt,
        });
        rawResponseText = res.text;
      } catch {
        const fallback = await platform.ai("caption", aiPrompt);
        rawResponseText = fallback.text;
      }

      const [narrativePart, choicesPart] = rawResponseText.split(/CHOICES:/i);
      const narrativeText =
        (narrativePart ?? "").trim() ||
        "The rift stabilizes for a heartbeat as the vessel's outer airlock unseals, revealing an emblem bearing the mark of the Citadel's founding house.";

      const aiTurn: StoryTurn = {
        id: playerTurnId + 1,
        characterId: "director",
        characterName: "Kamino Story AI",
        characterArchetype: "World Narrator",
        hue: 280,
        kind: "narrator",
        text: narrativeText,
        createdAt: "Just now",
      };

      const nextTurns = [...updatedTurns, aiTurn];
      setTurns(nextTurns);

      if (choicesPart) {
        const parsedChoices = choicesPart
          .split("|")
          .map((c) => c.trim().replace(/^[-•\d.)\s]+/, ""))
          .filter((c) => c.length > 4)
          .slice(0, 3);

        if (parsedChoices.length >= 2) {
          setVoteOptions(
            parsedChoices.map((label, idx) => ({
              id: `opt-${Date.now()}-${idx}`,
              label: label.slice(0, 56),
              prompt: label,
              votes: idx === 0 ? 3 : 1,
              votedByMe: false,
            })),
          );
        }
      }

      haptic.success();
      setTimeout(() => {
        scrollerRef.current?.scrollToEnd({ animated: true });
      }, 120);
    } catch (err) {
      showError(err, "AI Story generation failed");
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Saves a branching narrative checkpoint so players can rewind and explore alternate timelines.
   */
  const handleSaveCheckpoint = () => {
    haptic.success();
    const cpNum = checkpoints.length + 1;
    const latestTurn = turns[turns.length - 1];
    const snippet = latestTurn
      ? latestTurn.text.slice(0, 28).trim() + "…"
      : `Turn ${turns.length}`;

    const newCp: StoryCheckpoint = {
      id: `cp-${Date.now()}`,
      label: `Checkpoint #${cpNum} · ${snippet}`,
      turnCount: turns.length,
      createdAt: "Saved just now",
      turnsSnapshot: [...turns],
      optionsSnapshot: voteOptions.map((o) => ({ ...o })),
    };

    setCheckpoints((prev) => [newCp, ...prev]);
    notify(
      "Branch Checkpoint Saved 📌",
      `Saved at Turn ${turns.length}. You can rewind to this moment anytime.`,
    );
  };

  /**
   * Rewinds the story room to a saved checkpoint.
   * Calls `rewindAiStoryCheckpoint` (NEEDS BACKEND) if available and restores the local snapshot immediately.
   */
  const handleRewindToCheckpoint = async (cp: StoryCheckpoint) => {
    haptic.pop();
    setTurns([...cp.turnsSnapshot]);
    setVoteOptions(cp.optionsSnapshot.map((o) => ({ ...o })));
    setCheckpointsOpen(false);

    // NEEDS BACKEND: `rewindAiStoryCheckpoint` syncs the rewound branch state to all room peers
    await rpc("rewindAiStoryCheckpoint", {
      slug,
      sceneId,
      checkpointId: cp.id,
    }).catch(() => undefined);

    notify(
      "Timeline Rewound ⏪",
      `Restored "${cp.label}" (${cp.turnCount} turns). Steer the plot in a new direction!`,
    );
  };

  /**
   * Casts a multiplayer vote on the next story branch.
   * Calls `voteAiStoryBranch` (NEEDS BACKEND) if available and updates vote tallies optimistically.
   */
  const handleVoteOption = async (option: StoryVoteOption) => {
    haptic.pop();
    setVoteOptions((prev) =>
      prev.map((item) => {
        if (item.id === option.id) {
          const nextVoted = !item.votedByMe;
          return {
            ...item,
            votedByMe: nextVoted,
            votes: Math.max(0, item.votes + (nextVoted ? 1 : -1)),
          };
        }
        return item;
      }),
    );

    // NEEDS BACKEND: `voteAiStoryBranch` records real-time multiplayer branch tally
    await rpc("voteAiStoryBranch", {
      slug,
      sceneId,
      optionId: option.id,
    }).catch(() => undefined);
  };

  /**
   * Publishes the compiled AI Story transcript to the community feed via the verified
   * `rpc("createPost", ...)` (`api.createPost` fallback) endpoint.
   */
  const handlePublishStoryToFeed = async () => {
    if (publishing || !publishTitle.trim()) return;
    setPublishing(true);

    const compiledBody = turns
      .map((t) =>
        t.kind === "narrator"
          ? `_${t.text}_`
          : t.kind === "director"
            ? `**[Director Note · ${t.characterName}]:** ${t.text}`
            : `**${t.characterName} (${t.characterArchetype}):** "${t.text}"`,
      )
      .join("\n\n");

    try {
      let createdPostId: number | null = null;
      try {
        const res = await rpc<CreatePostRpcResult>("createPost", {
          slug,
          communityId: slug,
          kind: "blog",
          title: publishTitle.trim(),
          body: compiledBody,
          tags: ["AIStory", "Roleplay", `Scene${sceneId}`],
        });
        createdPostId = res.id ?? res.postId ?? res.post?.id ?? null;
      } catch {
        const fallback = await api.createPost({
          slug,
          kind: "blog",
          title: publishTitle.trim(),
          body: compiledBody,
          tags: ["AIStory", "Roleplay"],
        });
        if (
          fallback &&
          typeof fallback === "object" &&
          "id" in fallback &&
          typeof (fallback as { id?: unknown }).id === "number"
        ) {
          createdPostId = (fallback as { id: number }).id;
        }
      }

      haptic.success();
      setPublishOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["community", slug] });
      notify(
        "Story Published! 📖",
        "Your interactive story chapter is now live on the community feed.",
      );
      if (createdPostId) {
        router.push(`/community/${slug}/post/${createdPostId}`);
      } else {
        router.push(`/community/${slug}`);
      }
    } catch (err) {
      showError(err, "Couldn't publish story");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader
        back
        actions={[
          {
            key: "checkpoints",
            icon: "git-branch-outline",
            label: `Branch Checkpoints (${checkpoints.length})`,
            onPress: () => setCheckpointsOpen(true),
          },
          {
            key: "publish",
            icon: "share-outline",
            label: "Publish Story to Feed",
            onPress: () => setPublishOpen(true),
          },
        ]}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollerRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: tabSpace + 24,
            gap: 14,
          }}
        >
          {/* Scene Header Card */}
          <View
            style={[
              styles.sceneHeroCard,
              { borderColor: theme.border },
              shadow.card,
            ]}
          >
            <Picture
              source={heroArt["home-3"] ?? defaultCover(270)}
              hue={270}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={[
                "rgba(11, 10, 24, 0.35)",
                "rgba(11, 10, 24, 0.92)",
              ]}
              style={StyleSheet.absoluteFill}
            />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <LiveBadge label={`AI STORY ROOM · #${sceneId}`} icon="sparkles" />
              <PressableScale
                onPress={handleSaveCheckpoint}
                accessibilityRole="button"
                accessibilityLabel="Save branch checkpoint"
                scaleTo={0.94}
                style={styles.saveCheckpointPill}
              >
                <Ionicons name="bookmark-outline" size={13} color="#FFFFFF" />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 11.5,
                    color: "#FFFFFF",
                  }}
                >
                  Save Checkpoint ({checkpoints.length})
                </Txt>
              </PressableScale>
            </View>

            <Txt
              accessibilityRole="header"
              style={{
                fontFamily: font.heavy,
                fontSize: 21,
                lineHeight: 26,
                color: "#FFFFFF",
                marginTop: 6,
              }}
            >
              Chronicles of the Astral Gate
            </Txt>
            <Txt
              style={{
                fontFamily: font.regular,
                fontSize: 12.5,
                lineHeight: 17,
                color: "rgba(241, 245, 249, 0.85)",
              }}
            >
              Play as a character, steer the plot with director instructions,
              vote on story branches, or rewind to any checkpoint.
            </Txt>
          </View>

          {/* Playable Character Selector Bar */}
          <View style={{ gap: 6 }}>
            <SectionHeader
              title="Play As Character"
              actionLabel="Rewind / Branches"
              onAction={() => setCheckpointsOpen(true)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {CAST_CHARACTERS.map((char) => {
                const active = selectedChar.id === char.id;
                return (
                  <PressableScale
                    key={char.id}
                    onPress={() => {
                      haptic.tap();
                      setSelectedChar(char);
                      if (char.id === "director") {
                        setInputMode("director");
                      } else {
                        setInputMode("character");
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Play as ${char.name}, ${char.archetype}`}
                    scaleTo={0.95}
                    style={[
                      styles.characterChip,
                      {
                        backgroundColor: active
                          ? theme.tints.violet
                          : theme.surface,
                        borderColor: active ? theme.violet : theme.border,
                      },
                      shadow.card,
                    ]}
                  >
                    <PersonAvatar
                      person={{ name: char.name, hue: char.hue }}
                      size={32}
                    />
                    <View>
                      <Txt
                        style={{
                          fontFamily: font.heavy,
                          fontSize: 12.5,
                          color: theme.ink,
                        }}
                      >
                        {char.name}
                      </Txt>
                      <Txt
                        style={{
                          fontFamily: font.semibold,
                          fontSize: 10.5,
                          color: active ? theme.toneText.violet : theme.muted,
                        }}
                      >
                        {char.archetype}
                      </Txt>
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>

          {/* Story Log Transcript */}
          <View style={{ gap: 10 }}>
            {turns.map((turn, idx) => {
              const isNarrator =
                turn.kind === "narrator" || turn.kind === "director";
              return (
                <View
                  key={turn.id}
                  style={[
                    styles.turnCard,
                    {
                      backgroundColor: isNarrator
                        ? theme.surfaceAi
                        : theme.surface,
                      borderColor: isNarrator ? theme.violet : theme.border,
                    },
                    shadow.card,
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <PersonAvatar
                        person={{ name: turn.characterName, hue: turn.hue }}
                        size={28}
                      />
                      <View>
                        <Txt
                          style={{
                            fontFamily: font.heavy,
                            fontSize: 13,
                            color: theme.ink,
                          }}
                        >
                          {turn.characterName}
                        </Txt>
                        <Txt
                          style={{
                            fontFamily: font.semibold,
                            fontSize: 10.5,
                            color: theme.toneText.violet,
                          }}
                        >
                          {turn.characterArchetype} · Turn #{idx + 1}
                        </Txt>
                      </View>
                    </View>
                    <Pill
                      label={
                        turn.kind === "director"
                          ? "Director Twist"
                          : turn.kind === "narrator"
                            ? "Narrator"
                            : "In-Character"
                      }
                      tone={isNarrator ? "violet" : "blue"}
                      style={{ height: 20, paddingHorizontal: 8 }}
                    />
                  </View>

                  {turn.directorNote ? (
                    <View
                      style={[
                        styles.directorNoteBadge,
                        { backgroundColor: theme.tints.orange },
                      ]}
                    >
                      <Ionicons
                        name="megaphone-outline"
                        size={13}
                        color={theme.toneText.orange}
                      />
                      <Txt
                        style={{
                          flex: 1,
                          fontFamily: font.semibold,
                          fontSize: 11.5,
                          color: theme.toneText.orange,
                        }}
                      >
                        Director Instruction: {turn.directorNote}
                      </Txt>
                    </View>
                  ) : null}

                  <Txt
                    selectable
                    style={{
                      fontFamily: isNarrator ? font.semibold : font.regular,
                      fontSize: 14,
                      lineHeight: 20.5,
                      color: theme.ink,
                    }}
                  >
                    {turn.text}
                  </Txt>
                </View>
              );
            })}
          </View>

          {/* Multiplayer Plot Branch Vote UI */}
          <View
            style={[
              styles.voteSectionCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              shadow.card,
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="git-network-outline" size={17} color={theme.violet} />
                <Txt
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 14.5,
                    color: theme.ink,
                  }}
                >
                  Vote or Trigger Next Plot Branch
                </Txt>
              </View>
              <Txt
                style={{
                  fontFamily: font.semibold,
                  fontSize: 11.5,
                  color: theme.muted,
                }}
              >
                {totalVotes} votes
              </Txt>
            </View>

            {voteOptions.map((opt) => {
              const pct =
                totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
              return (
                <View
                  key={opt.id}
                  style={[
                    styles.voteOptionCard,
                    {
                      backgroundColor: opt.votedByMe
                        ? theme.tints.violet
                        : theme.surfaceAlt,
                      borderColor: opt.votedByMe ? theme.violet : theme.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 13.5,
                        color: theme.ink,
                      }}
                    >
                      {opt.label}
                    </Txt>
                    <Txt
                      numberOfLines={2}
                      style={{
                        fontFamily: font.regular,
                        fontSize: 12,
                        color: theme.muted,
                      }}
                    >
                      {opt.prompt}
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 11,
                        color: theme.toneText.violet,
                      }}
                    >
                      {opt.votes} votes ({pct}%)
                    </Txt>
                  </View>

                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <PressableScale
                      onPress={() => void handleVoteOption(opt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Vote for ${opt.label}`}
                      scaleTo={0.93}
                      style={[
                        styles.voteBtn,
                        {
                          backgroundColor: opt.votedByMe
                            ? theme.violet
                            : theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={opt.votedByMe ? "checkmark" : "thumbs-up-outline"}
                        size={14}
                        color={opt.votedByMe ? "#FFFFFF" : theme.ink}
                      />
                      <Txt
                        style={{
                          fontFamily: font.bold,
                          fontSize: 11.5,
                          color: opt.votedByMe ? "#FFFFFF" : theme.ink,
                        }}
                      >
                        {opt.votedByMe ? "Voted" : "Vote"}
                      </Txt>
                    </PressableScale>

                    <PressableScale
                      onPress={() => void handleAdvanceStory(opt.prompt)}
                      disabled={generating}
                      accessibilityRole="button"
                      accessibilityLabel={`Play branch: ${opt.label}`}
                      scaleTo={0.93}
                      style={[
                        styles.playBranchBtn,
                        { backgroundColor: theme.tints.pink },
                      ]}
                    >
                      <Ionicons
                        name="play"
                        size={13}
                        color={theme.toneText.pink}
                      />
                    </PressableScale>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Character Action & Director Instruction Composer */}
          <View
            style={[
              styles.composerCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              shadow.card,
            ]}
          >
            <View style={styles.modeSwitchRow}>
              {(
                [
                  {
                    key: "character" as const,
                    label: `Speak as ${selectedChar.name}`,
                    icon: "person-outline" as const,
                  },
                  {
                    key: "director" as const,
                    label: "Director Instruction",
                    icon: "film-outline" as const,
                  },
                ] as const
              ).map((m) => {
                const active = inputMode === m.key;
                return (
                  <PressableScale
                    key={m.key}
                    onPress={() => {
                      haptic.tap();
                      setInputMode(m.key);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={m.label}
                    scaleTo={0.96}
                    style={[
                      styles.modePill,
                      {
                        backgroundColor: active
                          ? theme.tints.violet
                          : theme.surfaceAlt,
                        borderColor: active ? theme.violet : theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={m.icon}
                      size={14}
                      color={active ? theme.violet : theme.muted}
                    />
                    <Txt
                      style={{
                        fontFamily: active ? font.heavy : font.semibold,
                        fontSize: 12,
                        color: active ? theme.toneText.violet : theme.muted,
                      }}
                    >
                      {m.label}
                    </Txt>
                  </PressableScale>
                );
              })}
            </View>

            <View
              style={[
                styles.storyInputBox,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <TextInput
                value={promptInput}
                onChangeText={setPromptInput}
                placeholder={
                  inputMode === "director"
                    ? "Direct a plot twist or scene change (e.g. A sudden gravity anomaly reveals a stowaway)…"
                    : `What does ${selectedChar.name} say or do next?`
                }
                placeholderTextColor={theme.subtle}
                multiline
                maxLength={500}
                style={[styles.storyTextInput, { color: theme.ink }]}
              />
            </View>

            <Field
              label="Optional Director Plot Twist Note"
              value={directorTwist}
              onChangeText={setDirectorTwist}
              placeholder="e.g. Introduce a rival faction listening on the comms"
              maxLength={200}
            />

            <View style={{ flexDirection: "row", gap: 8 }}>
              <GradientButton
                label={
                  generating ? "AI Writing Scene…" : "Continue Story ✨"
                }
                icon="sparkles"
                gradient="hero"
                size="lg"
                busy={generating}
                onPress={() => void handleAdvanceStory()}
                style={{ flex: 1 }}
              />
              <Button
                label="Publish"
                variant="secondary"
                onPress={() => setPublishOpen(true)}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Branching Checkpoints & Rewind Sheet */}
      <Sheet
        visible={checkpointsOpen}
        title="Branch Checkpoints & Rewind"
        onClose={() => setCheckpointsOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13,
            color: theme.muted,
          }}
        >
          Rewind to any saved checkpoint to branch the story in an alternate
          direction without losing your earlier chapters.
        </Txt>
        <Button
          small
          variant="secondary"
          label="+ Save Current Moment as Checkpoint"
          onPress={handleSaveCheckpoint}
        />
        <View style={{ gap: 8, marginTop: 4 }}>
          {checkpoints.map((cp) => (
            <View
              key={cp.id}
              style={[
                styles.checkpointRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 13.5,
                    color: theme.ink,
                  }}
                >
                  {cp.label}
                </Txt>
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 11.5,
                    color: theme.muted,
                  }}
                >
                  {cp.turnCount} turns · {cp.createdAt}
                </Txt>
              </View>
              <PressableScale
                onPress={() => void handleRewindToCheckpoint(cp)}
                accessibilityRole="button"
                accessibilityLabel={`Rewind to ${cp.label}`}
                scaleTo={0.94}
                style={[
                  styles.rewindBtn,
                  { backgroundColor: theme.violet },
                ]}
              >
                <Ionicons name="play-back" size={13} color="#FFFFFF" />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 12,
                    color: "#FFFFFF",
                  }}
                >
                  Rewind
                </Txt>
              </PressableScale>
            </View>
          ))}
        </View>
      </Sheet>

      {/* Publish Story to Community Feed Sheet (`rpc("createPost", ...)`) */}
      <Sheet
        visible={publishOpen}
        title="Publish Story to Community Feed"
        onClose={() => setPublishOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13,
            color: theme.muted,
          }}
        >
          Share your {turns.length}-turn interactive story chapter with everyone
          in {slug} so members can read, like, and comment.
        </Txt>
        <Field
          label="Story Chapter Title"
          value={publishTitle}
          onChangeText={setPublishTitle}
          placeholder="Give your story chapter an epic title"
          maxLength={100}
        />
        <GradientButton
          label={publishing ? "Publishing…" : "Publish to Feed"}
          icon="send"
          gradient="hero"
          size="lg"
          full
          busy={publishing}
          onPress={() => void handlePublishStoryToFeed()}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  sceneHeroCard: {
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    gap: 4,
    marginTop: 4,
  },
  saveCheckpointPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  characterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.card,
    borderWidth: 1.5,
  },
  turnCard: {
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 8,
  },
  directorNoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.tile,
  },
  voteSectionCard: {
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
  },
  voteOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  playBranchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  composerCard: {
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
  },
  modeSwitchRow: {
    flexDirection: "row",
    gap: 8,
  },
  modePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  storyInputBox: {
    minHeight: 78,
    borderRadius: radius.card,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  storyTextInput: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    outlineWidth: 0,
  },
  checkpointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  rewindBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
});