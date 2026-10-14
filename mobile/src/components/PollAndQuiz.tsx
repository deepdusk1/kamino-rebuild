import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { authHeaders, postImageUrl } from "@/api/client";
import { api } from "@/api/endpoints";
import type { PostPage } from "@/api/models";
import { useAction } from "@/lib/errors";
import { QUIZ_IMAGE_BASE, formatClock, remainingMs, usedSoFarMs } from "@/lib/quiz";
import { GradientButton, Pill } from "@/components/k";
import { font, radius, shadow, space, useTheme } from "@/theme";
import { PressableScale, Txt } from "./ui";

/** The white rounded box polls and quizzes sit in (matches the post page cards). */
function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 10 }, shadow.card, style]}>{children}</View>;
}

/** Vote on a poll; results (bars) appear after voting. */
export function PollView({ postId, poll, canVote }: { postId: number; poll: NonNullable<PostPage["poll"]>; canVote: boolean }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const total = poll.counts.reduce((a, b) => a + b, 0);
  const voted = poll.mine !== null;
  const [vote, busy] = useAction(async (index: number) => {
    await api.vote(postId, index);
    await queryClient.invalidateQueries({ queryKey: ["post", postId] });
  });

  return (
    <Panel>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pill label="Poll" icon="stats-chart" tone="blue" />
        <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, color: theme.muted }}>{voted ? "Results" : canVote ? "Tap an answer to vote" : "Join to vote"}</Txt>
      </View>
      {poll.options.map((option, i) => {
        const share = total ? Math.round((100 * (poll.counts[i] ?? 0)) / total) : 0;
        return (
          <Pressable
            key={i}
            disabled={voted || !canVote || busy}
            onPress={() => void vote(i)}
            accessibilityRole="button"
            accessibilityLabel={voted ? `${option}: ${share} percent` : `Vote for ${option}`}
            style={{ borderRadius: radius.pill, borderWidth: 1.5, borderColor: poll.mine === i ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt, overflow: "hidden", paddingHorizontal: 16, minHeight: 44, justifyContent: "center" }}
          >
            {voted ? <PollBar share={share} mine={poll.mine === i} /> : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt style={{ flex: 1, fontFamily: poll.mine === i ? font.bold : font.semibold, fontSize: 14, color: theme.ink }}>{option}{poll.mine === i ? "  ✓" : ""}</Txt>
              {voted ? <Txt style={{ fontFamily: font.heavy, fontSize: 14, color: theme.toneText.violet }}>{share}%</Txt> : null}
            </View>
          </Pressable>
        );
      })}
      <Txt variant="caption" tone="subtle">{total} {total === 1 ? "vote" : "votes"}{!canVote ? " · join to vote" : ""}</Txt>
    </Panel>
  );
}

/**
 * Answer a quiz one question at a time. The server keeps the clock (it starts when you press Start) and scores the
 * answers; correct answers are never sent to the phone. Quizzes can have a time limit and a picture per question.
 */
export function QuizView({ postId, questions, timeLimitSec, quizRun, myQuiz, board, canPlay }: {
  postId: number;
  questions: { q: string; choices: string[]; hasImage?: boolean }[];
  /** 0 means no time limit. */
  timeLimitSec: number;
  quizRun: PostPage["quizRun"];
  myQuiz: PostPage["myQuiz"];
  board: PostPage["quizBoard"];
  canPlay: boolean;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  // What the server had already counted when this phone joined the run, and when that was.
  const clockRef = useRef<{ usedMs: number; seenAt: number } | null>(null);
  const answersRef = useRef<number[]>([]);
  const finishing = useRef(false);
  const autoSent = useRef(false);

  const [submit, busy] = useAction(async (all: number[]) => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const result = await api.submitQuiz(postId, all);
      setTimedOut(result.timedOut);
      setStarted(false);
      await queryClient.invalidateQueries({ queryKey: ["post", postId] });
    } finally {
      finishing.current = false;
    }
  });

  // The countdown below runs on a timer, so it reads the latest answers and hand-in function through refs.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
    answersRef.current = answers;
  });

  const [begin, starting] = useAction(async () => {
    const run = await api.startQuiz(postId);
    clockRef.current = { usedMs: usedSoFarMs(run.startedAt, run.serverNow), seenAt: Date.now() };
    setRemaining(timeLimitSec > 0 ? remainingMs(timeLimitSec, clockRef.current.usedMs, 0) : null);
    setTimedOut(false);
    autoSent.current = false;
    setAnswers([]);
    setIndex(0);
    setStarted(true);
  });

  // The countdown. When it reaches zero, the answers so far are handed in.
  useEffect(() => {
    if (!started || timeLimitSec <= 0) return;
    const timer = setInterval(() => {
      const clock = clockRef.current;
      if (!clock) return;
      const left = remainingMs(timeLimitSec, clock.usedMs, Date.now() - clock.seenAt);
      setRemaining(left);
      // Only one automatic hand-in: if the network is down, the person sees one message, not one every quarter second.
      if (left <= 0 && !autoSent.current) {
        autoSent.current = true;
        void submitRef.current(answersRef.current);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [started, timeLimitSec]);

  const choose = (choice: number) => {
    const next = [...answers, choice];
    if (index + 1 < questions.length) {
      setAnswers(next);
      setIndex(index + 1);
    } else {
      setAnswers(next);
      void submit(next);
    }
  };

  if (started) {
    const question = questions[index]!;
    return (
      <Panel>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pill label={`Question ${index + 1} of ${questions.length}`} icon="help-circle" tone="orange" />
          {remaining !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLabel={`${formatClock(remaining)} left`} accessibilityRole="timer">
              <Ionicons name="timer-outline" size={16} color={remaining < 10_000 ? theme.danger : theme.muted} />
              <Txt style={{ color: remaining < 10_000 ? theme.danger : theme.muted, fontVariant: ["tabular-nums"] }}>{formatClock(remaining)}</Txt>
            </View>
          ) : null}
        </View>
        <Txt style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 23, color: theme.ink }}>{question.q}</Txt>
        {question.hasImage ? (
          <Image
            key={index}
            source={{ uri: postImageUrl(postId, QUIZ_IMAGE_BASE + index), headers: authHeaders() }}
            style={{ height: 200, borderRadius: radius.tile, backgroundColor: theme.surfaceAlt }}
            contentFit="contain"
            accessibilityLabel={`Picture for question ${index + 1}`}
          />
        ) : null}
        {question.choices.map((choice, i) => (
          <PressableScale
            key={i}
            disabled={busy}
            onPress={() => choose(i)}
            accessibilityRole="button"
            accessibilityLabel={choice}
            scaleTo={0.98}
            style={{ minHeight: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.surfaceAlt, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, opacity: busy ? 0.6 : 1 }}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.tints.violet, alignItems: "center", justifyContent: "center" }}>
              <Txt style={{ fontFamily: font.heavy, fontSize: 12, color: theme.toneText.violet }}>{String.fromCharCode(65 + i)}</Txt>
            </View>
            <Txt style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: theme.ink }}>{choice}</Txt>
          </PressableScale>
        ))}
      </Panel>
    );
  }

  return (
    <Panel>
      <Pill label="Quiz" icon="help-circle" tone="orange" />
      {myQuiz ? (
        <>
          <Txt style={{ fontFamily: font.heavy, fontSize: 18, lineHeight: 24, color: theme.ink }}>You scored {myQuiz.score} / {myQuiz.total} 🎉</Txt>
          {timedOut ? <Txt tone="muted">Time ran out before your answers arrived, so this try scored 0.</Txt> : null}
        </>
      ) : (
        <>
          <Txt style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 23, color: theme.ink }}>{questions.length} {questions.length === 1 ? "question" : "questions"}</Txt>
          <Txt tone="muted">
            {timeLimitSec > 0
              ? `Timed: ${formatClock(timeLimitSec * 1000)} for the whole quiz. The clock starts when you press Start. You can play once.`
              : "Answer as fast as you can. You can play once."}
          </Txt>
          {quizRun ? <Txt variant="caption" tone="subtle">You started this quiz earlier. The clock has kept running.</Txt> : null}
          <GradientButton label={quizRun ? "Continue quiz" : "Start quiz"} iconRight="arrow-forward" disabled={!canPlay} busy={starting} onPress={() => void begin()} full />
          {!canPlay ? <Txt variant="caption" tone="subtle">Join the community to play.</Txt> : null}
        </>
      )}
      {board.length ? (
        <View style={{ gap: 6, paddingTop: space.sm }}>
          <Txt style={{ fontFamily: font.heavy, fontSize: 14, color: theme.ink }}>🏆 Leaderboard</Txt>
          {board.slice(0, 10).map((row, i) => (
            <View key={i} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <Txt style={{ width: 24, fontFamily: font.heavy, color: i < 3 ? theme.toneText.orange : theme.subtle }}>{i + 1}</Txt>
              <Txt style={{ flex: 1, fontFamily: font.semibold, color: theme.ink }}>{row.nickname}</Txt>
              <Txt tone="muted">{row.score}/{row.total} · {(row.timeMs / 1000).toFixed(1)}s</Txt>
            </View>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

/** The result bar grows to its share when results appear; your choice glows in the brand gradient. */
function PollBar({ share, mine }: { share: number; mine: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(reduceMotion ? share : 0);
  useEffect(() => {
    width.set(reduceMotion ? share : withTiming(share, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [share, reduceMotion, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" }, style]}>
      {mine ? (
        <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, opacity: theme.dark ? 0.45 : 0.25 }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: theme.tint }} />
      )}
    </Animated.View>
  );
}
