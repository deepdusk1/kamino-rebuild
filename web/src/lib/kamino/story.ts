/**
 * AI story branch voting and checkpoint rewinds for role-play stories (`roleplay_scenes` / `roleplay_turns`).
 *
 * - `getAiStoryBranches`: the current round's "what happens next" options, with vote counts.
 * - `proposeAiStoryBranches`: asks the AI storyteller for options (once per round).
 * - `voteAiStoryBranch`: one vote per member per round; voting again for the same option removes it.
 * - `applyAiStoryBranch`: the storyteller continues the story in the direction with the most votes.
 * - `rewindAiStoryCheckpoint`: the story's creator or a moderator rewinds to an earlier turn.
 *
 * A round is the latest visible turn: any new turn (a member's turn, narration, an ending or a rewind) starts a new
 * round, so old options and votes stop being current. The database steps are in story.server.ts (tested there);
 * this file does the permission checks. Reachable from the phone over `/api/v1/rpc/<name>` (see `mobile-api.ts`).
 * Tables: migrations/0050_story_branches.sql.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireSceneManager, storyHelpers } from "./ai-features";
import { AiUnavailableError, chatComplete } from "./ai.server";
import { guard } from "./guard";
import { branchPrompt, parseBranches } from "./roleplay";
import { scanText } from "./safety";
import { internals } from "./server";
import { castVote, currentRound, readBranches, rewindTo, roundHasOptions, saveBranchOptions, winningOption } from "./story.server";

type Authed = { userId: string };
type Scene = Awaited<ReturnType<ReturnType<typeof storyHelpers>["loadScene"]>>;

export type StoryBranches = {
  /** The turn these options follow (0 before the story has any turns). */
  round: number;
  options: { id: number; label: string; votes: number; votedByMe: boolean }[];
  /** The option the viewer voted for this round, or null. */
  myVote: number | null;
  /** The viewer may ask the storyteller for options and continue with the winner (in the cast, or the creator). */
  canSteer: boolean;
  /** The viewer may vote (an active member, and the story is open). */
  canVote: boolean;
};

const sceneInput = z.object({ sceneId: z.number().int().positive() });

function inCastOrCreator(scene: Scene, userId: string) {
  return scene.row.creator_id === userId || scene.cast.some((c) => c.user_id === userId);
}

function isOpen(scene: Scene) {
  return scene.row.status === "open" && !scene.row.held;
}

async function branchesFor(sql: Sql, scene: Scene, userId: string, canVote: boolean): Promise<StoryBranches> {
  const round = await currentRound(sql, scene.row.id);
  const options = await readBranches(sql, scene.row.id, round, userId);
  return {
    round,
    options,
    myVote: options.find((o) => o.votedByMe)?.id ?? null,
    canSteer: canVote && inCastOrCreator(scene, userId),
    canVote,
  };
}

/** The current round's options and vote counts. Anyone who can read the story can see them. */
export const getAiStoryBranches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number }) => sceneInput.parse(d))
  .handler(async ({ context, data }): Promise<StoryBranches> => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const { loadScene, requireSceneRead } = storyHelpers();
    const scene = await loadScene(sql, data.sceneId);
    const m = await requireSceneRead(sql, userId, scene.row.community_id);
    return branchesFor(sql, scene, userId, m?.status === "active" && isOpen(scene));
  });

/**
 * Asks the AI storyteller for "what happens next" options for the current round. Runs at most once per round:
 * if options already exist they are returned as they are, so two players tapping at once cost one AI reply.
 */
export const proposeAiStoryBranches = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number }) => sceneInput.parse(d))
  .handler(async ({ context, data }): Promise<StoryBranches> => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const { loadScene, requireScenePlay, turnsForPrompt } = storyHelpers();
    const scene = await loadScene(sql, data.sceneId);
    await requireScenePlay(sql, userId, scene.row.community_id);
    if (!isOpen(scene)) throw new Error("This story has ended.");
    if (!inCastOrCreator(scene, userId)) throw new Error("Pick a character to play first.");
    const round = await currentRound(sql, scene.row.id);
    if (!(await roundHasOptions(sql, scene.row.id, round))) {
      await guard(userId, "ai");
      const turns = await turnsForPrompt(sql, scene.row.id);
      const cast = scene.cast.map((c) => ({ name: c.character_name, player: c.user_id }));
      const header = { title: scene.row.title, source: scene.row.source, premise: scene.row.premise, characters: scene.characters };
      let reply: string;
      try {
        reply = await chatComplete(sql, branchPrompt(header, cast, turns), { maxTokens: 220 });
      } catch (error) {
        if (error instanceof AiUnavailableError) throw new Error(error.message);
        throw new Error("The AI storyteller could not suggest options. Try again in a moment.");
      }
      // Options go through the same text check as members' writing; any that fail are left out.
      const labels = parseBranches(reply).filter((label) => !scanText(label));
      if (labels.length < 2) throw new Error("The AI storyteller could not suggest options. Try again in a moment.");
      await saveBranchOptions(sql, scene.row.id, round, labels);
    }
    return branchesFor(sql, scene, userId, true);
  });

/** Votes for an option in the current round (moving an earlier vote), or removes the vote if it is already there. */
export const voteAiStoryBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number; optionId: number }) => sceneInput.extend({ optionId: z.number().int().positive() }).parse(d))
  .handler(async ({ context, data }): Promise<StoryBranches> => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const { loadScene, requireScenePlay } = storyHelpers();
    const scene = await loadScene(sql, data.sceneId);
    await requireScenePlay(sql, userId, scene.row.community_id);
    if (!isOpen(scene)) throw new Error("This story has ended.");
    await castVote(sql, scene.row.id, userId, data.optionId);
    return branchesFor(sql, scene, userId, true);
  });

/**
 * The storyteller continues the story in the direction with the most votes (ties go to the option offered first).
 * The new narration starts the next round.
 */
export const applyAiStoryBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number }) => sceneInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const { loadScene, requireScenePlay, storytellerWrites, tryStoryteller } = storyHelpers();
    const scene = await loadScene(sql, data.sceneId);
    await requireScenePlay(sql, userId, scene.row.community_id);
    if (!isOpen(scene)) throw new Error("This story has ended.");
    if (!inCastOrCreator(scene, userId)) throw new Error("Pick a character to play first.");
    const chosen = await winningOption(sql, scene.row.id);
    if (!chosen) throw new Error("Nobody has voted yet.");
    await guard(userId, "ai");
    const aiError = await tryStoryteller(() => storytellerWrites(sql, scene, "narration", chosen));
    if (aiError) throw new Error(aiError);
    return { ok: true as const, chosen };
  });

/**
 * Rewinds the story to an earlier turn (the checkpoint): every later turn is hidden for everyone and the story
 * continues from there. Hidden turns are kept, not deleted. Only the story's creator or a moderator can rewind.
 */
export const rewindAiStoryCheckpoint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number; turnId: number }) => sceneInput.extend({ turnId: z.number().int().positive() }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const scene = await requireSceneManager(sql, userId, data.sceneId);
    if (!isOpen(scene)) throw new Error("This story has ended.");
    const hidden = await rewindTo(sql, data.sceneId, data.turnId);
    return { ok: true as const, hidden };
  });
