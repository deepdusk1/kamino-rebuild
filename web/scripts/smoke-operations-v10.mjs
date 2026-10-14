import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fixtureAuthFetch } from "./fixture-auth.mjs";

/** Run after the common fixture; never creates another fixed administrator account. */
export async function verifyOperationsV10(fixtures) {
  const base = process.env.TEST_ORIGIN ?? "http://localhost:8085";
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname))
    throw new Error("Operations fixtures run on loopback only.");
  const secret =
    process.env.TEST_AUTH_SECRET ??
    JSON.parse(readFileSync(new URL("../.test-v10-config.json", import.meta.url), "utf8")).secret;
  const { owner, member, community } = fixtures;
  let groups = 0;
  const pass = (name) => console.log(`PASS operations ${++groups} ${name}`);
  async function call(who, name, data) {
    const response = await fetch(`${base}/api/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(who?.token ? { authorization: `Bearer ${who.token}` } : {}),
      },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(60000),
    });
    return await response.json();
  }
  async function ok(who, name, data) {
    const result = await call(who, name, data);
    assert.equal(result.error, undefined, `${name}: ${result.error?.message}`);
    return result.result;
  }
  async function no(who, name, data) {
    const result = await call(who, name, data);
    assert.ok(result.error, `${name} should refuse`);
    return result.error;
  }
  const proof = (caseId, userId, expires = Date.now() + 600000) => {
    const payload = Buffer.from(JSON.stringify({ caseId, userId, expires })).toString("base64url");
    return `${payload}.${createHmac("sha256", secret).update(`kamino-case-appeal:${payload}`).digest("base64url")}`;
  };
  await no(null, "getOperationsCenter");
  await no(member, "getAdminOperations");
  await no(member, "openModerationCase", { subjectId: owner.id, summary: "Unauthorized review" });
  await no(member, "createProgressionSeason", {
    title: "Unauthorized season",
    startsAt: new Date(Date.now() - 86400000).toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    sets: [{ title: "Colour", cosmetic: "aurora", requiredPoints: 1, supply: 1 }],
  });
  pass("operations and administration require authenticated authorized accounts");
  await ok(owner, "setEmailDigest", true);
  assert.equal((await ok(owner, "getOperationsCenter")).emailDigest, true);
  await ok(owner, "setEmailDigest", false);
  assert.equal((await ok(owner, "getOperationsCenter")).emailDigest, false);
  pass("verified member controls email digest opt-in and opt-out");
  const opened = await ok(owner, "openModerationCase", {
    subjectId: member.id,
    summary: "INTERNAL CASE EVIDENCE must remain private",
    priority: "urgent",
  });
  await ok(owner, "updateModerationCase", { id: opened.id, action: "investigating" });
  await ok(owner, "updateModerationCase", {
    id: opened.id,
    action: "note",
    note: "INTERNAL REVIEW NOTE",
    memberVisible: false,
  });
  await ok(owner, "updateModerationCase", {
    id: opened.id,
    action: "note",
    note: "We are reviewing your case.",
    memberVisible: true,
  });
  const memberCenter = await ok(member, "getOperationsCenter");
  assert.ok(memberCenter.cases.some((c) => Number(c.id) === opened.id));
  assert.ok(!JSON.stringify(memberCenter).includes("INTERNAL"));
  assert.ok(memberCenter.events.some((e) => e.note === "We are reviewing your case."));
  assert.ok(
    !(await ok(owner, "getOperationsCenter")).cases.some((c) => Number(c.id) === opened.id),
  );
  pass("case management keeps internal evidence private and exposes explicit member-visible notes");
  await ok(owner, "decideModerationCase", {
    id: opened.id,
    decision: "warning",
    reason: "Please follow the community participation rules.",
  });
  await no(owner, "decideModerationCase", {
    id: opened.id,
    decision: "banned",
    reason: "Cannot replace a final decision.",
  });
  const appeal = await ok(member, "submitCaseAppeal", {
    caseId: opened.id,
    message: "I believe this warning misunderstood the context of my message.",
  });
  await no(member, "submitCaseAppeal", {
    caseId: opened.id,
    message: "A duplicate appeal should not be submitted.",
  });
  await no(owner, "reviewCaseAppeal", {
    id: appeal.id,
    decision: "upheld",
    note: "The original issuer cannot review this appeal.",
  });
  pass("case decisions are final and appeal review requires an independent administrator");
  const verified = await ok(null, "getVerifiedCaseAppeal", proof(opened.id, member.id));
  assert.equal(Number(verified.case.id), opened.id);
  assert.ok(!JSON.stringify(verified).includes("INTERNAL"));
  await no(null, "getVerifiedCaseAppeal", proof(opened.id, owner.id));
  await no(null, "getVerifiedCaseAppeal", proof(opened.id, member.id, Date.now() - 1));
  await no(null, "getVerifiedCaseAppeal", `${proof(opened.id, member.id)}x`);
  pass(
    "signed-out appeal proofs bind the subject and case, exclude private notes and reject forgery/expiry",
  );
  const season = await ok(owner, "createProgressionSeason", {
    title: `Participation season ${Date.now()}`,
    startsAt: new Date(Date.now() - 86400000).toISOString(),
    endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    sets: [
      {
        title: "One earned aurora",
        description: "Participation reward",
        cosmetic: "aurora",
        requiredPoints: 10,
        supply: 1,
      },
    ],
  });
  const initial = (await ok(member, "getOperationsCenter")).seasons.find((s) => s.id === season.id);
  assert.ok(initial);
  await ok(member, "createPost", {
    slug: community.id,
    type: "blog",
    title: "Season participation",
    body: "A helpful contribution to this community.",
  });
  const progress = (await ok(member, "getOperationsCenter")).seasons.find(
    (s) => s.id === season.id,
  );
  assert.ok(progress.points >= 10);
  const setId = Number(progress.sets[0].id);
  const claimed = await ok(member, "claimSeasonCollectible", setId);
  assert.equal(claimed.alreadyClaimed, false);
  assert.equal((await ok(member, "claimSeasonCollectible", setId)).alreadyClaimed, true);
  await ok(member, "equipEarnedCosmetic", { cosmetic: "aurora" });
  await ok(owner, "endProgressionSeason", season.id);
  await no(owner, "claimSeasonCollectible", setId);
  pass(
    "server-earned seasonal progress, finite collectible supply, colour equip and season end are functional",
  );
  await ok(owner, "setPlatformFlag", {
    key: "related_discovery",
    enabled: true,
    rolloutPercent: 100,
  });
  const key = `ops-exp-${Date.now()}`;
  await ok(owner, "savePlatformExperiment", {
    key,
    title: "Related feature assignment",
    featureKey: "related_discovery",
    treatmentPercent: 50,
    status: "running",
  });
  const hub = await ok(member, "getDiscoveryHub", { contextCommunityId: community.id });
  assert.equal(
    (await ok(member, "getDiscoveryHub", { contextCommunityId: community.id })).relatedEnabled,
    hub.relatedEnabled,
  );
  await ok(member, "setDiscoveryFeedback", {
    targetType: "community",
    targetId: community.id,
    preference: "more",
  });
  const experiment = (await ok(owner, "getAdminOperations")).experiments.find((e) => e.key === key);
  assert.equal(Number(experiment.control_exposures) + Number(experiment.treatment_exposures), 1);
  assert.equal(
    Number(experiment.control_conversions) + Number(experiment.treatment_conversions),
    1,
  );
  await ok(owner, "savePlatformExperiment", {
    id: Number(experiment.id),
    key,
    title: String(experiment.title),
    featureKey: "related_discovery",
    treatmentPercent: 50,
    status: "ended",
  });
  await ok(member, "setDiscoveryFeedback", {
    targetType: "community",
    targetId: community.id,
    preference: "clear",
  });
  pass(
    "actual discovery feature consumer enforces stable experiments and records one real interaction outcome",
  );
  const password = randomBytes(16).toString("hex"),
    email = `case-proof-${randomBytes(6).toString("hex")}@example.test`;
  const response = await fixtureAuthFetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name: "Sanction appeal fixture", email, password }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  const sanctioned = { id: body.user.id, token: response.headers.get("set-auth-token") };
  await ok(sanctioned, "bootstrap");
  await ok(sanctioned, "confirmMinimumAge", { year: 1990, month: 1, day: 1 });
  const bannedCase = await ok(owner, "openModerationCase", {
    subjectId: sanctioned.id,
    summary: "Fixture account review",
  });
  await ok(owner, "decideModerationCase", {
    id: bannedCase.id,
    decision: "banned",
    reason: "Fixture ban used to verify independent appeal access.",
  });
  await no(sanctioned, "getOperationsCenter");
  const bannedProof = proof(bannedCase.id, sanctioned.id);
  const publicRead = await ok(null, "getVerifiedCaseAppeal", bannedProof);
  assert.equal(publicRead.case.decision, "banned");
  await ok(null, "submitVerifiedCaseAppeal", {
    proof: bannedProof,
    message: "Please independently review this case and reconsider the account action.",
  });
  assert.equal((await ok(null, "getVerifiedCaseAppeal", bannedProof)).appeals.length, 1);
  await no(null, "submitVerifiedCaseAppeal", {
    proof: proof(bannedCase.id, owner.id),
    message: "The wrong account proof must not submit this appeal.",
  });
  pass("a banned and signed-out member can read only their verified case and submit an appeal");
  console.log(`Operations v10 integration: ${groups} groups passed`);
  return { groups, caseId: opened.id, seasonId: season.id };
}
