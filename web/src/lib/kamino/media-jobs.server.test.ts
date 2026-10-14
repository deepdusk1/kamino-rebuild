import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import {
  enqueueDueMediaJobs,
  mediaJobConfig,
  processMediaJobs,
  segmentsToVtt,
} from "./media-jobs.server.ts";

const directory = new URL("../../../migrations/", import.meta.url);

/** Every test gets a fresh database — media jobs linger as rows by design, so sharing one
 * database would let one test's pending jobs run inside another test. */
async function makeDb(): Promise<Sql> {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort())
    await pg.exec(readFileSync(new URL(file, directory), "utf8"));
  const run = async <T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> => (await pg.query<T>(q, p)).rows;
  const value = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(strings.reduce((q: string, p, i) => q + (i ? `$${i}` : "") + p, ""), values)) as Sql;
  value.query = run;
  after(() => pg.close());
  return value;
}
let sequence = 0;
const DATA_URL = "data:video/mp4;base64,aGVsbG8=";

async function mediaRow(sql: Sql, kind: "video" | "audio" | "short"): Promise<number> {
  const userId = `mj-user-${++sequence}`;
  await sql`insert into "user"(id,name,email,"emailVerified") values(${userId},${userId},${`${userId}@example.test`},true)`;
  const room = await sql<{ id: number }>`insert into chat_rooms(name, kind, created_by) values('room','group',${userId}) returning id`;
  const message = await sql<{ id: number }>`insert into messages(room_id, author_user_id, body) values(${Number(room[0]!.id)}, ${userId}, 'm') returning id`;
  const media = await sql<{ id: number }>`
    insert into content_media(message_id, kind, storage_ref, mime, byte_size)
    values(${Number(message[0]!.id)}, ${kind}, ${DATA_URL}, 'video/mp4', 10) returning id`;
  return Number(media[0]!.id);
}

test("vtt builder emits a valid WebVTT document with padded clocks", () => {
  const vtt = segmentsToVtt([
    { start: 0, end: 1.5, text: " Hello there. " },
    { start: 3661.25, end: 3662, text: "An hour later." },
  ]);
  assert.match(vtt, /^WEBVTT\n/);
  assert.match(vtt, /00:00:00\.000 --> 00:00:01\.500\nHello there\./);
  assert.match(vtt, /01:01:01\.250 --> 01:01:02\.000\nAn hour later\./);
});

test("jobs are enqueued per media kind and stay idempotent; audio never transcodes", async () => {
  const sql = await makeDb();
  process.env.KAMINO_TRANSCRIBE_URL = "https://ai.example.com/v1";
  process.env.KAMINO_TRANSCRIBE_KEY = "k";
  process.env.KAMINO_TRANSCODE_ENABLED = "true";
  const config = mediaJobConfig();
  const video = await mediaRow(sql, "video");
  const audio = await mediaRow(sql, "audio");
  assert.equal(await enqueueDueMediaJobs(sql, config), 3, "video: transcribe+transcode, audio: transcribe");
  assert.equal(await enqueueDueMediaJobs(sql, config), 0, "second pass adds nothing");
  const rows = await sql`select media_id, kind from media_jobs where media_id = any(${[video, audio]})`;
  assert.equal(rows.filter((r) => Number(r.media_id) === audio && r.kind === "transcode").length, 0);
  assert.equal(rows.filter((r) => Number(r.media_id) === audio && r.kind === "transcribe").length, 1);
  void processMediaJobs;
});

test("transcription stores WebVTT captions and a failed job retries then fails", async () => {
  const sql = await makeDb();
  process.env.KAMINO_TRANSCRIBE_URL = "https://ai.example.com/v1";
  process.env.KAMINO_TRANSCRIBE_KEY = "k";
  delete process.env.KAMINO_TRANSCODE_ENABLED;
  const config = mediaJobConfig();
  const video = await mediaRow(sql, "video");
  const audio = await mediaRow(sql, "audio");
  await enqueueDueMediaJobs(sql, config);

  let calls = 0;
  const okFetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        text: "Hello there.",
        segments: [{ start: 0, end: 1.5, text: " Hello there. " }],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  await processMediaJobs(sql, config, { fetchImpl: okFetch });
  assert.equal(calls, 2, "one call per transcribe job");
  const captioned = await sql`select captions from content_media where id = ${video}`;
  assert.match(String(captioned[0]!.captions), /^WEBVTT/);

  // A permanently broken provider retries up to the cap, then the job fails with the error.
  const broken = await mediaRow(sql, "audio");
  await enqueueDueMediaJobs(sql, config);
  const failFetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  for (let attempt = 0; attempt < 3; attempt++) await processMediaJobs(sql, config, { fetchImpl: failFetch });
  const state = await sql`select state, attempts from media_jobs j join content_media m on m.id=j.media_id
    where m.id=${broken} and j.kind='transcribe'`;
  assert.equal(String(state[0]!.state), "failed");
  assert.equal(Number(state[0]!.attempts), 3);
});

test("transcoding swaps the stored reference for a fresh media object", async () => {
  const sql = await makeDb();
  process.env.KAMINO_TRANSCODE_ENABLED = "true";
  delete process.env.KAMINO_TRANSCRIBE_URL;
  const config = mediaJobConfig();
  const video = await mediaRow(sql, "video");
  const before = await sql`select storage_ref from content_media where id = ${video}`;
  await enqueueDueMediaJobs(sql, config);
  const runFfmpegImpl = async (_path: string, input: Buffer) => Buffer.from(`reencoded:${input.length}`);
  await processMediaJobs(sql, config, { runFfmpegImpl });
  const after = await sql`select storage_ref from content_media where id = ${video}`;
  assert.notEqual(String(after[0]!.storage_ref), String(before[0]!.storage_ref));
  const job = await sql`select state, result from media_jobs where media_id = ${video} and kind = 'transcode'`;
  assert.equal(String(job[0]!.state), "done");
  assert.equal(String(job[0]!.result), String(after[0]!.storage_ref));
});
