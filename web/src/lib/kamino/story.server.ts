/**
 * Database steps for AI story branch voting and rewinds (server-only, tested against the real migrations in
 * story.server.test.ts). The permission checks live in story.ts; everything here takes an already-checked scene.
 */
import type { Sql } from "../db";

export type BranchRow = { id: number; label: string; votes: number; votedByMe: boolean };

/** The latest turn everyone can see (not held for review, not rewound): the current voting round, 0 if none. */
export async function currentRound(sql: Sql, sceneId: number): Promise<number> {
  const rows = await sql<{ id: number }>`
    select id from roleplay_turns
    where scene_id = ${sceneId} and held = false and rewound_at is null
    order by id desc limit 1`;
  return rows.length ? Number(rows[0]!.id) : 0;
}

/** The options offered after `round`, oldest first, with their vote counts and whether `userId` picked each. */
export async function readBranches(sql: Sql, sceneId: number, round: number, userId: string): Promise<BranchRow[]> {
  const rows = await sql<{ id: number; label: string; votes: number; mine: boolean }>`
    select o.id, o.label,
      (select count(*)::int from story_branch_votes v where v.option_id = o.id) as votes,
      exists(select 1 from story_branch_votes v where v.option_id = o.id and v.user_id = ${userId}) as mine
    from story_branch_options o
    where o.scene_id = ${sceneId} and o.after_turn_id = ${round}
    order by o.id`;
  return rows.map((r) => ({ id: Number(r.id), label: String(r.label), votes: Number(r.votes), votedByMe: Boolean(r.mine) }));
}

export async function roundHasOptions(sql: Sql, sceneId: number, round: number): Promise<boolean> {
  return (await sql`select 1 from story_branch_options where scene_id = ${sceneId} and after_turn_id = ${round} limit 1`).length > 0;
}

/** Saves a round's options unless the round already has some (two players asking at once keep only one set). */
export async function saveBranchOptions(sql: Sql, sceneId: number, round: number, labels: string[]): Promise<void> {
  if (await roundHasOptions(sql, sceneId, round)) return;
  for (const label of labels) {
    await sql`insert into story_branch_options (scene_id, after_turn_id, label) values (${sceneId}, ${round}, ${label})`;
  }
}

/**
 * One vote per person per round: voting for another option moves the vote, voting for the same option again removes
 * it. Throws when the option is not part of the current round (the story moved on while the person was looking).
 */
export async function castVote(sql: Sql, sceneId: number, userId: string, optionId: number): Promise<void> {
  const round = await currentRound(sql, sceneId);
  const option = await sql`select 1 from story_branch_options
    where id = ${optionId} and scene_id = ${sceneId} and after_turn_id = ${round}`;
  if (!option.length) throw new Error("The story has moved on. Pull down to see the latest options.");
  const removed = await sql`delete from story_branch_votes
    where scene_id = ${sceneId} and after_turn_id = ${round} and user_id = ${userId} and option_id = ${optionId}
    returning user_id`;
  if (removed.length) return;
  await sql`insert into story_branch_votes (scene_id, after_turn_id, user_id, option_id)
    values (${sceneId}, ${round}, ${userId}, ${optionId})
    on conflict (scene_id, after_turn_id, user_id) do update set option_id = excluded.option_id, created_at = now()`;
}

/** The current round's option with the most votes (ties go to the one offered first), or null if nobody voted. */
export async function winningOption(sql: Sql, sceneId: number): Promise<string | null> {
  const round = await currentRound(sql, sceneId);
  const top = (
    await sql<{ label: string; votes: number }>`
      select o.label, count(v.user_id)::int as votes
      from story_branch_options o left join story_branch_votes v on v.option_id = o.id
      where o.scene_id = ${sceneId} and o.after_turn_id = ${round}
      group by o.id order by votes desc, o.id asc limit 1`
  )[0];
  return top && Number(top.votes) > 0 ? String(top.label) : null;
}

/**
 * Hides every turn after `turnId` (kept in the table, left out wherever the story is read) and drops the options
 * and votes made after it. Returns how many turns were hidden. Throws if `turnId` is not a visible turn of the scene.
 */
export async function rewindTo(sql: Sql, sceneId: number, turnId: number): Promise<number> {
  const checkpoint = await sql`select 1 from roleplay_turns
    where id = ${turnId} and scene_id = ${sceneId} and held = false and rewound_at is null`;
  if (!checkpoint.length) throw new Error("That part of the story is no longer there.");
  const hidden = await sql`update roleplay_turns set rewound_at = now()
    where scene_id = ${sceneId} and id > ${turnId} and rewound_at is null
    returning id`;
  await sql`delete from story_branch_options where scene_id = ${sceneId} and after_turn_id > ${turnId}`;
  await sql`update roleplay_scenes set updated_at = now() where id = ${sceneId}`;
  return hidden.length;
}
