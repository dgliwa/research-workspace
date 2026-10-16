import { isAbsolute, relative, resolve } from "node:path";

function isWithin(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

export function resolveResearchDatabasePath(stateDir: string, configuredPath?: string): string {
  const root = resolve(stateDir);
  if (!configuredPath) return resolve(root, "plugins", "research-workspace", "research.sqlite");
  if (configuredPath === ":memory:") return configuredPath;
  if (configuredPath.includes("\0")) throw new Error("Database path cannot contain null bytes.");
  if (isAbsolute(configuredPath)) return resolve(configuredPath);
  const path = resolve(root, configuredPath);
  if (!isWithin(root, path)) throw new Error("Relative database path must remain within the OpenClaw state directory.");
  return path;
}
