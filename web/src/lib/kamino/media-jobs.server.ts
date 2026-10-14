/**
 * Background media jobs: automatic captions (transcription) and transcoding for uploaded
 * video/audio, run by the same minute worker as the notification jobs.
 *
 * - Transcription calls any Whisper-compatible `/audio/transcriptions` endpoint
 *   (`KAMINO_TRANSCRIBE_URL`, `KAMINO_TRANSCRIBE_KEY`, `KAMINO_TRANSCRIBE_MODEL`) and stores the
 *   returned segments as WebVTT captions on the media row (`content_media.captions`).
 * - Transcoding re-encodes video to 720p H.264 with the ffmpeg binary (`KAMINO_TRANSCODE_ENABLED=true`
 *   plus `KAMINO_FFMPEG_PATH`, default `ffmpeg`) and swaps the stored reference, keeping playback
 *   identical for members.
 *
 * Both are dormant without configuration. Every network/exec dependency is injectable for tests.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sql } from "@/lib/db";
import { loadMedia, storeMedia, deleteMediaObject } from "./media-store.server.ts";

type Row = Record<string, unknown>;

export type TranscribeConfig = { url: string; key: string; model: string };
export type MediaJobConfig = {
  transcribe: TranscribeConfig | null;
  transcode: { ffmpegPath: string } | null;
};

export function mediaJobConfig(env: Record<string, string | undefined> = process.env): MediaJobConfig {
  const url = env.KAMINO_TRANSCRIBE_URL?.trim().replace(/\/+$/, "") ?? "";
  const key = env.KAMINO_TRANSCRIBE_KEY?.trim() ?? "";
  const transcribe = url && key ? { url, key, model: env.KAMINO_TRANSCRIBE_MODEL?.trim() || "whisper-1" } : null;
  const transcode =
    env.KAMINO_TRANSCODE_ENABLED === "true"
      ? { ffmpegPath: env.KAMINO_FFMPEG_PATH?.trim() || "ffmpeg" }
      : null;
  return { transcribe, transcode };
}

/** Finds recent video/audio uploads and makes sure each has its job rows (idempotent). */
export async function enqueueDueMediaJobs(sql: Sql, config: MediaJobConfig): Promise<number> {
  if (!config.transcribe && !config.transcode) return 0;
  // Each job kind applies to its own media whitelist (fixed internal values, so inlining is safe).
  const plan: { kind: "transcribe" | "transcode"; mediaKinds: string[] }[] = [];
  if (config.transcribe) plan.push({ kind: "transcribe", mediaKinds: ["video", "audio", "short"] });
  if (config.transcode) plan.push({ kind: "transcode", mediaKinds: ["video", "short"] });
  let total = 0;
  for (const { kind, mediaKinds } of plan) {
    const inserted = (await sql.query(
      `insert into media_jobs(media_id, kind)
       select m.id, $1 from content_media m
       where m.kind = any(array[${mediaKinds.map((k) => `'${k}'`).join(",")}]::text[])
         and m.created_at > now() - interval '30 days'
       on conflict (media_id, kind) do nothing returning id`,
      [kind],
    )) as Row[];
    total += inserted.length;
  }
  return total;
}

/** Segments from a Whisper `verbose_json` response become WebVTT. */
export function segmentsToVtt(segments: { start: number; end: number; text: string }[]): string {
  const clock = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds * 1000));
    const ms = String(total % 1000).padStart(3, "0");
    const whole = Math.floor(total / 1000);
    const s = String(whole % 60).padStart(2, "0");
    const m = String(Math.floor(whole / 60) % 60).padStart(2, "0");
    const h = String(Math.floor(whole / 3600)).padStart(2, "0");
    return `${h}:${m}:${s}.${ms}`;
  };
  return [
    "WEBVTT",
    "",
    ...segments.map((segment, index) =>
      [
        String(index + 1),
        `${clock(segment.start)} --> ${clock(segment.end)}`,
        segment.text.trim(),
        "",
      ].join("\n"),
    ),
  ].join("\n");
}

async function runFfmpeg(ffmpegPath: string, input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "kamino-transcode-"));
  try {
    const inputPath = join(dir, "input");
    const outputPath = join(dir, "output.mp4");
    await writeFile(inputPath, input);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ffmpegPath,
        ["-y", "-i", inputPath, "-vcodec", "libx264", "-vf", "scale=-2:720", "-acodec", "aac", outputPath],
        { stdio: "ignore" },
      );
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

type Deps = {
  fetchImpl?: typeof fetch;
  runFfmpegImpl?: (ffmpegPath: string, input: Buffer) => Promise<Buffer>;
};

const MAX_ATTEMPTS = 3;


/** Claims and runs pending media jobs. Returns how many were processed. */
export async function processMediaJobs(sql: Sql, config: MediaJobConfig, deps: Deps = {}): Promise<number> {
  if (!config.transcribe && !config.transcode) return 0;
  const claimable: string[] = [];
  if (config.transcribe) claimable.push("transcribe");
  if (config.transcode) claimable.push("transcode");
  const pending = await sql.query<Row>(
    `select j.id, j.media_id, j.kind, j.attempts, m.kind as media_kind, m.storage_ref, m.alt_text
     from media_jobs j join content_media m on m.id = j.media_id
     where j.state = 'pending' and j.kind = any(array[${claimable.map((kind) => `'${kind}'`).join(",")}]::text[])
     order by j.updated_at asc limit 5`,
  );
  let processed = 0;
  for (const job of pending) {
    const kind = String(job.kind);
    if (kind === "transcribe" && !config.transcribe) continue;
    if (kind === "transcode" && !config.transcode) continue;
    // Audio never transcodes; video always can. Skip impossible pairings quietly.
    if (kind === "transcode" && String(job.media_kind) === "audio") {
      await sql`update media_jobs set state='skipped', updated_at=now() where id=${Number(job.id)}`;
      continue;
    }
    const claimed = await sql`update media_jobs set state='processing', updated_at=now()
      where id=${Number(job.id)} and state='pending' returning id`;
    if (!claimed.length) continue;
    processed += 1;
    try {
      const source = await loadMedia(String(job.storage_ref));
      const base64 = source.includes(",") ? source.slice(source.indexOf(",") + 1) : "";
      const bytes = Buffer.from(base64, "base64");
      if (kind === "transcribe") {
        const cfg = config.transcribe!;
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }), "audio");
        form.append("model", cfg.model);
        form.append("response_format", "verbose_json");
        const response = await (deps.fetchImpl ?? fetch)(`${cfg.url}/audio/transcriptions`, {
          method: "POST",
          headers: { authorization: `Bearer ${cfg.key}` },
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new Error(`transcription answered ${response.status}`);
        const body = (await response.json()) as {
          text?: string;
          segments?: { start: number; end: number; text: string }[];
        };
        const vtt = segmentsToVtt(body.segments ?? []);
        const description = (body.text ?? "").slice(0, 2000);
        await sql`update content_media set captions = ${vtt} where id = ${Number(job.media_id)} and captions = ''`;
        await sql`update media_jobs set state='done', result=${description}, updated_at=now() where id=${Number(job.id)}`;
      } else {
        const run = deps.runFfmpegImpl ?? runFfmpeg;
        const output = await run(config.transcode!.ffmpegPath, bytes);
        const stored = await storeMedia(
          "video",
          `data:${String(job.media_kind) === "audio" ? "audio/mpeg" : "video/mp4"};base64,${output.toString("base64")}`,
        );
        const previous = String(job.storage_ref);
        await sql`update content_media set storage_ref = ${stored} where id = ${Number(job.media_id)}`;
        await sql`update media_jobs set state='done', result=${stored}, updated_at=now() where id=${Number(job.id)}`;
        if (stored !== previous) await deleteMediaObject(previous).catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "media job failed";
      const attempts = Number(job.attempts ?? 0) + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await sql`update media_jobs set state=${failed ? "failed" : "pending"}, attempts=${attempts}, error=${message.slice(0, 300)}, updated_at=now()
        where id=${Number(job.id)}`;
    }
  }
  return processed;
}
