import React from 'react';
import type { RoomMember } from '../../store/useRoomStore';

// ── Status indicator colors ──

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
    online: { dot: 'bg-green-400', label: 'Online' },
    busy: { dot: 'bg-red-400', label: 'Busy' },
    away: { dot: 'bg-yellow-400', label: 'Away' },
    offline: { dot: 'bg-gray-300', label: 'Offline' },
};

// ── Job badge colors ──

const JOB_COLORS: Record<string, string> = {
    CTO: '#EF4444',
    Frontend: '#3B82F6',
    Backend: '#8B5CF6',
    Designer: '#EC4899',
    PM: '#F59E0B',
    QA: '#10B981',
    DevOps: '#6366F1',
    Data: '#14B8A6',
};

interface MemberListProps {
    members: RoomMember[];
}

export const MemberList: React.FC<MemberListProps> = ({ members }) => {
    const online = members.filter((m) => m.status !== 'offline');
    const offline = members.filter((m) => m.status === 'offline');

    return (
        <div className="space-y-1.5">
            {/* Online members first */}
            {online.map((member) => (
                <MemberRow key={member.id} member={member} />
            ))}
            {/* Offline members */}
            {offline.length > 0 && (
                <>
                    <div className="text-[10px] font-bold text-gray-300 uppercase tracking-wider pt-2 px-1">
                        Offline ({offline.length})
                    </div>
                    {offline.map((member) => (
                        <MemberRow key={member.id} member={member} />
                    ))}
                </>
            )}
            {members.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4 font-bold">
                    No members yet
                </p>
            )}
        </div>
    );
};

const MemberRow: React.FC<{ member: RoomMember }> = ({ member }) => {
    const statusStyle = STATUS_STYLES[member.status] ?? STATUS_STYLES.offline;
    const jobColor = JOB_COLORS[member.job] ?? '#6B7280';
    const isOffline = member.status === 'offline';

    return (
        <div
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 border-black bg-white shadow-[1px_1px_0_0_#000] ${
                isOffline ? 'opacity-50' : ''
            }`}
        >
            {/* Avatar */}
            <div className="relative shrink-0">
                <div
                    className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center text-white text-xs font-black"
                    style={{ backgroundColor: jobColor }}
                >
                    {member.name.charAt(0).toUpperCase()}
                </div>
                {/* Status dot */}
                <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusStyle.dot}`}
                />
            </div>

            {/* Name + job */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black truncate">{member.name}</span>
                    {member.isCTO && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-black bg-[#FFD100] shadow-[1px_1px_0_0_#000] shrink-0">
                            CTO
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-black"
                        style={{ backgroundColor: jobColor + '20', color: jobColor }}
                    >
                        {member.job}
                    </span>
                    {member.currentTask && (
                        <span className="text-[10px] text-gray-400 truncate">
                            {member.currentTask}
                        </span>
                    )}
                </div>
            </div>

            {/* Status label */}
            <span className="text-[10px] font-bold text-gray-400 shrink-0">
                {statusStyle.label}
            </span>
        </div>
    );
};
