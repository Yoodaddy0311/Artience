/**
 * Artibot Registry — Scans .agent/ directory to build runtime registry.
 *
 * Provides dynamic discovery of agents, skills, commands, and playbooks
 * from the artibot plugin. Watches for file changes and auto-reloads.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentDef {
    id: string; // e.g. "orchestrator"
    name: string; // display name from filename
    filePath: string; // absolute path to .md
    category?: string; // manager | expert | builder | support
    modelTier?: string; // high | medium | low
}

export interface SkillDef {
    id: string; // directory name, e.g. "orchestration"
    name: string; // from YAML frontmatter
    description: string;
    triggers: string[];
    platforms: string[];
    category?: string;
    filePath: string;
}

export interface CommandDef {
    command: string; // e.g. "team", "plan", "frontend"
    agent: string; // target agent id
    source: 'config'; // where it was defined
}

export interface PlaybookDef {
    id: string; // e.g. "feature", "bugfix"
    flow: string; // e.g. "[leader] plan -> [council] design -> ..."
    description?: string;
    domain?: string;
    tags?: string[];
}

export interface TeamConfig {
    enabled: boolean;
    engine: string;
    maxTeammates: number | null;
    ctoAgent: string;
    levels: Record<
        string,
        { teammates: number | string; mode: string; trigger: string }
    >;
    playbooks: Record<string, string>;
}

export interface ArtibotRegistry {
    version: string;
    agents: AgentDef[];
    skills: SkillDef[];
    commands: CommandDef[];
    playbooks: PlaybookDef[];
    teamConfig: TeamConfig | null;
    lastScanned: number;
}

// ── YAML Frontmatter Parser (lightweight, no dependency) ───────────────────

function parseFrontmatter(content: string): Record<string, any> {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    const yaml = match[1];
    const result: Record<string, any> = {};

    let currentKey = '';
    let currentList: string[] | null = null;

    for (const rawLine of yaml.split('\n')) {
        const line = rawLine.replace(/\r$/, '');

        // List item
        if (
            line.match(/^\s+-\s+"?(.+?)"?\s*$/) ||
            line.match(/^\s+-\s+'?(.+?)'?\s*$/)
        ) {
            const val = line
                .replace(/^\s+-\s+/, '')
                .replace(/^["']|["']$/g, '')
                .trim();
            if (currentList) {
                currentList.push(val);
            }
            continue;
        }

        // Key: value
        const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
        if (kvMatch) {
            // Save previous list
            if (currentList && currentKey) {
                result[currentKey] = currentList;
                currentList = null;
            }

            const [, key, rawVal] = kvMatch;
            currentKey = key;
            const val = rawVal.trim();

            if (val === '' || val === '|') {
                // Could be a list or multiline string
                currentList = [];
            } else if (val.startsWith('[') && val.endsWith(']')) {
                // Inline list: [a, b, c]
                result[key] = val
                    .slice(1, -1)
                    .split(',')
                    .map((s) => s.trim().replace(/^["']|["']$/g, ''));
                currentList = null;
            } else {
                result[key] = val.replace(/^["']|["']$/g, '');
                currentList = null;
            }
        }
    }

    // Flush last list
    if (currentList && currentKey) {
        result[currentKey] = currentList;
    }

    return result;
}

// ── Scanners ────────────────────────────────────────────────────────────────

function scanConfig(agentDir: string): {
    version: string;
    agents: Partial<AgentDef>[];
    commands: CommandDef[];
    playbooks: PlaybookDef[];
    teamConfig: TeamConfig | null;
} {
    const configPath = path.join(agentDir, 'artibot.config.json');
    const empty = {
        version: '',
        agents: [],
        commands: [],
        playbooks: [],
        teamConfig: null,
    };

    if (!fs.existsSync(configPath)) return empty;

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);

        const version = config.version || '';

        // Extract agent category/model info
        const agentMeta: Partial<AgentDef>[] = [];
        const categories: Record<string, string[]> =
            config.agents?.categories || {};
        const modelPolicy = config.agents?.modelPolicy || {};

        // Build category lookup
        const categoryMap = new Map<string, string>();
        for (const [cat, agents] of Object.entries(categories)) {
            for (const a of agents as string[]) {
                categoryMap.set(a, cat);
            }
        }

        // Build model tier lookup
        const modelMap = new Map<string, string>();
        for (const [tier, def] of Object.entries(modelPolicy)) {
            for (const a of (def as any).agents as string[]) {
                modelMap.set(a, tier);
            }
        }

        // All unique agent IDs
        const allAgentIds = new Set<string>();
        for (const agents of Object.values(categories)) {
            for (const a of agents as string[]) allAgentIds.add(a);
        }

        for (const id of allAgentIds) {
            agentMeta.push({
                id,
                category: categoryMap.get(id),
                modelTier: modelMap.get(id),
            });
        }

        // Commands from taskBased
        const commands: CommandDef[] = [];
        const taskBased: Record<string, string> =
            config.agents?.taskBased || {};
        for (const [command, agent] of Object.entries(taskBased)) {
            commands.push({ command, agent, source: 'config' });
        }

        // Playbooks
        const playbooks: PlaybookDef[] = [];
        const rawPlaybooks: Record<string, string> =
            config.team?.playbooks || {};
        const playbookMeta: Record<string, any> =
            config.team?.playbookMeta || {};
        for (const [id, flow] of Object.entries(rawPlaybooks)) {
            const meta = playbookMeta[id] || {};
            playbooks.push({
                id,
                flow,
                description: meta.description,
                domain: meta.domain,
                tags: meta.tags,
            });
        }

        // Team config
        let teamConfig: TeamConfig | null = null;
        if (config.team) {
            teamConfig = {
                enabled: config.team.enabled ?? true,
                engine: config.team.engine || '',
                maxTeammates: config.team.maxTeammates ?? null,
                ctoAgent: config.team.ctoAgent || 'orchestrator',
                levels: config.team.levels || {},
                playbooks: rawPlaybooks,
            };
        }

        return { version, agents: agentMeta, commands, playbooks, teamConfig };
    } catch (err) {
        console.error(
            '[artibot-registry] Failed to parse artibot.config.json:',
            err,
        );
        return empty;
    }
}

function scanAgents(agentDir: string): AgentDef[] {
    const agentsDir = path.join(agentDir, 'agents');
    if (!fs.existsSync(agentsDir)) return [];

    try {
        const files = fs
            .readdirSync(agentsDir)
            .filter((f) => f.endsWith('.md'));
        return files.map((f) => {
            const id = f.replace(/\.md$/, '');
            return {
                id,
                name: id
                    .split('-')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' '),
                filePath: path.join(agentsDir, f),
            };
        });
    } catch {
        return [];
    }
}

function scanSkills(agentDir: string): SkillDef[] {
    const skillsDir = path.join(agentDir, 'skills');
    if (!fs.existsSync(skillsDir)) return [];

    try {
        const dirs = fs
            .readdirSync(skillsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory());

        const skills: SkillDef[] = [];
        for (const dir of dirs) {
            const skillFile = path.join(skillsDir, dir.name, 'SKILL.md');
            if (!fs.existsSync(skillFile)) continue;

            try {
                const content = fs.readFileSync(skillFile, 'utf-8');
                const fm = parseFrontmatter(content);

                skills.push({
                    id: dir.name,
                    name: fm.name || dir.name,
                    description:
                        typeof fm.description === 'string'
                            ? fm.description.trim().split('\n')[0]
                            : dir.name,
                    triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
                    platforms: Array.isArray(fm.platforms) ? fm.platforms : [],
                    category: fm.category || '',
                    filePath: skillFile,
                });
            } catch {
                // Skip malformed skill files
            }
        }
        return skills;
    } catch {
        return [];
    }
}

// ── Main API ────────────────────────────────────────────────────────────────

let cachedRegistry: ArtibotRegistry | null = null;
let watcher: fs.FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scanArtibotDir(projectDir: string): ArtibotRegistry {
    const agentDir = path.join(projectDir, '.agent');

    if (!fs.existsSync(agentDir)) {
        console.log(
            '[artibot-registry] .agent/ directory not found at',
            agentDir,
        );
        return {
            version: '',
            agents: [],
            skills: [],
            commands: [],
            playbooks: [],
            teamConfig: null,
            lastScanned: Date.now(),
        };
    }

    console.log('[artibot-registry] Scanning .agent/ directory...');

    const config = scanConfig(agentDir);
    const agentFiles = scanAgents(agentDir);
    const skills = scanSkills(agentDir);

    // Merge agent file data with config metadata
    const agents: AgentDef[] = agentFiles.map((af) => {
        const configMeta = config.agents.find((ca) => ca.id === af.id);
        return {
            ...af,
            category: configMeta?.category,
            modelTier: configMeta?.modelTier,
        };
    });

    // Add any agents from config that don't have .md files
    for (const ca of config.agents) {
        if (!agents.find((a) => a.id === ca.id) && ca.id) {
            agents.push({
                id: ca.id,
                name: ca.id
                    .split('-')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' '),
                filePath: '',
                category: ca.category,
                modelTier: ca.modelTier,
            });
        }
    }

    cachedRegistry = {
        version: config.version,
        agents,
        skills,
        commands: config.commands,
        playbooks: config.playbooks,
        teamConfig: config.teamConfig,
        lastScanned: Date.now(),
    };

    console.log(
        `[artibot-registry] Loaded: ${agents.length} agents, ${skills.length} skills, ${config.commands.length} commands, ${config.playbooks.length} playbooks`,
    );

    return cachedRegistry;
}

export function getRegistry(): ArtibotRegistry | null {
    return cachedRegistry;
}

export function watchArtibotDir(
    projectDir: string,
    onChange: (registry: ArtibotRegistry) => void,
): void {
    const agentDir = path.join(projectDir, '.agent');
    if (!fs.existsSync(agentDir)) return;

    // Stop previous watcher if any
    stopWatching();

    try {
        watcher = fs.watch(
            agentDir,
            { recursive: true },
            (_eventType, filename) => {
                if (!filename) return;

                // Only react to relevant file changes
                const ext = path.extname(filename).toLowerCase();
                if (ext !== '.md' && ext !== '.json') return;

                // Debounce: wait 500ms after last change before rescanning
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    console.log(
                        `[artibot-registry] File changed: ${filename}, rescanning...`,
                    );
                    const registry = scanArtibotDir(projectDir);
                    onChange(registry);
                }, 500);
            },
        );

        console.log('[artibot-registry] Watching .agent/ for changes');
    } catch (err) {
        console.error(
            '[artibot-registry] Failed to watch .agent/ directory:',
            err,
        );
    }
}

export function stopWatching(): void {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
}
