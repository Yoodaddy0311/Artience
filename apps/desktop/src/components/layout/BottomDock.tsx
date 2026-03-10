import React, { useState, useCallback } from 'react';
import {
    useTerminalStore,
    type AgentSettings,
} from '../../store/useTerminalStore';
import { DEFAULT_AGENTS, type AgentProfile } from '../../types/platform';
import { assetPath } from '../../lib/assetPath';
import { HistoryModal } from './HistoryModal';
import { AgentLevelBadge } from '../growth';

// ── AgentSettings → extraArgs 변환 헬퍼 ──
function buildExtraArgs(settings?: AgentSettings): string[] {
    if (!settings) return [];
    const args: string[] = [];
    if (settings.model) args.push('--model', settings.model);
    if (settings.permissionMode && settings.permissionMode !== 'default') {
        args.push('--permission-mode', settings.permissionMode);
    }
    if (settings.maxTurns) args.push('--max-turns', String(settings.maxTurns));
    return args;
}

const RACCOON: AgentProfile = {
    id: 'raccoon',
    name: 'Dokba',
    role: 'AI 어시스턴트',
    sprite: '/assets/characters/dokba_profile.png',
    state: 'IDLE',
    currentJobId: null,
    home: { x: 20, y: 14 },
    pos: { x: 20, y: 14 },
};

// agentId → AgentProfile 룩업 (raccoon + DEFAULT_AGENTS)
const AGENT_MAP = new Map<string, AgentProfile>();
AGENT_MAP.set(RACCOON.id, RACCOON);
for (const a of DEFAULT_AGENTS) {
    AGENT_MAP.set(a.id, a);
}

const CTO_ID = 'raccoon'; // CTO는 항상 독 첫 번째, 제거 불가

export const BottomDock: React.FC = () => {
    // Selective subscriptions to avoid re-render from parsedMessages/agentActivity churn
    const tabs = useTerminalStore((s) => s.tabs);
    const activeTabId = useTerminalStore((s) => s.activeTabId);
    const setActiveTab = useTerminalStore((s) => s.setActiveTab);
    const panelVisible = useTerminalStore((s) => s.panelVisible);
    const setPanelVisible = useTerminalStore((s) => s.setPanelVisible);
    const addTab = useTerminalStore((s) => s.addTab);
    const removeTab = useTerminalStore((s) => s.removeTab);
    const setCharacterDir = useTerminalStore((s) => s.setCharacterDir);
    const characterDirMap = useTerminalStore((s) => s.characterDirMap);
    const dockAgents = useTerminalStore((s) => s.dockAgents);
    const addDockAgent = useTerminalStore((s) => s.addDockAgent);
    const removeDockAgent = useTerminalStore((s) => s.removeDockAgent);
    const agentSettings = useTerminalStore((s) => s.agentSettings);
    const setAgentSettings = useTerminalStore((s) => s.setAgentSettings);
    const activeTeamMembers = useTerminalStore((s) => s.activeTeamMembers);
    const teamAddedAgents = useTerminalStore((s) => s.teamAddedAgents);

    const [ctxMenu, setCtxMenu] = useState<{
        x: number;
        y: number;
        agentId: string;
    } | null>(null);
    const [addPopup, setAddPopup] = useState(false);
    const [settingsPopup, setSettingsPopup] = useState<{
        agentId: string;
    } | null>(null);
    const [settingsDraft, setSettingsDraft] = useState<AgentSettings>({});
    const [isDockOpen, setIsDockOpen] = useState(true);
    const [historyModalAgent, setHistoryModalAgent] = useState<{
        id: string;
        name: string;
    } | null>(null);

    // --- 캐릭터 클릭: 세션 생성 또는 활성화 ---
    const handleCharacterClick = useCallback(
        async (agentId: string) => {
            const agent = AGENT_MAP.get(agentId);
            if (!agent) return;
            const api = window.dogbaApi?.terminal;
            if (!api) return;

            // 이미 터미널이 있는 캐릭터 → 활성화 또는 토글
            const existingTab = tabs.find((t) => t.agentId === agentId);
            if (existingTab) {
                if (activeTabId === existingTab.id && panelVisible) {
                    // 동일한 탭이 열려 있으면 숨기기 토글
                    setPanelVisible(false);
                } else {
                    setActiveTab(existingTab.id);
                    setPanelVisible(true);
                }
                return;
            }

            // 디렉토리 결정
            let cwd = characterDirMap[agentId];
            if (!cwd) {
                const selected = await window.dogbaApi?.project?.selectDir();
                if (!selected) return;
                cwd = selected;
                setCharacterDir(agentId, cwd);
            }

            // PTY에서 claude 인터랙티브 모드 실행 (채팅과 터미널이 동일 세션 공유)
            const result = await api.create(80, 24, {
                cwd,
                label: agent.name,
                autoCommand: 'claude',
                agentSettings: agentSettings[agentId],
            });

            if (result?.id) {
                addTab({
                    id: result.id,
                    agentId,
                    agentName: agent.name,
                    label: agent.name,
                    cwd: result.cwd || cwd,
                    status: 'connecting',
                });
                setPanelVisible(true);
            }
        },
        [
            tabs,
            characterDirMap,
            agentSettings,
            activeTabId,
            panelVisible,
            setActiveTab,
            setPanelVisible,
            addTab,
            setCharacterDir,
        ],
    );

    // --- 우클릭 컨텍스트 메뉴 ---
    const handleContextMenu = useCallback(
        (e: React.MouseEvent, agentId: string) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, agentId });
        },
        [],
    );

    // --- 디렉토리 변경 ---
    const handleChangeDir = useCallback(async () => {
        if (!ctxMenu) return;
        const agentId = ctxMenu.agentId;
        setCtxMenu(null);
        const agent = AGENT_MAP.get(agentId);
        if (!agent) return;
        const api = window.dogbaApi?.terminal;
        if (!api) return;

        const selected = await window.dogbaApi?.project?.selectDir();
        if (!selected) return;

        // 기존 chat session 닫기
        window.dogbaApi?.chat?.closeSession(agentId);

        // 기존 터미널 종료
        const existingTab = tabs.find((t) => t.agentId === agentId);
        if (existingTab) {
            api.destroy(existingTab.id);
            removeTab(existingTab.id);
        }

        setCharacterDir(agentId, selected);

        // PTY 생성 + claude 인터랙티브 실행 (채팅과 터미널이 동일 세션 공유)
        const result = await api.create(80, 24, {
            cwd: selected,
            label: agent.name,
            autoCommand: 'claude',
            agentSettings: agentSettings[agentId],
        });
        if (result?.id) {
            addTab({
                id: result.id,
                agentId,
                agentName: agent.name,
                label: agent.name,
                cwd: result.cwd || selected,
                status: 'connecting',
            });
        }
    }, [ctxMenu, tabs, agentSettings, removeTab, setCharacterDir, addTab]);

    // --- 터미널 닫기 ---
    const handleCloseTerminal = useCallback(() => {
        if (!ctxMenu) return;
        const agentId = ctxMenu.agentId;
        setCtxMenu(null);
        window.dogbaApi?.chat?.closeSession(agentId);
        const api = window.dogbaApi?.terminal;
        if (!api) return;
        const existingTab = tabs.find((t) => t.agentId === agentId);
        if (existingTab) {
            api.destroy(existingTab.id);
            removeTab(existingTab.id);
        }
    }, [ctxMenu, tabs, removeTab]);

    // --- 독에서 제거 (CTO 및 팀 멤버 제외) ---
    const handleRemoveFromDock = useCallback(() => {
        if (!ctxMenu) return;
        const agentId = ctxMenu.agentId;
        setCtxMenu(null);
        if (agentId === CTO_ID) return; // CTO는 제거 불가
        if ((teamAddedAgents ?? []).includes(agentId)) return; // 팀 멤버는 팀 해산 시에만 제거

        // 세션/터미널도 정리
        window.dogbaApi?.chat?.closeSession(agentId);
        const api = window.dogbaApi?.terminal;
        const existingTab = tabs.find((t) => t.agentId === agentId);
        if (existingTab && api) {
            api.destroy(existingTab.id);
            removeTab(existingTab.id);
        }
        removeDockAgent(agentId);
    }, [ctxMenu, tabs, removeTab, removeDockAgent, teamAddedAgents]);

    // 즉시 제거 헬퍼 (X 버튼용)
    const removeAgentDirectly = useCallback(
        (agentId: string) => {
            if (agentId === CTO_ID) return;
            if ((teamAddedAgents ?? []).includes(agentId)) return;
            window.dogbaApi?.chat?.closeSession(agentId);
            const api = window.dogbaApi?.terminal;
            const existingTab = tabs.find((t) => t.agentId === agentId);
            if (existingTab && api) {
                api.destroy(existingTab.id);
                removeTab(existingTab.id);
            }
            removeDockAgent(agentId);
        },
        [tabs, removeTab, removeDockAgent, teamAddedAgents],
    );

    // --- 설정 팝업 열기 ---
    const handleOpenSettings = useCallback(() => {
        if (!ctxMenu) return;
        const agentId = ctxMenu.agentId;
        setCtxMenu(null);
        const current = agentSettings[agentId] || {};
        setSettingsDraft({ ...current });
        setSettingsPopup({ agentId });
    }, [ctxMenu, agentSettings]);

    // --- 설정 저장 (세션 재시작) ---
    const handleSaveSettings = useCallback(async () => {
        if (!settingsPopup) return;
        const agentId = settingsPopup.agentId;
        setAgentSettings(agentId, settingsDraft);
        setSettingsPopup(null);

        // 활성 세션이 있으면 재시작 (close → create)
        const agent = AGENT_MAP.get(agentId);
        if (!agent) return;
        const existingTab = tabs.find((t) => t.agentId === agentId);
        if (!existingTab) return;

        const api = window.dogbaApi?.terminal;
        if (!api) return;
        const cwd = characterDirMap[agentId] || existingTab.cwd;

        api.destroy(existingTab.id);
        removeTab(existingTab.id);

        // PTY 재생성 (채팅과 터미널이 동일 세션 공유) — 새 설정 적용
        const result = await api.create(80, 24, {
            cwd,
            label: agent.name,
            autoCommand: 'claude',
            agentSettings: settingsDraft,
        });
        if (result?.id) {
            addTab({
                id: result.id,
                agentId,
                agentName: agent.name,
                label: agent.name,
                cwd: result.cwd || cwd,
                status: 'connecting',
            });
        }
    }, [
        settingsPopup,
        settingsDraft,
        tabs,
        characterDirMap,
        removeTab,
        addTab,
        setAgentSettings,
    ]);

    // --- "+" 에이전트 추가 팝업 ---
    const handleAddAgent = useCallback(
        (agentId: string) => {
            addDockAgent(agentId);
            setAddPopup(false);
        },
        [addDockAgent],
    );

    // 클릭 바깥으로 컨텍스트 메뉴/팝업/설정 닫기
    React.useEffect(() => {
        if (!ctxMenu && !addPopup) return;
        const close = () => {
            setCtxMenu(null);
            setAddPopup(false);
        };
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [ctxMenu, addPopup]);

    // --- 앱 시작 시 세션 자동 복원 (--resume 자동 적용) ---
    const [restoring, setRestoring] = useState(false);
    React.useEffect(() => {
        // 이미 탭이 있으면 복원 건너뜀 (중복 방지)
        if (tabs.length > 0) return;

        const restoreSessions = async () => {
            const api = window.dogbaApi?.terminal;
            if (!api) return;

            // cwd가 설정된 에이전트만 복원 대상
            const restorable = (dockAgents ?? []).filter((id) => {
                const agent = AGENT_MAP.get(id);
                const cwd = characterDirMap[id];
                return agent && cwd;
            });
            if (restorable.length === 0) return;

            setRestoring(true);

            for (const agentId of restorable) {
                const agent = AGENT_MAP.get(agentId)!;
                const cwd = characterDirMap[agentId];

                // PTY 생성 + claude 인터랙티브 실행 (채팅과 터미널이 동일 세션 공유)
                const result = await api.create(80, 24, {
                    cwd,
                    label: agent.name,
                    autoCommand: 'claude',
                    agentSettings: agentSettings[agentId],
                });
                if (result?.id) {
                    addTab({
                        id: result.id,
                        agentId,
                        agentName: agent.name,
                        label: agent.name,
                        cwd: result.cwd || cwd,
                        status: 'connecting',
                    });
                }
            }

            setRestoring(false);
        };

        restoreSessions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 독에 없는 에이전트 목록 (추가 팝업용)
    const availableAgents = DEFAULT_AGENTS.filter(
        (a) => !(dockAgents ?? []).includes(a.id),
    );

    // 독에 표시할 에이전트: Dokba(CTO)를 항상 첫 번째, 추가 에이전트는 그 뒤
    const dokbaAgent = AGENT_MAP.get(CTO_ID)!;
    const extraDockAgents = (dockAgents ?? []).filter((id) => id !== CTO_ID);

    // 활동 상태
    const agentActivity = useTerminalStore((s) => s.agentActivity);

    // Dokba 활동 상태 아이콘
    const dokbaActivity = agentActivity['raccoon'];
    const dokbaActivityLabel = (() => {
        switch (dokbaActivity) {
            case 'thinking':
                return '생각 중';
            case 'working':
                return '작업 중';
            case 'success':
                return '완료';
            case 'error':
                return '오류';
            default:
                return null;
        }
    })();

    return (
        <>
            {isDockOpen ? (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-end gap-2">
                    {/* Dokba(CTO) — 항상 표시, 크게 */}
                    {(() => {
                        const tab = tabs.find((t) => t.agentId === CTO_ID);
                        const hasTab = !!tab;
                        const isActive = hasTab && tab!.id === activeTabId;

                        return (
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => handleCharacterClick(CTO_ID)}
                                onContextMenu={(e) =>
                                    handleContextMenu(e, CTO_ID)
                                }
                                onDoubleClick={() =>
                                    setHistoryModalAgent({
                                        id: CTO_ID,
                                        name: dokbaAgent.name,
                                    })
                                }
                                title={`${dokbaAgent.name} - ${dokbaAgent.role}`}
                                className={`relative flex flex-col items-center px-4 pt-2 pb-1.5 rounded-2xl transition-all duration-200 bg-white/95 backdrop-blur-sm shadow-[4px_4px_0_0_#000] border-3 border-yellow-500 cursor-pointer ${
                                    isActive
                                        ? 'bg-[#E8DAFF] -translate-y-3'
                                        : hasTab
                                          ? 'bg-[#F0F0FF] hover:-translate-y-2'
                                          : 'hover:-translate-y-2'
                                }`}
                            >
                                {/* 왕관 */}
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-base leading-none">
                                    {'♛'}
                                </span>
                                <div className="relative">
                                    <img
                                        src={assetPath(dokbaAgent.sprite)}
                                        alt={dokbaAgent.name}
                                        className="w-[64px] h-[64px] object-contain"
                                        draggable={false}
                                    />
                                    {hasTab && tab && (
                                        <span
                                            className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                                                tab.status === 'connected'
                                                    ? 'bg-green-400'
                                                    : tab.status ===
                                                        'connecting'
                                                      ? 'bg-yellow-400 animate-pulse'
                                                      : 'bg-red-400'
                                            }`}
                                        />
                                    )}
                                    {restoring &&
                                        !hasTab &&
                                        characterDirMap[CTO_ID] && (
                                            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-400 animate-pulse" />
                                        )}
                                </div>
                                <span
                                    className={`text-[11px] font-black mt-0.5 ${
                                        isActive
                                            ? 'text-black'
                                            : 'text-gray-700'
                                    }`}
                                >
                                    {dokbaAgent.name}
                                </span>
                                {/* 활동 상태 표시 */}
                                {dokbaActivityLabel && (
                                    <span
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                                            dokbaActivity === 'working' ||
                                            dokbaActivity === 'thinking'
                                                ? 'bg-[#FFD100] text-black animate-pulse'
                                                : dokbaActivity === 'success'
                                                  ? 'bg-[#A0E8AF] text-black'
                                                  : 'bg-[#FF6B6B] text-white'
                                        }`}
                                    >
                                        {dokbaActivityLabel}
                                    </span>
                                )}
                                <AgentLevelBadge agentId={CTO_ID} size="sm" />
                            </div>
                        );
                    })()}

                    {/* 추가 에이전트들 (독에 추가된 것만, 작게) */}
                    {extraDockAgents.map((agentId) => {
                        const agent = AGENT_MAP.get(agentId);
                        if (!agent) return null;
                        const tab = tabs.find((t) => t.agentId === agentId);
                        const hasTab = !!tab;
                        const isActive = hasTab && tab!.id === activeTabId;
                        const isTeamMember = (teamAddedAgents ?? []).includes(
                            agentId,
                        );

                        return (
                            <div
                                role="button"
                                tabIndex={0}
                                key={agentId}
                                onClick={() => handleCharacterClick(agentId)}
                                onContextMenu={(e) =>
                                    handleContextMenu(e, agentId)
                                }
                                onDoubleClick={() =>
                                    setHistoryModalAgent({
                                        id: agentId,
                                        name: agent.name,
                                    })
                                }
                                title={`${agent.name} - ${agent.role}`}
                                className={`relative flex flex-col items-center px-2.5 pt-1.5 pb-1 rounded-2xl transition-all duration-200 bg-white/95 backdrop-blur-sm shadow-[3px_3px_0_0_#000] border-2 cursor-pointer ${
                                    isTeamMember
                                        ? 'border-blue-500'
                                        : 'border-black'
                                } ${
                                    isActive
                                        ? 'bg-[#E8DAFF] -translate-y-2'
                                        : hasTab
                                          ? 'bg-[#F0F0FF] hover:-translate-y-1'
                                          : 'hover:-translate-y-1'
                                }`}
                            >
                                {/* 팀 뱃지 */}
                                {isTeamMember && (
                                    <span className="absolute -top-2 -left-1 bg-blue-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-white z-10">
                                        T
                                    </span>
                                )}
                                {/* 제거 버튼 (X) */}
                                {!isTeamMember && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeAgentDirectly(agentId);
                                        }}
                                        className="absolute -top-2 -right-1 bg-gray-200 hover:bg-red-500 text-gray-600 hover:text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-white shadow-sm z-10 transition-colors"
                                        title="독바에서 제거"
                                    >
                                        ✕
                                    </button>
                                )}
                                <div className="relative">
                                    <img
                                        src={assetPath(agent.sprite)}
                                        alt={agent.name}
                                        className="w-[48px] h-[48px] object-contain"
                                        draggable={false}
                                    />
                                    {hasTab && tab && (
                                        <span
                                            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                                tab.status === 'connected'
                                                    ? 'bg-green-400'
                                                    : tab.status ===
                                                        'connecting'
                                                      ? 'bg-yellow-400 animate-pulse'
                                                      : 'bg-red-400'
                                            }`}
                                        />
                                    )}
                                </div>
                                <span
                                    className={`text-[9px] font-bold mt-0.5 ${
                                        isActive
                                            ? 'text-black'
                                            : 'text-gray-500'
                                    }`}
                                >
                                    {agent.name}
                                </span>
                                <AgentLevelBadge agentId={agentId} size="sm" />
                            </div>
                        );
                    })}

                    {/* "+" 추가 버튼 */}
                    <div className="relative">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setAddPopup((prev) => !prev);
                            }}
                            title="에이전트 추가"
                            className="flex items-center justify-center w-[44px] h-[44px] rounded-2xl bg-white/80 backdrop-blur-sm border-2 border-dashed border-gray-400 hover:border-black hover:bg-white transition-all duration-200 shadow-[2px_2px_0_0_#0002] mb-1"
                        >
                            <span className="text-xl font-bold text-gray-400 hover:text-black">
                                +
                            </span>
                        </button>

                        {/* 에이전트 추가 팝업 */}
                        {addPopup && (
                            <div
                                className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50 bg-white border-2 border-black rounded-lg shadow-[3px_3px_0_0_#000] py-1 w-[200px] max-h-[280px] overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 border-b border-gray-200">
                                    에이전트 추가
                                </div>
                                {availableAgents.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-gray-400">
                                        추가 가능한 에이전트 없음
                                    </div>
                                ) : (
                                    availableAgents.map((a) => (
                                        <button
                                            key={a.id}
                                            onClick={() => handleAddAgent(a.id)}
                                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#E8DAFF] transition-colors flex items-center gap-2"
                                        >
                                            <img
                                                src={assetPath(a.sprite)}
                                                alt={a.name}
                                                className="w-6 h-6 object-contain"
                                                draggable={false}
                                            />
                                            <span className="font-bold">
                                                {a.name}
                                            </span>
                                            <span className="text-gray-400 text-[10px]">
                                                {a.role}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* 독바 닫기 버튼 */}
                    <button
                        onClick={() => setIsDockOpen(false)}
                        title="독바 닫기"
                        className="flex items-center justify-center w-[36px] h-[36px] rounded-2xl bg-white/80 backdrop-blur-sm border-2 border-gray-400 hover:border-black hover:bg-gray-100 transition-all duration-200 shadow-[2px_2px_0_0_#0002] mb-1 ml-2"
                    >
                        <span className="text-xl font-bold text-gray-400 hover:text-black">
                            ▼
                        </span>
                    </button>
                </div>
            ) : (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 flex justify-center pb-0 group">
                    <button
                        onClick={() => setIsDockOpen(true)}
                        className="flex items-center gap-2 px-6 py-1.5 rounded-t-2xl bg-white/90 backdrop-blur-md border-t-2 border-x-2 border-gray-400 hover:border-black hover:bg-white hover:-translate-y-1 transition-all duration-300 shadow-[0_-2px_10px_rgba(0,0,0,0.1)] group-hover:pb-3"
                        title="독바 펼치기"
                    >
                        <span className="text-xs font-bold text-gray-500 group-hover:text-black">
                            ▲
                        </span>
                        <span className="text-xs font-bold text-gray-500 group-hover:text-black">
                            Team Dock
                        </span>
                    </button>
                </div>
            )}

            {/* 컨텍스트 메뉴 */}
            {ctxMenu && (
                <div
                    className="fixed z-50 bg-white border-2 border-black rounded-lg shadow-[3px_3px_0_0_#000] py-1 min-w-[140px]"
                    style={{ left: ctxMenu.x, top: ctxMenu.y - 100 }}
                >
                    <button
                        onClick={handleChangeDir}
                        className="w-full text-left px-3 py-1.5 text-xs font-bold hover:bg-[#E8DAFF] transition-colors"
                    >
                        디렉토리 변경
                    </button>
                    <button
                        onClick={handleOpenSettings}
                        className="w-full text-left px-3 py-1.5 text-xs font-bold hover:bg-[#E8DAFF] transition-colors"
                    >
                        Claude 설정
                    </button>
                    {tabs.some((t) => t.agentId === ctxMenu.agentId) && (
                        <button
                            onClick={handleCloseTerminal}
                            className="w-full text-left px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                        >
                            터미널 닫기
                        </button>
                    )}
                    {ctxMenu.agentId !== CTO_ID &&
                        !(teamAddedAgents ?? []).includes(ctxMenu.agentId) && (
                            <button
                                onClick={handleRemoveFromDock}
                                className="w-full text-left px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors border-t border-gray-200"
                            >
                                독에서 제거
                            </button>
                        )}
                </div>
            )}

            {/* 캐릭터별 설정 팝업 */}
            {settingsPopup &&
                (() => {
                    const agent = AGENT_MAP.get(settingsPopup.agentId);
                    return (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                            onClick={() => setSettingsPopup(null)}
                        >
                            <div
                                className="bg-white border-2 border-black rounded-lg shadow-[3px_3px_0_0_#000] w-[260px]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* 헤더 */}
                                <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                                    <span className="text-xs font-bold">
                                        {agent?.name || settingsPopup.agentId}{' '}
                                        설정
                                    </span>
                                    <button
                                        onClick={() => setSettingsPopup(null)}
                                        className="text-gray-400 hover:text-black text-xs font-bold"
                                    >
                                        x
                                    </button>
                                </div>

                                {/* 설정 폼 */}
                                <div className="px-3 py-2 flex flex-col gap-2">
                                    {/* 모델 */}
                                    <div className="flex flex-col gap-0.5">
                                        <label className="text-[10px] font-bold text-gray-500">
                                            모델
                                        </label>
                                        <select
                                            value={settingsDraft.model || ''}
                                            onChange={(e) =>
                                                setSettingsDraft((d) => ({
                                                    ...d,
                                                    model: (e.target.value ||
                                                        undefined) as AgentSettings['model'],
                                                }))
                                            }
                                            className="w-full px-2 py-1.5 text-xs border-2 border-black rounded font-bold bg-white shadow-[1px_1px_0_0_#000]"
                                        >
                                            <option value="">
                                                기본 (sonnet)
                                            </option>
                                            <option value="opus">Opus</option>
                                            <option value="sonnet">
                                                Sonnet
                                            </option>
                                            <option value="haiku">Haiku</option>
                                        </select>
                                    </div>

                                    {/* 권한 모드 */}
                                    <div className="flex flex-col gap-0.5">
                                        <label className="text-[10px] font-bold text-gray-500">
                                            권한 모드
                                        </label>
                                        <select
                                            value={
                                                settingsDraft.permissionMode ||
                                                'default'
                                            }
                                            onChange={(e) =>
                                                setSettingsDraft((d) => ({
                                                    ...d,
                                                    permissionMode: e.target
                                                        .value as AgentSettings['permissionMode'],
                                                }))
                                            }
                                            className="w-full px-2 py-1.5 text-xs border-2 border-black rounded font-bold bg-white shadow-[1px_1px_0_0_#000]"
                                        >
                                            <option value="default">
                                                Default (확인 필요)
                                            </option>
                                            <option value="plan">
                                                Plan (읽기 전용)
                                            </option>
                                            <option value="bypassPermissions">
                                                Bypass (자동 승인)
                                            </option>
                                        </select>
                                    </div>

                                    {/* 최대 턴 */}
                                    <div className="flex flex-col gap-0.5">
                                        <label className="text-[10px] font-bold text-gray-500">
                                            최대 턴
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            placeholder="제한 없음"
                                            value={settingsDraft.maxTurns || ''}
                                            onChange={(e) => {
                                                const val = parseInt(
                                                    e.target.value,
                                                    10,
                                                );
                                                setSettingsDraft((d) => ({
                                                    ...d,
                                                    maxTurns: isNaN(val)
                                                        ? undefined
                                                        : val,
                                                }));
                                            }}
                                            className="w-full px-2 py-1.5 text-xs border-2 border-black rounded font-mono bg-white shadow-[1px_1px_0_0_#000]"
                                        />
                                    </div>
                                </div>

                                {/* 액션 버튼 */}
                                <div className="flex gap-1.5 px-3 py-2 border-t border-gray-200">
                                    <button
                                        onClick={() => setSettingsPopup(null)}
                                        className="flex-1 py-1.5 text-[10px] font-bold border-2 border-black rounded bg-white shadow-[1px_1px_0_0_#000] hover:bg-gray-50 transition-colors"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleSaveSettings}
                                        className="flex-1 py-1.5 text-[10px] font-bold border-2 border-black rounded bg-[#E8DAFF] shadow-[1px_1px_0_0_#000] hover:bg-[#d4c0f0] transition-colors"
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            {/* 히스토리 모달 */}
            {historyModalAgent && (
                <HistoryModal
                    agentId={historyModalAgent.id}
                    agentName={historyModalAgent.name}
                    onClose={() => setHistoryModalAgent(null)}
                />
            )}
        </>
    );
};
