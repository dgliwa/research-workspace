import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../openclaw.plugin.json", import.meta.url);
const manifest = JSON.parse(await readFile(path, "utf8"));
const sideEffecting = [
  "research_project_add",
  "research_project_update",
  "research_question_add",
  "research_question_update",
  "research_run_record",
  "research_artifact_update",
  "research_decision_add",
  "research_subscription_add",
  "research_subscription_remove",
  "research_subscription_scan",
];
manifest.toolMetadata = Object.fromEntries(sideEffecting.map((name) => [name, { sideEffecting: true }]));
await writeFile(path, `${JSON.stringify(manifest)}\n`, "utf8");
