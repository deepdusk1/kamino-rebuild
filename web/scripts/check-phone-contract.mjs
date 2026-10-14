#!/usr/bin/env node
/**
 * Checks that what the server sends matches what the phone app expects.
 *
 *   npm run check:contract
 *
 * It reads every typed RPC call in the mobile endpoints and feature wrappers,
 * writes a small TypeScript file that says "the result of the server function getMe must fit
 * the phone's type Me", and asks TypeScript to check it. A mismatch (a renamed field, a missing
 * one) fails here instead of showing up as a blank or broken screen on someone's phone.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const endpoints = `${root}../mobile/src/api/endpoints.ts`;
if (!existsSync(endpoints)) {
  console.log("[contract] ../mobile not found next to this folder; nothing to check.");
  process.exit(0);
}

const dir = path.resolve(root, ".contract");
if (path.dirname(dir) !== path.resolve(root) || path.basename(dir) !== ".contract") throw new Error("Invalid contract output directory.");
mkdirSync(dir, { recursive: true });
const wrapperPaths = [
  ["endpoints", "../mobile/src/api/endpoints.ts"],
  ["identity", "../mobile/src/lib/identity-v9.ts"],
  ["community", "../mobile/src/api/community-v9.ts"],
  ["content", "../mobile/src/lib/content-v9.ts"],
  ["platform", "../mobile/src/api/platform-v9.ts"],
  ["siteReports", "../mobile/src/api/site-reports.ts"],
  ["analytics", "../mobile/src/api/platform-analytics.ts"],
  ["stories", "../mobile/src/api/profile-stories.ts"],
  ["mediaV10", "../mobile/src/api/media-v10.ts"],
  ["socialEventsV10", "../mobile/src/api/social-events-v10.ts"],
  ["searchV10", "../mobile/src/api/search-v10.ts"],
  ["operationsV10", "../mobile/src/api/operations-v10.ts"],
  ["referrals", "../mobile/src/api/referrals.ts"],
];
const checked = [], allCalls = [];
const imports = [];
for (const [group, relative] of wrapperPaths) {
  const filename = path.resolve(root, relative);
  if (!existsSync(filename)) throw new Error(`Mobile wrapper not found: ${relative}`);
  const source = readFileSync(filename, "utf8");
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = [];
  const relocated = (name) => {
    const target = name.startsWith("@/") ? path.resolve(root, "../mobile/src", name.slice(2))
      : name.startsWith(".") ? path.resolve(path.dirname(filename), name) : null;
    if (!target) return name;
    const relativeImport = path.relative(dir, target).split(path.sep).join("/");
    return relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`;
  };
  const relocateTypeImports = (node) => {
    const start = node.getStart(file), changes = [];
    const visit = (child) => {
      if (ts.isImportTypeNode(child) && ts.isLiteralTypeNode(child.argument) && ts.isStringLiteral(child.argument.literal)) {
        const literal = child.argument.literal;
        changes.push({ start: literal.getStart(file) - start, end: literal.getEnd() - start, value: JSON.stringify(relocated(literal.text)) });
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    let text = node.getText(file);
    for (const change of changes.sort((a, b) => b.start - a.start)) text = text.slice(0, change.start) + change.value + text.slice(change.end);
    return text;
  };
  // Reuse the actual mobile DTO declarations, with their actual imported model types.
  // Loading a DTO-only copy avoids resolving mobile runtime aliases against the web app.
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) {
      const specifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(specifier)) continue;
      const name = specifier.text;
      let adjusted = statement.getText(file);
      adjusted = adjusted.replace(specifier.getText(file), JSON.stringify(relocated(name)));
      declarations.push(adjusted);
    }
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isEnumDeclaration(statement)) declarations.push(relocateTypeImports(statement));
  }
  const groupCalls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "rpc") {
      const name = node.arguments[0];
      if (!name || !ts.isStringLiteralLike(name)) throw new Error(`The RPC name must be a static string in ${relative}.`);
      allCalls.push({ group, name: name.text });
      const typeNode = node.typeArguments?.[0];
      const type = typeNode ? relocateTypeImports(typeNode).trim() : undefined;
      if (type && !["unknown", "void", "any"].includes(type)) {
        const alias = `RpcResult${groupCalls.length}`;
        declarations.push(`export type ${alias} = ${type};`);
        const contract = { group, name: name.text, alias };
        groupCalls.push(contract);
        checked.push(contract);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  writeFileSync(`${dir}/native-${group}.ts`, declarations.join("\n") + "\n");
  imports.push(`import type * as ${group}Dto from "./native-${group}";`);
}
const lines = [
  "// Generated by scripts/check-phone-contract.mjs. Do not edit; it is rebuilt on every run.",
  'import * as core from "../src/lib/kamino/server";',
  'import * as extras from "../src/lib/kamino/extras";',
  'import * as engagement from "../src/lib/kamino/engagement";',
  'import * as library from "../src/lib/kamino/library";',
  'import * as aiFeatures from "../src/lib/kamino/ai-features";',
  'import * as social from "../src/lib/kamino/social";',
  'import * as identity from "../src/lib/kamino/identity-v9";',
  'import * as community from "../src/lib/kamino/community-v9";',
  'import * as content from "../src/lib/kamino/content-v9";',
  'import * as platform from "../src/lib/kamino/platform-v9";',
  'import * as billing from "../src/lib/kamino/billing-v9";',
  'import * as siteReports from "../src/lib/kamino/site-reports";',
  'import * as platformAnalytics from "../src/lib/kamino/platform-analytics";',
  'import * as profileStories from "../src/lib/kamino/profile-stories";',
  'import * as mediaV10 from "../src/lib/kamino/media-v10";',
  'import * as socialEventsV10 from "../src/lib/kamino/social-events-v10";',
  'import * as operationsV10 from "../src/lib/kamino/operations-v10";',
  'import * as searchV10 from "../src/lib/kamino/search-v10";',
  'import * as watch from "../src/lib/kamino/watch";',
  'import * as referrals from "../src/lib/kamino/referrals";',
  ...imports,
  "const api = { ...core, ...extras, ...engagement, ...library, ...aiFeatures, ...social, ...identity, ...community, ...content, ...platform, ...billing, ...siteReports, ...platformAnalytics, ...profileStories, ...mediaV10, ...socialEventsV10, ...operationsV10, ...searchV10, ...watch, ...referrals };",
  "type Out<K extends keyof typeof api> = (typeof api)[K] extends (...args: never[]) => infer R ? Awaited<R> : never;",
  // The phone bridge sends ordinary JSON, whereas the web serializer preserves Date instances.
  "type Wire<T> = T extends Date ? string : T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;",
  "export function check(): void {",
  ...allCalls.map((c) => `  { const name: keyof typeof api = "${c.name}"; void name; } // ${c.group} RPC exists`),
  ...checked.map((c) => `  { const x: ${c.group}Dto.${c.alias} = null as unknown as Wire<Out<"${c.name}">>; void x; } // ${c.group}: ${c.name}`),
  "}",
];
writeFileSync(`${dir}/phone-contract.ts`, lines.join("\n") + "\n");
writeFileSync(
  `${dir}/tsconfig.json`,
  JSON.stringify({ extends: "../tsconfig.json", compilerOptions: { baseUrl: ".." }, include: ["phone-contract.ts", "../src/**/*.d.ts"] }, null, 2),
);

const tsc = spawnSync(process.execPath, [`${root}node_modules/typescript/bin/tsc`, "-p", `${dir}/tsconfig.json`], { stdio: "inherit" });
rmSync(dir, { recursive: true, force: true });
if (tsc.status !== 0) {
  console.error("\n[contract] The server and the phone app disagree about the data above. Fix one side, then run this again.");
  process.exit(1);
}
console.log(`[contract] ${checked.length} typed phone responses match what the server sends; ${allCalls.length} RPC names exist across ${wrapperPaths.length} mobile modules.`);
