import Store from 'electron-store';
import { randomUUID } from 'crypto';
import { AGENT_PERSONAS } from '../src/data/agent-personas';
import {
    AffinityMatrix,
    AffinityScore,
    AffinityEvent,
    AffinityTier,
    InteractionLog,
    DecayResult,
    AffinityChangeEvent,
    clamp,
    matrixKey,
    defaultScore,
    normalize,
    createEmptyMatrix,
    getTierFromSynergy,
    getRoleCompatibility,
    normalizeRole,
    INTERACTION_DELTAS,
    QUALITY_MODIFIERS,
    DECAY_CONFIG,
    TIER_BONUSES,
    SynergyBonus,
} from '../src/types/affinity';

// ── Store Schema ──

interface AffinityStoreSchema {
    version: number;
    matrix: AffinityMatrix;
    decayLastApplied: number;
}

const MAX_HISTORY = 30;
const SAVE_DEBOUNCE_MS = 1000;

// ── AffinityManager ──

class AffinityManager {
    private store: Store<AffinityStoreSchema> | null = null;
    private matrix: AffinityMatrix = createEmptyMatrix();
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private changeListeners: ((change: AffinityChangeEvent) => void)[] = [];
    private tierUpListeners: ((data: {
        fromAgentId: string;
        toAgentId: string;
        newTier: AffinityTier;
    }) => void)[] = [];

    init(): void {
        if (this.store) return;
        this.store = new Store<AffinityStoreSchema>({
            name: 'artience-affinity-matrix',
            defaults: {
                version: 1,
                matrix: createEmptyMatrix(),
                decayLastApplied: 0,
            },
        });
        this.matrix = this.store.get('matrix');
    }

    private ensureInit(): void {
        if (!this.store) this.init();
    }

    // ── Event Recording ──

    recordEvent(event: AffinityEvent): {
        success: boolean;
        fromDelta: { trust: number; rapport: number };
        toDelta: { trust: number; rapport: number };
        tierChanged: boolean;
        newTier?: AffinityTier;
    } {
        this.ensureInit();

        if (event.fromAgentId === event.toAgentId) {
            return {
                success: false,
                fromDelta: { trust: 0, rapport: 0 },
                toDelta: { trust: 0, rapport: 0 },
                tierChanged: false,
            };
        }

        const baseDelta = INTERACTION_DELTAS[event.type];
        if (!baseDelta) {
            return {
                success: false,
                fromDelta: { trust: 0, rapport: 0 },
                toDelta: { trust: 0, rapport: 0 },
                tierChanged: false,
            };
        }

        const qualityMod =
            QUALITY_MODIFIERS[event.context?.quality ?? 'normal'];
        const outcomeSign =
            event.context?.outcome === 'failure'
                ? -1
                : event.context?.outcome === 'partial'
                  ? 0.5
                  : 1;

        const trustDelta = Math.round(
            baseDelta.trust * qualityMod.trust * outcomeSign,
        );
        const rapportDelta = Math.round(
            baseDelta.rapport *
                qualityMod.rapport *
                (outcomeSign >= 0 ? 1 : outcomeSign),
        );

        // Apply from → to
        const fromScore = this.getOrCreateScore(
            event.fromAgentId,
            event.toAgentId,
        );
        const oldFromSynergy = fromScore.synergy;
        const oldFromTier = fromScore.unlockedTier;

        fromScore.trust = clamp(fromScore.trust + trustDelta, -100, 100);
        fromScore.rapport = clamp(fromScore.rapport + rapportDelta, -100, 100);
        fromScore.lastInteraction = event.timestamp;
        fromScore.totalInteractions++;
        this.appendHistory(fromScore, event, trustDelta, rapportDelta);
        fromScore.synergy = this.calculateSynergy(fromScore);
        fromScore.unlockedTier = getTierFromSynergy(fromScore.synergy);

        // Emit change for from→to
        if (
            oldFromSynergy !== fromScore.synergy ||
            oldFromTier !== fromScore.unlockedTier
        ) {
            this.emitChange({
                fromAgentId: event.fromAgentId,
                toAgentId: event.toAgentId,
                oldSynergy: oldFromSynergy,
                newSynergy: fromScore.synergy,
                oldTier: oldFromTier,
                newTier: fromScore.unlockedTier,
            });
        }
        if (
            oldFromTier !== fromScore.unlockedTier &&
            this.tierRank(fromScore.unlockedTier) > this.tierRank(oldFromTier)
        ) {
            this.emitTierUp({
                fromAgentId: event.fromAgentId,
                toAgentId: event.toAgentId,
                newTier: fromScore.unlockedTier,
            });
        }

        // Apply to → from (if bilateral)
        let toDelta = { trust: 0, rapport: 0 };
        let tierChanged = oldFromTier !== fromScore.unlockedTier;

        if (baseDelta.bilateral) {
            const toScore = this.getOrCreateScore(
                event.toAgentId,
                event.fromAgentId,
            );
            const oldToSynergy = toScore.synergy;
            const oldToTier = toScore.unlockedTier;

            const toTrustDelta = baseDelta.reverseTrust ?? trustDelta;
            const toRapportDelta = baseDelta.reverseRapport ?? rapportDelta;

            toScore.trust = clamp(toScore.trust + toTrustDelta, -100, 100);
            toScore.rapport = clamp(
                toScore.rapport + toRapportDelta,
                -100,
                100,
            );
            toScore.lastInteraction = event.timestamp;
            toScore.totalInteractions++;
            this.appendHistory(toScore, event, toTrustDelta, toRapportDelta);
            toScore.synergy = this.calculateSynergy(toScore);
            toScore.unlockedTier = getTierFromSynergy(toScore.synergy);

            toDelta = { trust: toTrustDelta, rapport: toRapportDelta };

            if (
                oldToSynergy !== toScore.synergy ||
                oldToTier !== toScore.unlockedTier
            ) {
                this.emitChange({
                    fromAgentId: event.toAgentId,
                    toAgentId: event.fromAgentId,
                    oldSynergy: oldToSynergy,
                    newSynergy: toScore.synergy,
                    oldTier: oldToTier,
                    newTier: toScore.unlockedTier,
                });
            }
            if (
                oldToTier !== toScore.unlockedTier &&
                this.tierRank(toScore.unlockedTier) > this.tierRank(oldToTier)
            ) {
                this.emitTierUp({
                    fromAgentId: event.toAgentId,
                    toAgentId: event.fromAgentId,
                    newTier: toScore.unlockedTier,
                });
            }

            if (oldToTier !== toScore.unlockedTier) tierChanged = true;
        }

        this.updateGlobalStats();
        this.matrix.updatedAt = event.timestamp;
        this.scheduleSave();

        return {
            success: true,
            fromDelta: { trust: trustDelta, rapport: rapportDelta },
            toDelta,
            tierChanged,
            newTier: tierChanged ? fromScore.unlockedTier : undefined,
        };
    }

    // ── Decay ──

    applyDecay(): { decayed: number; tierChanges: number } {
        this.ensureInit();
        const now = Date.now();
        let decayed = 0;
        let tierChanges = 0;

        for (const [key, score] of Object.entries(this.matrix.scores)) {
            if (score.totalInteractions === 0) continue;

            const daysSince = Math.floor(
                (now - score.lastInteraction) / (24 * 60 * 60 * 1000),
            );

            if (daysSince <= DECAY_CONFIG.gracePeriodDays) continue;

            const decayDays = daysSince - DECAY_CONFIG.gracePeriodDays;
            const rapportDecay = decayDays * DECAY_CONFIG.dailyRapportDecay;
            const newRapport = Math.max(
                DECAY_CONFIG.minRapport,
                score.rapport + rapportDecay,
            );

            if (newRapport !== score.rapport) {
                const oldTier = score.unlockedTier;
                score.rapport = newRapport;
                score.synergy = this.calculateSynergy(score);
                score.unlockedTier = getTierFromSynergy(score.synergy);
                decayed++;

                if (oldTier !== score.unlockedTier) {
                    tierChanges++;
                    this.emitChange({
                        fromAgentId: score.fromAgentId,
                        toAgentId: score.toAgentId,
                        oldSynergy: score.synergy, // approximate
                        newSynergy: score.synergy,
                        oldTier,
                        newTier: score.unlockedTier,
                    });
                }
            }
        }

        if (decayed > 0) {
            this.updateGlobalStats();
            this.matrix.updatedAt = now;
        }

        this.store!.set('decayLastApplied', now);
        this.saveNow();

        return { decayed, tierChanges };
    }

    // ── Queries ──

    getMatrix(): AffinityMatrix {
        this.ensureInit();
        return this.matrix;
    }

    getScore(fromAgentId: string, toAgentId: string): AffinityScore {
        this.ensureInit();
        const key = matrixKey(fromAgentId, toAgentId);
        return this.matrix.scores[key] ?? defaultScore(fromAgentId, toAgentId);
    }

    getAgentRelationships(agentId: string): {
        outgoing: AffinityScore[];
        incoming: AffinityScore[];
    } {
        this.ensureInit();
        const outgoing: AffinityScore[] = [];
        const incoming: AffinityScore[] = [];

        for (const score of Object.values(this.matrix.scores)) {
            if (score.fromAgentId === agentId) outgoing.push(score);
            if (score.toAgentId === agentId) incoming.push(score);
        }

        outgoing.sort((a, b) => b.synergy - a.synergy);
        incoming.sort((a, b) => b.synergy - a.synergy);

        return { outgoing, incoming };
    }

    getTopPairs(
        limit = 10,
    ): { pair: [string, string]; synergy: number; tier: AffinityTier }[] {
        this.ensureInit();
        return Object.values(this.matrix.scores)
            .sort((a, b) => b.synergy - a.synergy)
            .slice(0, limit)
            .map((s) => ({
                pair: [s.fromAgentId, s.toAgentId] as [string, string],
                synergy: s.synergy,
                tier: s.unlockedTier,
            }));
    }

    getTierDistribution(): Record<AffinityTier, number> {
        this.ensureInit();
        const dist: Record<AffinityTier, number> = {
            stranger: 0,
            acquaintance: 0,
            colleague: 0,
            partner: 0,
            soulmate: 0,
        };

        for (const score of Object.values(this.matrix.scores)) {
            dist[score.unlockedTier]++;
        }

        return dist;
    }

    getSynergyBonus(fromAgentId: string, toAgentId: string): SynergyBonus {
        const score = this.getScore(fromAgentId, toAgentId);
        return TIER_BONUSES[score.unlockedTier];
    }

    calculateTeamSynergy(members: string[]): number {
        this.ensureInit();
        let totalSynergy = 0;
        let pairCount = 0;

        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                const key = matrixKey(members[i], members[j]);
                const score = this.matrix.scores[key];
                totalSynergy += score?.synergy ?? 0;
                pairCount++;
            }
        }

        return pairCount > 0 ? Math.round(totalSynergy / pairCount) : 0;
    }

    // ── Reset ──

    resetPair(fromAgentId: string, toAgentId: string): boolean {
        this.ensureInit();
        const key = matrixKey(fromAgentId, toAgentId);
        if (!this.matrix.scores[key]) return false;
        delete this.matrix.scores[key];
        this.updateGlobalStats();
        this.saveNow();
        return true;
    }

    resetAll(): void {
        this.ensureInit();
        this.matrix = createEmptyMatrix();
        this.matrix.updatedAt = Date.now();
        this.saveNow();
    }

    // ── Event Listeners ──

    onAffinityChange(
        listener: (change: AffinityChangeEvent) => void,
    ): () => void {
        this.changeListeners.push(listener);
        return () => {
            this.changeListeners = this.changeListeners.filter(
                (l) => l !== listener,
            );
        };
    }

    onTierUp(
        listener: (data: {
            fromAgentId: string;
            toAgentId: string;
            newTier: AffinityTier;
        }) => void,
    ): () => void {
        this.tierUpListeners.push(listener);
        return () => {
            this.tierUpListeners = this.tierUpListeners.filter(
                (l) => l !== listener,
            );
        };
    }

    // ── Synergy Calculation ──

    calculateSynergy(score: AffinityScore): number {
        const trustNorm = normalize(score.trust);
        const rapportNorm = normalize(score.rapport);

        const fromRole = this.getAgentRole(score.fromAgentId);
        const toRole = this.getAgentRole(score.toAgentId);
        const roleCompat = getRoleCompatibility(fromRole, toRole);

        // Skill diversity: use role distance as proxy (different roles = higher diversity)
        const skillDiv = this.getSkillDiversity(
            score.fromAgentId,
            score.toAgentId,
        );

        const synergy = Math.round(
            0.4 * trustNorm +
                0.2 * rapportNorm +
                0.3 * roleCompat +
                0.1 * skillDiv,
        );

        return clamp(synergy, 0, 100);
    }

    // ── Private Helpers ──

    private getOrCreateScore(from: string, to: string): AffinityScore {
        const key = matrixKey(from, to);
        if (!this.matrix.scores[key]) {
            this.matrix.scores[key] = defaultScore(from, to);
        }
        return this.matrix.scores[key];
    }

    private appendHistory(
        score: AffinityScore,
        event: AffinityEvent,
        trustDelta: number,
        rapportDelta: number,
    ): void {
        const outcome: 'positive' | 'neutral' | 'negative' =
            trustDelta > 0 || rapportDelta > 0
                ? 'positive'
                : trustDelta < 0 || rapportDelta < 0
                  ? 'negative'
                  : 'neutral';

        const log: InteractionLog = {
            id: randomUUID(),
            timestamp: event.timestamp,
            type: event.type,
            outcome,
            trustDelta,
            rapportDelta,
            description: this.describeEvent(event),
        };

        score.history.push(log);
        if (score.history.length > MAX_HISTORY) {
            score.history = score.history.slice(-MAX_HISTORY);
        }
    }

    private describeEvent(event: AffinityEvent): string {
        const descriptions: Record<string, string> = {
            task_collaboration: '공동 태스크 수행',
            task_delegation: '태스크 위임',
            code_review: '코드 리뷰',
            p2p_message: '직접 메시지',
            meeting_agree: '미팅 의견 일치',
            meeting_disagree: '미팅 의견 충돌',
            meeting_constructive: '건설적 토론',
            skill_share: '스킬 공유',
            error_help: '에러 해결 도움',
            long_absence: '장기간 미상호작용',
        };
        let desc = descriptions[event.type] ?? event.type;
        if (event.context?.outcome) {
            const outcomeLabels: Record<string, string> = {
                success: '성공',
                failure: '실패',
                partial: '부분 성공',
            };
            desc += ` (${outcomeLabels[event.context.outcome] ?? event.context.outcome})`;
        }
        return desc;
    }

    private getAgentRole(agentId: string): string {
        const persona = AGENT_PERSONAS[agentId];
        return persona?.role ?? 'AI 어시스턴트';
    }

    private getSkillDiversity(agentA: string, agentB: string): number {
        const roleA = normalizeRole(this.getAgentRole(agentA));
        const roleB = normalizeRole(this.getAgentRole(agentB));
        // Same normalized role = low diversity, different = high
        if (roleA === roleB) return 20;
        // Check if they're in related categories
        const compat = getRoleCompatibility(
            this.getAgentRole(agentA),
            this.getAgentRole(agentB),
        );
        // High compatibility often means complementary but different → high diversity
        return clamp(Math.round(compat * 0.8 + 20), 0, 100);
    }

    private updateGlobalStats(): void {
        let totalInteractions = 0;
        let highestSynergy: { pair: string; synergy: number } | null = null;
        const interactionCounts: Record<string, number> = {};

        for (const [key, score] of Object.entries(this.matrix.scores)) {
            totalInteractions += score.totalInteractions;

            if (!highestSynergy || score.synergy > highestSynergy.synergy) {
                highestSynergy = { pair: key, synergy: score.synergy };
            }

            interactionCounts[score.fromAgentId] =
                (interactionCounts[score.fromAgentId] ?? 0) +
                score.totalInteractions;
        }

        let mostActive: { agentId: string; interactions: number } | null = null;
        for (const [agentId, count] of Object.entries(interactionCounts)) {
            if (!mostActive || count > mostActive.interactions) {
                mostActive = { agentId, interactions: count };
            }
        }

        this.matrix.globalStats = {
            totalInteractions,
            highestSynergy,
            mostActive,
        };
    }

    private tierRank(tier: AffinityTier): number {
        const ranks: Record<AffinityTier, number> = {
            stranger: 0,
            acquaintance: 1,
            colleague: 2,
            partner: 3,
            soulmate: 4,
        };
        return ranks[tier];
    }

    private emitChange(change: AffinityChangeEvent): void {
        for (const listener of this.changeListeners) {
            try {
                listener(change);
            } catch {
                /* ignore listener errors */
            }
        }
    }

    private emitTierUp(data: {
        fromAgentId: string;
        toAgentId: string;
        newTier: AffinityTier;
    }): void {
        for (const listener of this.tierUpListeners) {
            try {
                listener(data);
            } catch {
                /* ignore listener errors */
            }
        }
    }

    private scheduleSave(): void {
        if (this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveNow();
            this.saveTimer = null;
        }, SAVE_DEBOUNCE_MS);
    }

    private saveNow(): void {
        if (!this.store) return;
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        this.store.set('matrix', this.matrix);
    }

    /** 앱 종료 시 호출 — 남은 debounce flush */
    shutdown(): void {
        this.saveNow();
    }
}

export const affinityManager = new AffinityManager();
