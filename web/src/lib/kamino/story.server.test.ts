import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Sql } from "../db";
import { castVote, currentRound, readBranches, rewindTo, saveBranchOptions, winningOption } from "./story.server.ts";

// Every migration runs, in order, so this also checks 0050 applies on top of the real schema.
const pg = new PGlite();
await pg.waitReady;
const migrations = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
  (await pg.query(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
sql.query = async <T>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;

let n = 0;
async function scene(): Promise<number> {
  n += 1;
  const rows = await sql<{ id: number }>`
    insert into roleplay_scenes (community_id, creator_id, title, premise, characters)
    values (${`story-test-${n}`}, ${"creator"}, ${"Night shift"}, ${"A storm closes the harbour."}, ${"[]"}) returning id`;
  return Number(rows[0]!.id);
}
async function turn(sceneId: number, body: string, kind = "narration"): Promise<number> {
  const rows = await sql<{ id: number }>`
    insert into roleplay_turns (scene_id, character_name, kind, body) values (${sceneId}, ${""}, ${kind}, ${body}) returning id`;
  return Number(rows[0]!.id);
}

test("the round is the latest visible turn; held and rewound turns do not count", async () => {
  const s = await scene();
  assert.equal(await currentRound(sql, s), 0);
  const a = await turn(s, "The harbour lights flicker.");
  const b = await turn(s, "A boat comes in.");
  assert.equal(await currentRound(sql, s), b);
  await sql`update roleplay_turns set held = true where id = ${b}`;
  assert.equal(await currentRound(sql, s), a);
});

test("one vote per person per round: a second option moves the vote, the same option again removes it", async () => {
  const s = await scene();
  const round = await turn(s, "Thunder.");
  await saveBranchOptions(sql, s, round, ["Hide in the lighthouse", "Run for the boat", "Wait it out"]);
  await saveBranchOptions(sql, s, round, ["A second set nobody should see"]);
  const [first, second] = await readBranches(sql, s, round, "u1");
  assert.equal((await readBranches(sql, s, round, "u1")).length, 3);

  await castVote(sql, s, "u1", first!.id);
  await castVote(sql, s, "u2", second!.id);
  await castVote(sql, s, "u1", second!.id); // moves u1's vote
  let rows = await readBranches(sql, s, round, "u1");
  assert.deepEqual(rows.map((r) => r.votes), [0, 2, 0]);
  assert.equal(rows[1]!.votedByMe, true);
  assert.equal(await winningOption(sql, s), "Run for the boat");

  await castVote(sql, s, "u1", second!.id); // same option again: vote removed
  rows = await readBranches(sql, s, round, "u1");
  assert.deepEqual(rows.map((r) => r.votes), [0, 1, 0]);
  assert.equal(rows.some((r) => r.votedByMe), false);
});

test("nobody voting means no winner; ties go to the option offered first", async () => {
  const s = await scene();
  const round = await turn(s, "Silence.");
  await saveBranchOptions(sql, s, round, ["Option A", "Option B"]);
  assert.equal(await winningOption(sql, s), null);
  const [a, b] = await readBranches(sql, s, round, "x");
  await castVote(sql, s, "p", b!.id);
  await castVote(sql, s, "q", a!.id);
  assert.equal(await winningOption(sql, s), "Option A");
});

test("options from an earlier round cannot be voted on after the story moves on", async () => {
  const s = await scene();
  const round = await turn(s, "The door creaks.");
  await saveBranchOptions(sql, s, round, ["Open it", "Bar it shut"]);
  const [open] = await readBranches(sql, s, round, "u1");
  await turn(s, "Footsteps outside.", "turn");
  await assert.rejects(castVote(sql, s, "u1", open!.id), /moved on/);
});

test("rewinding hides later turns, clears later options and votes, and the story continues from the checkpoint", async () => {
  const s = await scene();
  const checkpoint = await turn(s, "Chapter one ends.");
  const later = await turn(s, "Chapter two.");
  await turn(s, "Chapter three.");
  await saveBranchOptions(sql, s, later, ["Old idea"]);
  const [old] = await readBranches(sql, s, later, "u1");
  await sql`insert into story_branch_votes (scene_id, after_turn_id, user_id, option_id) values (${s}, ${later}, ${"u1"}, ${old!.id})`;

  assert.equal(await rewindTo(sql, s, checkpoint), 2);
  assert.equal(await currentRound(sql, s), checkpoint);
  assert.equal((await sql`select 1 from story_branch_options where scene_id = ${s}`).length, 0);
  assert.equal((await sql`select 1 from story_branch_votes where scene_id = ${s}`).length, 0);
  // The hidden turns are kept, only marked.
  assert.equal((await sql`select 1 from roleplay_turns where scene_id = ${s} and rewound_at is not null`).length, 2);
  // A rewound turn can't be a checkpoint, and neither can another story's turn.
  await assert.rejects(rewindTo(sql, s, later), /no longer there/);
  const other = await scene();
  await assert.rejects(rewindTo(sql, other, checkpoint), /no longer there/);
});

test("deleting a story removes its options and votes with it", async () => {
  const s = await scene();
  const round = await turn(s, "End.");
  await saveBranchOptions(sql, s, round, ["Epilogue"]);
  const [only] = await readBranches(sql, s, round, "u1");
  await castVote(sql, s, "u1", only!.id);
  await sql`delete from roleplay_scenes where id = ${s}`;
  assert.equal((await sql`select 1 from story_branch_options where scene_id = ${s}`).length, 0);
  assert.equal((await sql`select 1 from story_branch_votes where scene_id = ${s}`).length, 0);
});
