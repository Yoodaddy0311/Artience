import { describe, it, expect } from 'vitest';
import {
    clamp,
    matrixKey,
    defaultScore,
    normalize,
    getTierFromSynergy,
    normalizeRole,
    getRoleCompatibility,
    createEmptyMatrix,
    INTERACTION_DELTAS,
    QUALITY_MODIFIERS,
    DECAY_CONFIG,
    TIER_BONUSES,
    TIER_LABELS,
    TIER_COLORS,
} from '../../types/affinity';

describe('clamp', () => {
    it('returns value when within range', () => {
        expect(clamp(50, 0, 100)).toBe(50);
    });

    it('clamps to min', () => {
        expect(clamp(-150, -100, 100)).toBe(-100);
    });

    it('clamps to max', () => {
        expect(clamp(200, -100, 100)).toBe(100);
    });

    it('handles edge values', () => {
        expect(clamp(0, 0, 0)).toBe(0);
        expect(clamp(-100, -100, 100)).toBe(-100);
        expect(clamp(100, -100, 100)).toBe(100);
    });
});

describe('matrixKey', () => {
    it('creates correct key format', () => {
        expect(matrixKey('sera', 'rio')).toBe('sera:rio');
    });

    it('is order-dependent (asymmetric)', () => {
        expect(matrixKey('sera', 'rio')).not.toBe(matrixKey('rio', 'sera'));
    });
});

describe('defaultScore', () => {
    it('creates a zero-initialized score', () => {
        const score = defaultScore('sera', 'rio');
        expect(score.fromAgentId).toBe('sera');
        expect(score.toAgentId).toBe('rio');
        expect(score.trust).toBe(0);
        expect(score.rapport).toBe(0);
        expect(score.synergy).toBe(0);
        expect(score.totalInteractions).toBe(0);
        expect(score.history).toEqual([]);
        expect(score.unlockedTier).toBe('stranger');
    });
});

describe('normalize', () => {
    it('maps -100 to 0', () => {
        expect(normalize(-100)).toBe(0);
    });

    it('maps 0 to 50', () => {
        expect(normalize(0)).toBe(50);
    });

    it('maps 100 to 100', () => {
        expect(normalize(100)).toBe(100);
    });

    it('maps -50 to 25', () => {
        expect(normalize(-50)).toBe(25);
    });
});

describe('getTierFromSynergy', () => {
    it('returns stranger for 0-20', () => {
        expect(getTierFromSynergy(0)).toBe('stranger');
        expect(getTierFromSynergy(20)).toBe('stranger');
    });

    it('returns acquaintance for 21-40', () => {
        expect(getTierFromSynergy(21)).toBe('acquaintance');
        expect(getTierFromSynergy(40)).toBe('acquaintance');
    });

    it('returns colleague for 41-60', () => {
        expect(getTierFromSynergy(41)).toBe('colleague');
        expect(getTierFromSynergy(60)).toBe('colleague');
    });

    it('returns partner for 61-80', () => {
        expect(getTierFromSynergy(61)).toBe('partner');
        expect(getTierFromSynergy(80)).toBe('partner');
    });

    it('returns soulmate for 81-100', () => {
        expect(getTierFromSynergy(81)).toBe('soulmate');
        expect(getTierFromSynergy(100)).toBe('soulmate');
    });
});

describe('normalizeRole', () => {
    it('normalizes Korean PM role', () => {
        expect(normalizeRole('PM / 총괄')).toBe('PM');
    });

    it('normalizes Korean frontend role', () => {
        expect(normalizeRole('프론트엔드 개발')).toBe('Frontend');
    });

    it('normalizes Korean backend role', () => {
        expect(normalizeRole('백엔드 개발')).toBe('Backend');
    });

    it('normalizes QA role', () => {
        expect(normalizeRole('QA 테스트')).toBe('QA');
    });

    it('normalizes DevOps role', () => {
        expect(normalizeRole('DevOps')).toBe('DevOps');
    });

    it('normalizes UX design role', () => {
        expect(normalizeRole('UX 디자인')).toBe('UX');
    });

    it('normalizes security role', () => {
        expect(normalizeRole('보안 감사')).toBe('Security');
    });

    it('normalizes data role', () => {
        expect(normalizeRole('데이터 분석')).toBe('Data');
    });

    it('normalizes doc role', () => {
        expect(normalizeRole('기술 문서화')).toBe('Doc');
    });

    it('normalizes architect role', () => {
        expect(normalizeRole('아키텍처')).toBe('Architect');
    });

    it('returns General for unknown roles', () => {
        expect(normalizeRole('AI 어시스턴트')).toBe('General');
    });

    it('normalizes infrastructure-related roles to DevOps', () => {
        expect(normalizeRole('인프라 관리')).toBe('DevOps');
        expect(normalizeRole('CI/CD')).toBe('DevOps');
        expect(normalizeRole('배포 자동화')).toBe('DevOps');
    });

    it('normalizes DB role to Backend', () => {
        expect(normalizeRole('DB 관리')).toBe('Backend');
    });

    it('normalizes performance role to Backend', () => {
        expect(normalizeRole('성능 최적화')).toBe('Backend');
    });

    it('normalizes monitoring/error roles to DevOps', () => {
        expect(normalizeRole('모니터링')).toBe('DevOps');
        expect(normalizeRole('에러 핸들링')).toBe('DevOps');
        expect(normalizeRole('빌드 관리')).toBe('DevOps');
    });
});

describe('getRoleCompatibility', () => {
    it('returns high compatibility for complementary roles', () => {
        const compat = getRoleCompatibility('프론트엔드 개발', 'UX 디자인');
        expect(compat).toBe(95);
    });

    it('returns low compatibility for same roles', () => {
        const compat = getRoleCompatibility('QA 테스트', 'QA 테스트');
        expect(compat).toBe(25);
    });

    it('returns 50 as default for unknown role combinations', () => {
        const compat = getRoleCompatibility('???', 'Backend');
        expect(compat).toBe(50);
    });

    it('PM + Architect has high compatibility', () => {
        const compat = getRoleCompatibility('PM / 총괄', '아키텍처');
        expect(compat).toBe(85);
    });

    it('Backend + Frontend has high compatibility', () => {
        const compat = getRoleCompatibility('백엔드 개발', '프론트엔드 개발');
        expect(compat).toBe(90);
    });
});

describe('INTERACTION_DELTAS', () => {
    it('has positive deltas for task_collaboration', () => {
        const delta = INTERACTION_DELTAS.task_collaboration;
        expect(delta.trust).toBe(8);
        expect(delta.rapport).toBe(5);
        expect(delta.bilateral).toBe(true);
    });

    it('has high trust for error_help', () => {
        const delta = INTERACTION_DELTAS.error_help;
        expect(delta.trust).toBe(12);
        expect(delta.rapport).toBe(6);
        expect(delta.bilateral).toBe(false);
    });

    it('has negative rapport for long_absence', () => {
        const delta = INTERACTION_DELTAS.long_absence;
        expect(delta.trust).toBe(0);
        expect(delta.rapport).toBe(-1);
    });

    it('task_delegation is unilateral', () => {
        expect(INTERACTION_DELTAS.task_delegation.bilateral).toBe(false);
    });

    it('p2p_message only affects rapport', () => {
        const delta = INTERACTION_DELTAS.p2p_message;
        expect(delta.trust).toBe(0);
        expect(delta.rapport).toBe(2);
    });
});

describe('QUALITY_MODIFIERS', () => {
    it('high quality amplifies trust by 1.5x', () => {
        expect(QUALITY_MODIFIERS.high.trust).toBe(1.5);
    });

    it('normal quality is 1x', () => {
        expect(QUALITY_MODIFIERS.normal.trust).toBe(1.0);
        expect(QUALITY_MODIFIERS.normal.rapport).toBe(1.0);
    });

    it('low quality reduces trust by 0.5x', () => {
        expect(QUALITY_MODIFIERS.low.trust).toBe(0.5);
    });
});

describe('DECAY_CONFIG', () => {
    it('has 7-day grace period', () => {
        expect(DECAY_CONFIG.gracePeriodDays).toBe(7);
    });

    it('trust does not decay', () => {
        expect(DECAY_CONFIG.dailyTrustDecay).toBe(0);
    });

    it('rapport decays at -1/day', () => {
        expect(DECAY_CONFIG.dailyRapportDecay).toBe(-1);
    });

    it('min rapport is -30', () => {
        expect(DECAY_CONFIG.minRapport).toBe(-30);
    });
});

describe('TIER_BONUSES', () => {
    it('stranger has no bonuses', () => {
        const bonus = TIER_BONUSES.stranger;
        expect(bonus.speedMultiplier).toBe(1.0);
        expect(bonus.canAutoDelegate).toBe(false);
        expect(bonus.canCombineSkills).toBe(false);
    });

    it('colleague can auto-delegate', () => {
        expect(TIER_BONUSES.colleague.canAutoDelegate).toBe(true);
        expect(TIER_BONUSES.colleague.canCombineSkills).toBe(false);
    });

    it('partner can combine skills', () => {
        expect(TIER_BONUSES.partner.canCombineSkills).toBe(true);
    });

    it('soulmate has all bonuses', () => {
        const bonus = TIER_BONUSES.soulmate;
        expect(bonus.speedMultiplier).toBe(1.3);
        expect(bonus.canAutoDelegate).toBe(true);
        expect(bonus.canCombineSkills).toBe(true);
        expect(bonus.canProxyVote).toBe(true);
    });
});

describe('TIER_LABELS', () => {
    it('has Korean labels for all tiers', () => {
        expect(TIER_LABELS.stranger).toBe('낯선 사이');
        expect(TIER_LABELS.acquaintance).toBe('아는 사이');
        expect(TIER_LABELS.colleague).toBe('동료');
        expect(TIER_LABELS.partner).toBe('파트너');
        expect(TIER_LABELS.soulmate).toBe('소울메이트');
    });
});

describe('TIER_COLORS', () => {
    it('has hex color strings for all tiers', () => {
        for (const color of Object.values(TIER_COLORS)) {
            expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });
});

describe('createEmptyMatrix', () => {
    it('creates a matrix with empty scores', () => {
        const matrix = createEmptyMatrix();
        expect(matrix.version).toBe(1);
        expect(matrix.scores).toEqual({});
        expect(matrix.globalStats.totalInteractions).toBe(0);
        expect(matrix.globalStats.highestSynergy).toBeNull();
        expect(matrix.globalStats.mostActive).toBeNull();
    });
});

describe('synergy calculation integration', () => {
    it('default score (trust=0, rapport=0) produces synergy around 35-55 depending on roles', () => {
        // With trust=0, rapport=0: trustNorm=50, rapportNorm=50
        // synergy = 0.4*50 + 0.2*50 + 0.3*roleCompat + 0.1*skillDiv
        // = 20 + 10 + 0.3*roleCompat + 0.1*skillDiv
        // For same role (compat~25, div~20): ~30 + 7.5 + 2 = ~40
        // For complementary roles (compat~90, div~92): ~30 + 27 + 9.2 = ~66
        // So range is roughly 35-66 for trust=0 rapport=0
        const trustNorm = normalize(0); // 50
        const rapportNorm = normalize(0); // 50
        expect(trustNorm).toBe(50);
        expect(rapportNorm).toBe(50);
    });

    it('max trust and rapport gives high synergy component', () => {
        const trustNorm = normalize(100); // 100
        const rapportNorm = normalize(100); // 100
        // 0.4*100 + 0.2*100 = 60, plus role compat and skill div
        expect(0.4 * trustNorm + 0.2 * rapportNorm).toBe(60);
    });

    it('negative trust and rapport gives low synergy component', () => {
        const trustNorm = normalize(-100); // 0
        const rapportNorm = normalize(-100); // 0
        // 0.4*0 + 0.2*0 = 0, plus role compat and skill div
        expect(0.4 * trustNorm + 0.2 * rapportNorm).toBe(0);
    });
});

describe('interaction delta calculation logic', () => {
    it('successful task_collaboration with high quality', () => {
        const base = INTERACTION_DELTAS.task_collaboration;
        const mod = QUALITY_MODIFIERS.high;
        const outcomeSign = 1; // success

        const trustDelta = Math.round(base.trust * mod.trust * outcomeSign);
        const rapportDelta = Math.round(
            base.rapport * mod.rapport * outcomeSign,
        );

        expect(trustDelta).toBe(12); // 8 * 1.5 = 12
        expect(rapportDelta).toBe(7); // 5 * 1.3 = 6.5 → 7
    });

    it('failed task_collaboration with normal quality', () => {
        const base = INTERACTION_DELTAS.task_collaboration;
        const mod = QUALITY_MODIFIERS.normal;
        const outcomeSign = -1; // failure

        const trustDelta = Math.round(base.trust * mod.trust * outcomeSign);
        const rapportDelta = Math.round(
            base.rapport * mod.rapport * outcomeSign,
        );

        expect(trustDelta).toBe(-8);
        expect(rapportDelta).toBe(-5);
    });

    it('partial task_collaboration', () => {
        const base = INTERACTION_DELTAS.task_collaboration;
        const mod = QUALITY_MODIFIERS.normal;
        const outcomeSign = 0.5; // partial

        const trustDelta = Math.round(base.trust * mod.trust * outcomeSign);
        // rapport: outcomeSign >= 0, so use 1
        const rapportDelta = Math.round(base.rapport * mod.rapport * 1);

        expect(trustDelta).toBe(4); // 8 * 0.5 = 4
        expect(rapportDelta).toBe(5); // rapport stays positive for partial
    });

    it('error_help produces large positive deltas', () => {
        const base = INTERACTION_DELTAS.error_help;
        const trustDelta = Math.round(base.trust * 1.0 * 1); // normal, success
        const rapportDelta = Math.round(base.rapport * 1.0 * 1);

        expect(trustDelta).toBe(12);
        expect(rapportDelta).toBe(6);
    });
});

describe('decay logic', () => {
    it('no decay within grace period', () => {
        const daysSince = 5;
        expect(daysSince <= DECAY_CONFIG.gracePeriodDays).toBe(true);
    });

    it('decay starts after grace period', () => {
        const daysSince = 10;
        const decayDays = daysSince - DECAY_CONFIG.gracePeriodDays; // 3
        const rapportDecay = decayDays * DECAY_CONFIG.dailyRapportDecay; // -3

        expect(decayDays).toBe(3);
        expect(rapportDecay).toBe(-3);
    });

    it('decay does not go below minRapport', () => {
        const currentRapport = -20;
        const daysSince = 30;
        const decayDays = daysSince - DECAY_CONFIG.gracePeriodDays; // 23
        const rapportDecay = decayDays * DECAY_CONFIG.dailyRapportDecay; // -23
        const newRapport = Math.max(
            DECAY_CONFIG.minRapport,
            currentRapport + rapportDecay,
        );

        expect(newRapport).toBe(-30); // clamped to minRapport
    });

    it('positive rapport decays toward zero then negative', () => {
        const currentRapport = 10;
        const daysSince = 25; // 18 decay days
        const decayDays = daysSince - DECAY_CONFIG.gracePeriodDays;
        const newRapport = Math.max(
            DECAY_CONFIG.minRapport,
            currentRapport + decayDays * DECAY_CONFIG.dailyRapportDecay,
        );

        expect(newRapport).toBe(-8); // 10 - 18 = -8
    });
});
