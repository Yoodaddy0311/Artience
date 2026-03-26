/**
 * MeetingManager — 에이전트 미팅(합의) 시스템.
 *
 * 여러 에이전트를 참여시켜 특정 주제에 대한 의견 수집 → 합의 도출.
 * ChatSessionManager의 fallback 모드를 활용하여 각 에이전트에게
 * 의견을 요청하고, 라운드 기반으로 합의를 진행한다.
 *
 * 흐름:
 *   createMeeting(topic, participantIds) → Meeting 생성
 *   startMeeting(meetingId) → 라운드 시작
 *     → collectOpinions() → 각 에이전트 의견 수집
 *     → resolveConsensus() → 합의 분석
 *     → 최대 5라운드 반복 or 합의 도달 시 종료
 *   stopMeeting(meetingId) → 수동 중단
 */

import { EventEmitter } from 'events';
import { type ChatSessionManager } from './chat-session-manager';
import { AGENT_PERSONAS } from '../src/data/agent-personas';
import { taskScheduler } from './task-scheduler';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MeetingParticipant {
    agentId: string;
    agentName: string;
}

export interface MeetingOpinion {
    agentId: string;
    opinion: string;
    vote: 'approve' | 'hold' | 'revise';
}

export interface MeetingRound {
    roundNumber: number;
    opinions: MeetingOpinion[];
    consensus: 'approved' | 'hold' | 'revision' | 'pending';
}

export interface Meeting {
    id: string;
    topic: string;
    participants: MeetingParticipant[];
    rounds: MeetingRound[];
    status: 'waiting' | 'in_progress' | 'completed' | 'cancelled';
    createdAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_ROUNDS = 5;
const ROUND_TIMEOUT_MS = 60_000;

// ── MeetingManager ─────────────────────────────────────────────────────────

class MeetingManager extends EventEmitter {
    private meetings = new Map<string, Meeting>();
    private chatSessionManager: ChatSessionManager | null = null;
    private abortControllers = new Map<string, AbortController>();

    /**
     * Inject ChatSessionManager (called from main.ts after both are created).
     */
    init(manager: ChatSessionManager): void {
        this.chatSessionManager = manager;
    }

    /**
     * Create a new meeting with given topic and participant agent IDs.
     */
    createMeeting(
        topic: string,
        participantIds: string[],
    ): { success: boolean; meetingId?: string; error?: string } {
        if (!this.chatSessionManager) {
            return {
                success: false,
                error: 'ChatSessionManager not initialized',
            };
        }

        const participants: MeetingParticipant[] = [];
        for (const id of participantIds) {
            const persona = AGENT_PERSONAS[id];
            if (!persona) {
                return { success: false, error: `Unknown agent: ${id}` };
            }
            participants.push({
                agentId: id,
                agentName: id.charAt(0).toUpperCase() + id.slice(1),
            });
        }

        if (participants.length < 2) {
            return {
                success: false,
                error: 'At least 2 participants required',
            };
        }

        const meetingId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const meeting: Meeting = {
            id: meetingId,
            topic,
            participants,
            rounds: [],
            status: 'waiting',
            createdAt: Date.now(),
        };

        this.meetings.set(meetingId, meeting);
        console.log(
            `[MeetingManager] Meeting created: ${meetingId} (${participants.length} participants)`,
        );

        return { success: true, meetingId };
    }

    /**
     * Start the meeting — runs rounds until consensus or MAX_ROUNDS.
     */
    async startMeeting(
        meetingId: string,
    ): Promise<{ success: boolean; error?: string }> {
        const meeting = this.meetings.get(meetingId);
        if (!meeting) {
            return { success: false, error: 'Meeting not found' };
        }
        if (meeting.status === 'in_progress') {
            return { success: false, error: 'Meeting already in progress' };
        }

        meeting.status = 'in_progress';
        const ac = new AbortController();
        this.abortControllers.set(meetingId, ac);

        // Run rounds asynchronously
        this.runMeetingLoop(meeting, ac.signal).catch((err) => {
            console.error(`[MeetingManager] Meeting loop error:`, err.message);
        });

        return { success: true };
    }

    /**
     * Stop a running meeting.
     */
    stopMeeting(meetingId: string): { success: boolean; error?: string } {
        const meeting = this.meetings.get(meetingId);
        if (!meeting) {
            return { success: false, error: 'Meeting not found' };
        }

        const ac = this.abortControllers.get(meetingId);
        if (ac) {
            ac.abort();
            this.abortControllers.delete(meetingId);
        }

        meeting.status = 'cancelled';
        this.emit('meeting:end', meetingId, {
            status: 'cancelled',
            rounds: meeting.rounds,
        });

        console.log(`[MeetingManager] Meeting stopped: ${meetingId}`);
        return { success: true };
    }

    /**
     * Get meeting data.
     */
    getMeeting(meetingId: string): Meeting | undefined {
        return this.meetings.get(meetingId);
    }

    // ── Internal: meeting loop ─────────────────────────────────────────────

    private async runMeetingLoop(
        meeting: Meeting,
        signal: AbortSignal,
    ): Promise<void> {
        for (let round = 1; round <= MAX_ROUNDS; round++) {
            if (signal.aborted) break;

            this.emit('round:start', meeting.id, round);
            console.log(
                `[MeetingManager] Round ${round} starting for ${meeting.id}`,
            );

            // Collect opinions from all participants
            const opinions = await this.collectOpinions(meeting, round, signal);
            if (signal.aborted) break;

            // Resolve consensus
            const consensus = this.resolveConsensus(opinions);

            const meetingRound: MeetingRound = {
                roundNumber: round,
                opinions,
                consensus,
            };

            meeting.rounds.push(meetingRound);
            this.emit('consensus:reached', meeting.id, meetingRound);

            // If consensus reached, stop
            if (consensus === 'approved') {
                meeting.status = 'completed';
                break;
            }

            // If last round, mark completed regardless
            if (round === MAX_ROUNDS) {
                meeting.status = 'completed';
                break;
            }
        }

        this.abortControllers.delete(meeting.id);

        const result = {
            status: meeting.status,
            rounds: meeting.rounds,
            finalConsensus:
                meeting.rounds.length > 0
                    ? meeting.rounds[meeting.rounds.length - 1].consensus
                    : ('pending' as const),
        };

        this.emit('meeting:end', meeting.id, result);

        // Fan out consensus into per-agent tasks
        if (
            result.finalConsensus === 'approved' ||
            result.status === 'completed'
        ) {
            this.fanOutConsensus(meeting);
        }

        // Send as mail report to mainWindow
        this.emitMailReport(meeting);

        console.log(
            `[MeetingManager] Meeting ${meeting.id} ended: ${result.finalConsensus}`,
        );
    }

    // ── Internal: collect opinions ─────────────────────────────────────────

    private async collectOpinions(
        meeting: Meeting,
        roundNumber: number,
        signal: AbortSignal,
    ): Promise<MeetingOpinion[]> {
        const opinions: MeetingOpinion[] = [];

        // Previous round context for follow-up rounds
        const prevRound =
            meeting.rounds.length > 0
                ? meeting.rounds[meeting.rounds.length - 1]
                : null;

        const prevContext = prevRound
            ? `\n\n이전 라운드 결과:\n${prevRound.opinions
                  .map((o) => `- ${o.agentId}: ${o.vote} — ${o.opinion}`)
                  .join('\n')}\n합의: ${prevRound.consensus}`
            : '';

        // Collect from each participant sequentially to avoid overwhelming CLI
        for (const participant of meeting.participants) {
            if (signal.aborted) break;

            const prompt = this.buildOpinionPrompt(
                meeting.topic,
                participant,
                roundNumber,
                prevContext,
            );

            try {
                const opinion = await this.askAgent(
                    participant,
                    prompt,
                    signal,
                );
                opinions.push(opinion);
                this.emit('opinion:received', meeting.id, opinion);
            } catch (err: any) {
                if (signal.aborted) break;
                console.warn(
                    `[MeetingManager] Failed to get opinion from ${participant.agentId}:`,
                    err.message,
                );
                // Add a timeout/error opinion
                opinions.push({
                    agentId: participant.agentId,
                    opinion: '(응답 없음 — 타임아웃 또는 오류)',
                    vote: 'hold',
                });
                this.emit(
                    'opinion:received',
                    meeting.id,
                    opinions[opinions.length - 1],
                );
            }
        }

        return opinions;
    }

    private buildOpinionPrompt(
        topic: string,
        participant: MeetingParticipant,
        roundNumber: number,
        prevContext: string,
    ): string {
        const persona = AGENT_PERSONAS[participant.agentId];
        const roleDesc = persona ? `${persona.role} 역할의` : '';

        return [
            `[미팅 라운드 ${roundNumber}]`,
            `너는 ${roleDesc} ${participant.agentName}이야.`,
            `주제: "${topic}"`,
            prevContext,
            '',
            '다음 형식으로 답변해줘:',
            '투표: approve / hold / revise 중 하나',
            '의견: 한두 문장으로 간결하게',
            '',
            '예시:',
            '투표: approve',
            '의견: 이 방향이 좋습니다. 구현해도 됩니다.',
        ].join('\n');
    }

    // ── Internal: ask a single agent ───────────────────────────────────────

    private askAgent(
        participant: MeetingParticipant,
        prompt: string,
        signal: AbortSignal,
    ): Promise<MeetingOpinion> {
        return new Promise((resolve, reject) => {
            if (!this.chatSessionManager) {
                return reject(new Error('ChatSessionManager not initialized'));
            }

            let responseText = '';
            let settled = false;

            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    resolve({
                        agentId: participant.agentId,
                        opinion: '(타임아웃)',
                        vote: 'hold',
                    });
                }
            }, ROUND_TIMEOUT_MS);

            const onAbort = () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    cleanup();
                    reject(new Error('Aborted'));
                }
            };

            signal.addEventListener('abort', onAbort, { once: true });

            const onStream = (agentId: string, event: any) => {
                if (agentId !== participant.agentId) return;
                if (event.type === 'text' && !event.partial) {
                    responseText += event.content;
                } else if (event.type === 'result') {
                    responseText += event.content || '';
                }
            };

            const onEnd = (agentId: string) => {
                if (agentId !== participant.agentId) return;
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    cleanup();
                    resolve(
                        this.parseOpinion(participant.agentId, responseText),
                    );
                }
            };

            const cleanup = () => {
                this.chatSessionManager!.removeListener('stream', onStream);
                this.chatSessionManager!.removeListener('response:end', onEnd);
                signal.removeEventListener('abort', onAbort);
            };

            this.chatSessionManager.on('stream', onStream);
            this.chatSessionManager.on('response:end', onEnd);

            // Send message via ChatSessionManager
            // Ensure session exists first, then send
            const cwd = process.cwd();
            this.chatSessionManager
                .createSession(participant.agentId, participant.agentName, cwd)
                .then(() => {
                    if (!settled) {
                        this.chatSessionManager!.sendMessage(
                            participant.agentId,
                            prompt,
                        );
                    }
                })
                .catch((err) => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeout);
                        cleanup();
                        reject(err);
                    }
                });
        });
    }

    // ── Internal: parse agent response into vote + opinion ──────────────────

    private parseOpinion(agentId: string, text: string): MeetingOpinion {
        const lower = text.toLowerCase();

        let vote: 'approve' | 'hold' | 'revise' = 'hold';
        if (/투표\s*:\s*approve/i.test(text) || /\bapprove\b/i.test(lower)) {
            vote = 'approve';
        } else if (
            /투표\s*:\s*revise/i.test(text) ||
            /\brevise\b/i.test(lower)
        ) {
            vote = 'revise';
        }

        // Extract opinion line
        const opinionMatch = text.match(/의견\s*:\s*(.+)/);
        const opinion = opinionMatch
            ? opinionMatch[1].trim()
            : text.slice(0, 200).trim() || '(의견 없음)';

        return { agentId, opinion, vote };
    }

    // ── Internal: resolve consensus from opinions ──────────────────────────

    private resolveConsensus(
        opinions: MeetingOpinion[],
    ): 'approved' | 'hold' | 'revision' | 'pending' {
        if (opinions.length === 0) return 'pending';

        const votes = opinions.map((o) => o.vote);
        const approveCount = votes.filter((v) => v === 'approve').length;
        const reviseCount = votes.filter((v) => v === 'revise').length;
        const total = votes.length;

        // 2/3 majority for approval
        if (approveCount >= Math.ceil((total * 2) / 3)) {
            return 'approved';
        }

        // Any revise votes → revision needed
        if (reviseCount > 0) {
            return 'revision';
        }

        return 'hold';
    }

    // ── Internal: fan out consensus into per-agent tasks ──────────────────

    private fanOutConsensus(meeting: Meeting): void {
        const lastRound = meeting.rounds[meeting.rounds.length - 1];
        if (!lastRound) return;

        const approvedOpinions = lastRound.opinions.filter(
            (o) => o.vote === 'approve',
        );

        // Create a task for each participant based on the meeting topic
        // and their stated opinion (which typically contains their approach)
        for (const participant of meeting.participants) {
            const opinion = lastRound.opinions.find(
                (o) => o.agentId === participant.agentId,
            );

            const description = opinion
                ? `[미팅 합의] ${meeting.topic} — ${opinion.opinion}`
                : `[미팅 합의] ${meeting.topic}`;

            const taskId = taskScheduler.enqueue({
                description,
                priority: 'high',
                assignedAgent: participant.agentId,
            });

            console.log(
                `[MeetingManager] Fan-out task ${taskId} → ${participant.agentId}`,
            );
        }

        this.emit('fanout:complete', meeting.id, {
            taskCount: meeting.participants.length,
            participantIds: meeting.participants.map((p) => p.agentId),
        });
    }

    // ── Internal: emit mail report ─────────────────────────────────────────

    private emitMailReport(meeting: Meeting): void {
        const lastRound = meeting.rounds[meeting.rounds.length - 1];
        const finalConsensus = lastRound?.consensus || 'pending';

        const body = [
            `## 미팅 결과: ${meeting.topic}`,
            '',
            `**상태**: ${meeting.status}`,
            `**라운드 수**: ${meeting.rounds.length}`,
            `**최종 합의**: ${finalConsensus}`,
            '',
            ...meeting.rounds
                .map((r) => [
                    `### 라운드 ${r.roundNumber}`,
                    ...r.opinions.map(
                        (o) => `- **${o.agentId}** [${o.vote}]: ${o.opinion}`,
                    ),
                    `합의: ${r.consensus}`,
                    '',
                ])
                .flat(),
        ].join('\n');

        // This will be forwarded by main.ts to mainWindow via 'mail:new-report'
        this.emit('mail:report', {
            fromAgentId: 'meeting-manager',
            fromAgentName: 'Meeting Manager',
            subject: `미팅 결과: ${meeting.topic} — ${finalConsensus}`,
            body,
            type: 'report' as const,
            timestamp: Date.now(),
        });
    }
}

// ── Exported pure functions (for testing) ──────────────────────────────────

export function resolveConsensus(
    opinions: MeetingOpinion[],
): 'approved' | 'hold' | 'revision' | 'pending' {
    if (opinions.length === 0) return 'pending';
    const votes = opinions.map((o) => o.vote);
    const approveCount = votes.filter((v) => v === 'approve').length;
    const reviseCount = votes.filter((v) => v === 'revise').length;
    const total = votes.length;
    if (approveCount >= Math.ceil((total * 2) / 3)) return 'approved';
    if (reviseCount > 0) return 'revision';
    return 'hold';
}

export function parseOpinion(agentId: string, text: string): MeetingOpinion {
    const lower = text.toLowerCase();
    let vote: 'approve' | 'hold' | 'revise' = 'hold';
    if (/투표\s*:\s*approve/i.test(text) || /\bapprove\b/i.test(lower)) {
        vote = 'approve';
    } else if (/투표\s*:\s*revise/i.test(text) || /\brevise\b/i.test(lower)) {
        vote = 'revise';
    }
    const opinionMatch = text.match(/의견\s*:\s*(.+)/);
    const opinion = opinionMatch
        ? opinionMatch[1].trim()
        : text.slice(0, 200).trim() || '(의견 없음)';
    return { agentId, opinion, vote };
}

export function buildOpinionPrompt(
    topic: string,
    participant: MeetingParticipant,
    roundNumber: number,
    prevContext: string,
): string {
    const persona = AGENT_PERSONAS[participant.agentId];
    const roleDesc = persona ? `${persona.role} 역할의` : '';
    return [
        `[미팅 라운드 ${roundNumber}]`,
        `너는 ${roleDesc} ${participant.agentName}이야.`,
        `주제: "${topic}"`,
        prevContext,
        '',
        '다음 형식으로 답변해줘:',
        '투표: approve / hold / revise 중 하나',
        '의견: 한두 문장으로 간결하게',
        '',
        '예시:',
        '투표: approve',
        '의견: 이 방향이 좋습니다. 구현해도 됩니다.',
    ].join('\n');
}

// ── Singleton export ───────────────────────────────────────────────────────

export const meetingManager = new MeetingManager();
