import React, { useState, useEffect } from 'react';
import { Plus, LogIn, Users, Wifi, WifiOff, X, DoorOpen } from 'lucide-react';
import { useRoomStore, type Room } from '../../store/useRoomStore';
import { RoomCode } from './RoomCode';
import { MemberList } from './MemberList';
import { ConfirmDialog } from '../ui/ConfirmDialog';

// ── Create Room Modal ──

interface CreateRoomModalProps {
    open: boolean;
    onClose: () => void;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ open, onClose }) => {
    const [name, setName] = useState('');
    const [maxMembers, setMaxMembers] = useState(6);
    const createRoom = useRoomStore((s) => s.createRoom);
    const loading = useRoomStore((s) => s.loading);

    const handleSubmit = async () => {
        if (!name.trim()) return;
        await createRoom(name.trim(), maxMembers);
        setName('');
        setMaxMembers(6);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div role="dialog" aria-modal="true" aria-labelledby="create-room-title" className="w-full max-w-sm bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 id="create-room-title" className="font-black text-base text-black">Create Room</h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border-2 border-black bg-white hover:bg-gray-100 active:translate-y-0.5 transition-all"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                            Room Name
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="My awesome room"
                            className="w-full mt-1 px-3 py-2 text-sm font-bold border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD100]"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                            Max Members
                        </label>
                        <select
                            value={maxMembers}
                            onChange={(e) => setMaxMembers(Number(e.target.value))}
                            className="w-full mt-1 px-3 py-2 text-sm font-bold border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD100]"
                        >
                            {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                                <option key={n} value={n}>
                                    {n} members
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 text-xs font-black border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !name.trim()}
                        className="flex-1 py-2.5 text-xs font-black text-white border-2 border-black rounded-lg bg-[#22C55E] shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        {loading ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Join Room Modal ──

interface JoinRoomModalProps {
    open: boolean;
    onClose: () => void;
}

const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ open, onClose }) => {
    const [code, setCode] = useState('');
    const joinRoom = useRoomStore((s) => s.joinRoom);
    const loading = useRoomStore((s) => s.loading);
    const error = useRoomStore((s) => s.error);

    const handleSubmit = async () => {
        if (!code.trim()) return;
        await joinRoom(code.trim().toUpperCase());
        if (!useRoomStore.getState().error) {
            setCode('');
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div role="dialog" aria-modal="true" aria-labelledby="join-room-title" className="w-full max-w-sm bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 id="join-room-title" className="font-black text-base text-black">Join Room</h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border-2 border-black bg-white hover:bg-gray-100 active:translate-y-0.5 transition-all"
                    >
                        <X size={14} />
                    </button>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                    Enter the invite code to join an existing room.
                </p>

                <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={handleKeyDown}
                    placeholder="ABCD12"
                    maxLength={8}
                    className="w-full px-3 py-2.5 text-center text-lg font-black tracking-[0.3em] border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD100] uppercase"
                    autoFocus
                />

                {error && (
                    <p className="text-xs font-bold text-red-500 mt-2 text-center">{error}</p>
                )}

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 text-xs font-black border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !code.trim()}
                        className="flex-1 py-2.5 text-xs font-black text-white border-2 border-black rounded-lg bg-[#60A5FA] shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        {loading ? 'Joining...' : 'Join'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Room Card ──

const RoomCard: React.FC<{ room: Room; onJoin: (code: string) => void }> = ({ room, onJoin }) => (
    <div className="p-3 rounded-xl border-2 border-black bg-white shadow-[2px_2px_0_0_#000]">
        <div className="flex items-center justify-between mb-2">
            <span className="font-black text-sm truncate">{room.name}</span>
            <span className="text-[10px] font-bold text-gray-400">
                {room.memberCount}/{room.maxMembers}
            </span>
        </div>
        <div className="flex items-center gap-2 mb-2">
            <Users size={12} className="text-gray-400" />
            <span className="text-[10px] font-bold text-gray-500">
                {room.onlineCount} online
            </span>
            <span className="text-[10px] text-gray-300">|</span>
            <span className="text-[10px] font-bold text-gray-500">
                CTO: {room.ctoName}
            </span>
        </div>
        <button
            onClick={() => onJoin(room.code)}
            className="w-full py-1.5 text-[10px] font-black text-white border-2 border-black rounded-lg bg-[#A78BFA] shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
        >
            Enter Room
        </button>
    </div>
);

// ── Main Lobby Component ──

export const RoomLobby: React.FC = () => {
    const [createOpen, setCreateOpen] = useState(false);
    const [joinOpen, setJoinOpen] = useState(false);
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

    const currentRoom = useRoomStore((s) => s.currentRoom);
    const members = useRoomStore((s) => s.members);
    const myRooms = useRoomStore((s) => s.myRooms);
    const isConnected = useRoomStore((s) => s.isConnected);
    const leaveRoom = useRoomStore((s) => s.leaveRoom);
    const joinRoom = useRoomStore((s) => s.joinRoom);
    const fetchMyRooms = useRoomStore((s) => s.fetchMyRooms);

    useEffect(() => {
        fetchMyRooms();
    }, [fetchMyRooms]);

    // ── In-Room View ──
    if (currentRoom) {
        return (
            <div className="flex flex-col h-full bg-white">
                {/* Room Header */}
                <div className="p-4 border-b-4 border-black bg-[#A78BFA]">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-black text-lg text-white">{currentRoom.name}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                {isConnected ? (
                                    <Wifi size={12} className="text-green-200" />
                                ) : (
                                    <WifiOff size={12} className="text-red-200" />
                                )}
                                <span className="text-[10px] font-bold text-white/70">
                                    {isConnected ? 'Connected' : 'Reconnecting...'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setLeaveConfirmOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-black bg-white text-black border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                        >
                            <DoorOpen size={12} />
                            Leave
                        </button>
                    </div>
                </div>

                {/* Room content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Invite Code */}
                    <RoomCode code={currentRoom.code} roomName={currentRoom.name} />

                    {/* Members */}
                    <div>
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                            Members ({members.length}/{currentRoom.maxMembers})
                        </h3>
                        <MemberList members={members} />
                    </div>
                </div>

                {/* Leave Confirm Dialog */}
                <ConfirmDialog
                    open={leaveConfirmOpen}
                    title="Leave Room"
                    message={`"${currentRoom.name}" 방에서 나가시겠습니까? 진행 중인 작업이 있으면 다른 멤버에게 재할당됩니다.`}
                    confirmLabel="Leave"
                    cancelLabel="Cancel"
                    variant="danger"
                    onConfirm={() => {
                        setLeaveConfirmOpen(false);
                        leaveRoom();
                    }}
                    onCancel={() => setLeaveConfirmOpen(false)}
                />
            </div>
        );
    }

    // ── Lobby View (no room joined) ──
    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b-4 border-black bg-[#FFD100]">
                <h2 className="font-black text-lg text-black">Dokba Town Lobby</h2>
                <p className="text-xs text-gray-700 mt-1">
                    Create or join a room to collaborate
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Action buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setCreateOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-black text-white border-2 border-black rounded-xl bg-[#22C55E] shadow-[3px_3px_0_0_#000] hover:shadow-[4px_4px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                    >
                        <Plus size={16} />
                        Create Room
                    </button>
                    <button
                        onClick={() => setJoinOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-black text-white border-2 border-black rounded-xl bg-[#60A5FA] shadow-[3px_3px_0_0_#000] hover:shadow-[4px_4px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                    >
                        <LogIn size={16} />
                        Join Room
                    </button>
                </div>

                {/* My Rooms */}
                <div>
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                        My Rooms ({myRooms.length})
                    </h3>
                    {myRooms.length > 0 ? (
                        <div className="space-y-2">
                            {myRooms.map((room) => (
                                <RoomCard
                                    key={room.id}
                                    room={room}
                                    onJoin={(code) => joinRoom(code)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-14 h-14 rounded-full bg-gray-50 border-2 border-black flex items-center justify-center mx-auto mb-3 shadow-[2px_2px_0_0_#000]">
                                <Users size={24} className="text-gray-300" />
                            </div>
                            <p className="text-xs font-bold text-gray-400">
                                No rooms yet. Create one or join with a code!
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
            <JoinRoomModal open={joinOpen} onClose={() => setJoinOpen(false)} />
        </div>
    );
};
