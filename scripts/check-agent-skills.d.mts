/**
 * Ambient type declarations for `check-agent-skills.mjs`.
 *
 * The guard/generator intentionally stays plain JavaScript (it must run from
 * `prepare` before `tsc` exists in a fresh install), but its exports are
 * consumed from a TypeScript test file. This declaration file lets `tsc`
 * type-check that test without `allowJs`, and without weakening the test
 * file's imports with `@ts-expect-error`.
 */

export interface Reporter {
  problems: string[];
  notes: string[];
  fail(message: string, hint?: string): void;
  note(message: string): void;
}

export interface SyncResult {
  name: string;
  strategy: "symlink" | "copy";
}

export interface SyncMirrorOptions {
  root: string;
  mode?: "symlink" | "copy";
  symlink?: (target: string, linkPath: string) => void;
}

export function agentsSkillsDir(root: string): string;
export function claudeSkillsDir(root: string): string;
export function readFrontMatter(file: string): Record<string, string> | null;
export function syncMirror(options: SyncMirrorOptions): SyncResult[];
export function checkCitiSkills(
  options: { root: string },
  reporter?: Reporter,
): Reporter;
export function checkOpenspecSkills(
  options: { root: string },
  reporter?: Reporter,
): Reporter;
export function checkPinnedOpenspecVersion(
  options: { root: string },
  reporter?: Reporter,
): Reporter;
export function checkNoDuplicatedRules(
  options: { root: string },
  reporter?: Reporter,
): Reporter;
export function checkAgentSkills(options: { root: string }): {
  problems: string[];
  notes: string[];
};
