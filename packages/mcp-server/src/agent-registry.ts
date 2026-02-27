/**
 * Agent Registry — maps artibot plugin agents to Dokba Town job definitions.
 *
 * Reads artibot.config.json to build a mapping between the plugin's 26 agents
 * and the Town's 25 job slots (JobDefinitionId). Uses category, taskBased
 * mapping, and model policy for prioritized job recommendations.
 */

import type { JobDefinitionId } from "@dokba/shared-types";

// ── Artibot config shape (subset we need) ──

export interface ArtibotAgentConfig {
  modelPolicy: {
    high: { model: string; agents: string[] };
    medium: { model: string; agents: string[] };
    low: { model: string; agents: string[] };
  };
  categories: Record<string, string[]>;
  taskBased: Record<string, string>;
}

export interface ArtibotConfig {
  version: string;
  agents: ArtibotAgentConfig;
}

// ── Agent → Job mapping table ──

/**
 * Static mapping from artibot agent name to Dokba Town JobDefinitionId.
 * Agents without a direct match are mapped to the closest equivalent.
 */
const AGENT_TO_JOB: Record<string, JobDefinitionId> = {
  // Manager category
  orchestrator: "CTO",
  planner: "PM",
  architect: "CTO",

  // Expert category — engineering
  "frontend-developer": "FE_DEV",
  "backend-developer": "BE_DEV",
  "database-reviewer": "DATA_ENG",
  "performance-engineer": "PERF",
  "mcp-developer": "API_DEV",
  "llm-architect": "AI_ENG",
  "typescript-pro": "FE_LEAD",
  "devops-engineer": "DEVOPS",
  "security-reviewer": "SEC",

  // Builder category
  "code-reviewer": "BE_LEAD",
  "tdd-guide": "QA_AUTO",
  "build-error-resolver": "SRE",
  "refactor-cleaner": "FE_LEAD",

  // Support category
  "doc-updater": "TECH_WRITER",
  "content-marketer": "BRAND",
  "e2e-runner": "QA",
  "marketing-strategist": "PO",
  "data-analyst": "DATA_ENG",
  "presentation-designer": "UI",
  "seo-specialist": "TECH_WRITER",
  "cro-specialist": "UX",
  "ad-specialist": "BRAND",
  "repo-benchmarker": "PERF",
};

/** Priority tiers based on artibot modelPolicy. */
export type AgentTier = "high" | "medium" | "low";

export interface AgentJobMapping {
  agentName: string;
  jobId: JobDefinitionId;
  category: string;
  tier: AgentTier;
}

export class AgentRegistry {
  private mappings: Map<string, AgentJobMapping> = new Map();
  private taskIndex: Map<string, string> = new Map();
  private version = "unknown";

  /**
   * Load the registry from an artibot config object.
   */
  load(config: ArtibotConfig): void {
    this.version = config.version;
    this.mappings.clear();
    this.taskIndex.clear();

    const { modelPolicy, categories, taskBased } = config.agents;

    // Build tier lookup
    const tierMap = new Map<string, AgentTier>();
    for (const agent of modelPolicy.high.agents) tierMap.set(agent, "high");
    for (const agent of modelPolicy.medium.agents) tierMap.set(agent, "medium");
    for (const agent of modelPolicy.low.agents) tierMap.set(agent, "low");

    // Build category lookup
    const catMap = new Map<string, string>();
    for (const [cat, agents] of Object.entries(categories)) {
      for (const agent of agents) catMap.set(agent, cat);
    }

    // Build mappings
    const allAgents = new Set([
      ...modelPolicy.high.agents,
      ...modelPolicy.medium.agents,
      ...modelPolicy.low.agents,
    ]);

    for (const agentName of allAgents) {
      const jobId = AGENT_TO_JOB[agentName];
      if (!jobId) continue; // skip unmapped agents

      this.mappings.set(agentName, {
        agentName,
        jobId,
        category: catMap.get(agentName) ?? "unknown",
        tier: tierMap.get(agentName) ?? "low",
      });
    }

    // Build task index (keyword → agent)
    for (const [keyword, agent] of Object.entries(taskBased)) {
      this.taskIndex.set(keyword.toLowerCase(), agent);
    }
  }

  /**
   * Recommend a Dokba Town job for a given task description.
   * Returns the best matching job + agent, or null if no match.
   */
  recommendJob(taskDescription: string): AgentJobMapping | null {
    const desc = taskDescription.toLowerCase();

    // Try keyword match (longest match first for specificity)
    const keywords = [...this.taskIndex.keys()].sort(
      (a, b) => b.length - a.length,
    );

    for (const keyword of keywords) {
      if (desc.includes(keyword)) {
        const agentName = this.taskIndex.get(keyword)!;
        const mapping = this.mappings.get(agentName);
        if (mapping) return mapping;
      }
    }

    return null;
  }

  /**
   * Get all agent-to-job mappings.
   */
  getAllMappings(): AgentJobMapping[] {
    return [...this.mappings.values()];
  }

  /**
   * Get mappings filtered by category.
   */
  getByCategory(category: string): AgentJobMapping[] {
    return [...this.mappings.values()].filter((m) => m.category === category);
  }

  /**
   * Get the artibot version this registry was built from.
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Get total number of registered agent mappings.
   */
  get size(): number {
    return this.mappings.size;
  }
}
