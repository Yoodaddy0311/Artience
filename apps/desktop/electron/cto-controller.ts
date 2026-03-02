/**
 * CTO Controller — Dokba(CTO) 전용 팀 세션 관리.
 *
 * Claude CLI의 --agents 플래그를 활용하여 CTO가 25명의 팀원 에이전트를
 * 서브에이전트로 등록하고, 유저의 자연어 지시를 팀원에게 위임한다.
 *
 * 흐름:
 *   User → "Rio에게 API 만들어줘"
 *     → CTO(Dokba) Claude 세션에 전달
 *     → Claude가 내부적으로 Rio 서브에이전트 spawn
 *     → 결과를 JSON stream으로 리포트
 *     → ChatView에 구조화된 표시
 */

import { type ChatSessionManager } from './chat-session-manager';
import { AGENT_PERSONAS, buildSystemPrompt } from '../src/data/agent-personas';

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentConfig {
    description: string;
    prompt: string;
    model: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CTO_AGENT_ID = 'raccoon';
const CTO_AGENT_NAME = 'Dokba';

// CTO 전용 시스템 프롬프트
const CTO_SYSTEM_PROMPT = [
    `너는 Dokba, 이 프로젝트의 CTO야. 팀원들에게 작업을 지시하고 결과를 관리해.`,
    `사용 가능한 팀원: ${Object.entries(AGENT_PERSONAS)
        .filter(([key]) => key !== 'dokba')
        .map(([, p]) => `${p.role}`)
        .join(', ')}`,
    `유저가 특정 팀원에게 작업을 지시하면, 적절한 지시를 만들어서 해당 팀원에게 전달해.`,
    `각 팀원의 작업 결과를 유저에게 보고해.`,
    `한국어로 대화하고, 친근한 반말체를 사용해.`,
    `답변은 간결하게 해줘.`,
].join('\n');

// ── CTO Controller ────────────────────────────────────────────────────────

class CTOController {
    private teamSessionActive = false;
    private chatSessionManager: ChatSessionManager | null = null;

    /**
     * Inject ChatSessionManager instance (called from main.ts after both are created).
     */
    init(manager: ChatSessionManager): void {
        this.chatSessionManager = manager;
    }

    /**
     * Build the --agents JSON config from AGENT_PERSONAS.
     * Each agent gets: description, prompt (system prompt), model.
     */
    buildAgentsConfig(): Record<string, AgentConfig> {
        const agents: Record<string, AgentConfig> = {};

        for (const [key, persona] of Object.entries(AGENT_PERSONAS)) {
            // Skip CTO itself
            if (key === 'dokba') continue;

            agents[key] = {
                description: `${persona.role} ${key.charAt(0).toUpperCase() + key.slice(1)}. ${persona.personality}`,
                prompt: buildSystemPrompt(key.charAt(0).toUpperCase() + key.slice(1)),
                model: 'sonnet',
            };
        }

        return agents;
    }

    /**
     * Create a CTO team session with --agents flag.
     * Uses ChatSessionManager.createSession with extraArgs.
     */
    async createTeamSession(cwd: string): Promise<{ success: boolean; error?: string }> {
        if (!this.chatSessionManager) {
            return { success: false, error: 'ChatSessionManager not initialized. Call init() first.' };
        }

        if (this.teamSessionActive && this.chatSessionManager?.hasActiveSession(CTO_AGENT_ID)) {
            return { success: true };
        }

        try {
            const agentsConfig = this.buildAgentsConfig();
            const agentsJson = JSON.stringify(agentsConfig);

            // Pass --agents as extra CLI args to ChatSessionManager
            const extraArgs = ['--agents', agentsJson];

            await this.chatSessionManager.createSession(
                CTO_AGENT_ID,
                CTO_AGENT_NAME,
                cwd,
                extraArgs,
            );

            this.teamSessionActive = true;
            console.log(`[CTOController] Team session created with ${Object.keys(agentsConfig).length} agents`);
            return { success: true };
        } catch (err: any) {
            console.error('[CTOController] Failed to create team session:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Delegate a task to a specific agent via the CTO session.
     * The CTO's Claude instance will route to the appropriate sub-agent.
     */
    async delegateTask(agentName: string, task: string): Promise<{ success: boolean; error?: string }> {
        if (!this.chatSessionManager?.hasActiveSession(CTO_AGENT_ID)) {
            return { success: false, error: 'CTO team session is not active. Create a team session first.' };
        }

        // Build a delegation prompt that the CTO Claude will understand
        const delegationPrompt = `${agentName}에게 다음 작업을 지시해줘: ${task}`;

        this.chatSessionManager?.sendMessage(CTO_AGENT_ID, delegationPrompt);
        return { success: true };
    }

    /**
     * Send a direct message to the CTO session (non-delegation, general chat).
     */
    sendMessage(message: string): void {
        if (!this.chatSessionManager?.hasActiveSession(CTO_AGENT_ID)) {
            console.warn('[CTOController] No active CTO session');
            return;
        }
        this.chatSessionManager?.sendMessage(CTO_AGENT_ID, message);
    }

    /**
     * Close the CTO team session.
     */
    closeTeamSession(): void {
        this.chatSessionManager?.closeSession(CTO_AGENT_ID);
        this.teamSessionActive = false;
        console.log('[CTOController] Team session closed');
    }

    /**
     * Check if team session is active.
     */
    isTeamActive(): boolean {
        return this.teamSessionActive && (this.chatSessionManager?.hasActiveSession(CTO_AGENT_ID) ?? false);
    }

    /**
     * Get the CTO system prompt (for writeSystemPrompt override if needed).
     */
    getCTOSystemPrompt(): string {
        return CTO_SYSTEM_PROMPT;
    }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const ctoController = new CTOController();
export { CTO_AGENT_ID, CTO_AGENT_NAME };
