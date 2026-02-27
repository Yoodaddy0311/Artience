/**
 * Skill Injector — enriches task prompts with relevant artibot skill context.
 *
 * Scans artibot plugin's skill directory for SKILL.md files and matches
 * them against task descriptions to inject reference material as context.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { findArtibotConfig } from "./plugin-sync.js";

/** Skill metadata extracted from directory structure. */
export interface SkillInfo {
  name: string;
  path: string;
  keywords: string[];
}

/** Injected context block for a task. */
export interface SkillContext {
  skillName: string;
  summary: string;
}

/**
 * Task domain → skill name mapping.
 * Maps keywords found in task descriptions to relevant artibot skills.
 */
const DOMAIN_SKILL_MAP: Record<string, string[]> = {
  frontend: ["frontend-patterns", "coding-standards", "lang-typescript"],
  backend: ["backend-patterns", "coding-standards", "lang-python"],
  test: ["tdd-workflow", "testing-standards"],
  tdd: ["tdd-workflow", "testing-standards"],
  security: ["security-standards", "security-review"],
  database: ["postgres-patterns", "platform-database-cloud"],
  deploy: ["platform-deployment"],
  docker: ["platform-deployment"],
  ci: ["platform-deployment"],
  performance: ["performance-engineer"],
  refactor: ["coding-standards"],
  review: ["coding-standards"],
  typescript: ["lang-typescript", "coding-standards"],
  python: ["lang-python", "coding-standards"],
  react: ["frontend-patterns", "lang-typescript"],
  api: ["backend-patterns", "platform-auth"],
  auth: ["platform-auth", "security-standards"],
  seo: ["seo-strategy", "technical-seo"],
  content: ["content-seo", "copywriting"],
  marketing: ["marketing-strategy", "marketing-analytics"],
  data: ["data-analysis", "data-visualization"],
  presentation: ["presentation-design"],
};

/**
 * Discover the artibot skills directory from the config location.
 */
function findSkillsDir(): string | null {
  const configPath = findArtibotConfig();
  if (!configPath) return null;

  // artibot.config.json is in .agent/ — skills are in the plugin directory
  // Structure: .agent/.claude-plugin/skills/
  const pluginDir = join(configPath, "..", ".claude-plugin");
  const skillsDir = join(pluginDir, "skills");

  if (existsSync(skillsDir)) return skillsDir;

  return null;
}

/**
 * List available skill names from the skills directory.
 */
export function listSkills(): SkillInfo[] {
  const skillsDir = findSkillsDir();
  if (!skillsDir) return [];

  const skills: SkillInfo[] = [];

  try {
    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      const entryPath = join(skillsDir, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        // Skill directories contain SKILL.md
        const skillMd = join(entryPath, "SKILL.md");
        if (existsSync(skillMd)) {
          skills.push({
            name: entry,
            path: skillMd,
            keywords: entry.split("-"),
          });
        }
      } else if (entry.endsWith(".md")) {
        // Direct .md files in skills/
        skills.push({
          name: basename(entry, ".md"),
          path: entryPath,
          keywords: basename(entry, ".md").split("-"),
        });
      }
    }
  } catch {
    // Permission or read error — return what we have
  }

  return skills;
}

/**
 * Find relevant skills for a task description.
 * Returns skill names that match domain keywords in the task.
 */
export function matchSkills(taskDescription: string): string[] {
  const desc = taskDescription.toLowerCase();
  const matched = new Set<string>();

  for (const [keyword, skillNames] of Object.entries(DOMAIN_SKILL_MAP)) {
    if (desc.includes(keyword)) {
      for (const skill of skillNames) {
        matched.add(skill);
      }
    }
  }

  return [...matched];
}

/**
 * Build context blocks for matched skills.
 * Returns summaries (first 500 chars of each skill file) to inject into prompts.
 */
export function getSkillContexts(skillNames: string[]): SkillContext[] {
  const available = listSkills();
  const nameMap = new Map(available.map((s) => [s.name, s]));
  const contexts: SkillContext[] = [];

  for (const name of skillNames) {
    const skill = nameMap.get(name);
    if (!skill) continue;

    try {
      const content = readFileSync(skill.path, "utf-8");
      // Extract first meaningful paragraph as summary
      const lines = content.split("\n").filter((l) => l.trim());
      const summary = lines.slice(0, 10).join("\n").slice(0, 500);

      contexts.push({
        skillName: name,
        summary,
      });
    } catch {
      // Skip unreadable skills
    }
  }

  return contexts;
}

/**
 * Main entry: given a task description, return context blocks to inject.
 */
export function injectSkillContext(taskDescription: string): SkillContext[] {
  const skillNames = matchSkills(taskDescription);
  if (skillNames.length === 0) return [];
  return getSkillContexts(skillNames);
}
