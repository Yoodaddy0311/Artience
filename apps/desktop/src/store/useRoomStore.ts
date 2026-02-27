import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAppStore } from './useAppStore';
import { roomSocket, type RoomWsMessage } from '../services/roomSocket';

// ── Types ──

export type JobType =
    | 'CTO'
    | 'Frontend'
    | 'Backend'
    | 'Designer'
    | 'PM'
    | 'QA'
    | 'DevOps'
    | 'Data';

export type MemberStatus = 'online' | 'offline' | 'busy' | 'away';

export interface RoomMember {
    id: string;
    name: string;
    job: JobType;
    status: MemberStatus;
    avatarUrl?: string;
    isCTO: boolean;
    currentTask?: string;
}

export interface Room {
    id: string;
    name: string;
    code: string;
    maxMembers: number;
    memberCount: number;
    onlineCount: number;
    ctoName: string;
    createdAt: string;
}

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed';

export interface RoomTask {
    id: string;
    title: string;
    prompt?: string;
    status: TaskStatus;
    assigneeId?: string;
    assigneeName?: string;
    createdAt: string;
    completedAt?: string;
}

// ── Store Interface ──

interface RoomState {
    // State
    currentRoom: Room | null;
    members: RoomMember[];
    tasks: RoomTask[];
    myRole: JobType | null;
    isConnected: boolean;
    myRooms: Room[];
    loading: boolean;
    error: string | null;

    // Actions
    createRoom: (name: string, maxMembers: number) => Promise<void>;
    joinRoom: (code: string) => Promise<void>;
    leaveRoom: () => Promise<void>;
    fetchMyRooms: () => Promise<void>;
    fetchTasks: () => Promise<void>;
    createTask: (title: string, prompt?: string) => Promise<void>;
    updateMemberStatus: (memberId: string, status: MemberStatus) => void;
    setConnected: (connected: boolean) => void;
    reset: () => void;
}

function getApiUrl(): string {
    return useAppStore.getState().appSettings.apiUrl;
}

export const useRoomStore = create<RoomState>()(
    persist(
        (set, get) => ({
            // ── Initial State ──
            currentRoom: null,
            members: [],
            tasks: [],
            myRole: null,
            isConnected: false,
            myRooms: [],
            loading: false,
            error: null,

            // ── Actions ──

            createRoom: async (name, maxMembers) => {
                set({ loading: true, error: null });
                try {
                    const res = await fetch(`${getApiUrl()}/api/rooms`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, max_members: maxMembers }),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const room = (await res.json()) as Room;
                    set({ currentRoom: room, loading: false });

                    // Connect WebSocket
                    roomSocket.connect(room.id);
                    set({ isConnected: true });

                    // Refresh room list
                    get().fetchMyRooms();
                } catch (err) {
                    set({
                        loading: false,
                        error: err instanceof Error ? err.message : 'Failed to create room',
                    });
                }
            },

            joinRoom: async (code) => {
                set({ loading: true, error: null });
                try {
                    const res = await fetch(`${getApiUrl()}/api/rooms/join`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code }),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = (await res.json()) as { room: Room; members: RoomMember[]; role: JobType };
                    set({
                        currentRoom: data.room,
                        members: data.members,
                        myRole: data.role,
                        loading: false,
                    });

                    // Connect WebSocket
                    roomSocket.connect(data.room.id);
                    set({ isConnected: true });

                    get().fetchMyRooms();
                } catch (err) {
                    set({
                        loading: false,
                        error: err instanceof Error ? err.message : 'Failed to join room',
                    });
                }
            },

            leaveRoom: async () => {
                const room = get().currentRoom;
                if (!room) return;

                set({ loading: true, error: null });
                try {
                    await fetch(`${getApiUrl()}/api/rooms/${room.id}/leave`, {
                        method: 'POST',
                    });
                    roomSocket.disconnect();
                    set({
                        currentRoom: null,
                        members: [],
                        tasks: [],
                        myRole: null,
                        isConnected: false,
                        loading: false,
                    });
                    get().fetchMyRooms();
                } catch (err) {
                    set({
                        loading: false,
                        error: err instanceof Error ? err.message : 'Failed to leave room',
                    });
                }
            },

            fetchMyRooms: async () => {
                try {
                    const res = await fetch(`${getApiUrl()}/api/rooms`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const rooms = (await res.json()) as Room[];
                    set({ myRooms: rooms });
                } catch {
                    // Silently fail — room list is non-critical
                }
            },

            fetchTasks: async () => {
                const room = get().currentRoom;
                if (!room) return;
                try {
                    const res = await fetch(`${getApiUrl()}/api/rooms/${room.id}/tasks`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const tasks = (await res.json()) as RoomTask[];
                    set({ tasks });
                } catch {
                    // Silently fail
                }
            },

            createTask: async (title, prompt) => {
                const room = get().currentRoom;
                if (!room) return;
                set({ loading: true, error: null });
                try {
                    const res = await fetch(`${getApiUrl()}/api/rooms/${room.id}/tasks`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, prompt }),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    set({ loading: false });
                    get().fetchTasks();
                } catch (err) {
                    set({
                        loading: false,
                        error: err instanceof Error ? err.message : 'Failed to create task',
                    });
                }
            },

            updateMemberStatus: (memberId, status) => {
                set((state) => ({
                    members: state.members.map((m) =>
                        m.id === memberId ? { ...m, status } : m,
                    ),
                }));
            },

            setConnected: (connected) => set({ isConnected: connected }),

            reset: () => {
                roomSocket.disconnect();
                set({
                    currentRoom: null,
                    members: [],
                    tasks: [],
                    myRole: null,
                    isConnected: false,
                    error: null,
                });
            },
        }),
        {
            name: 'dokba-room-store',
            partialize: (state) => ({
                myRooms: state.myRooms,
                myRole: state.myRole,
            }),
        },
    ),
);

// ── WebSocket → Store Bridge ──

roomSocket.on((msg: RoomWsMessage) => {
    const store = useRoomStore.getState();

    switch (msg.type) {
        case 'ROOM_MEMBER_JOIN': {
            const member = msg.payload as unknown as RoomMember;
            useRoomStore.setState({
                members: [...store.members.filter((m) => m.id !== member.id), member],
            });
            break;
        }
        case 'ROOM_MEMBER_LEAVE': {
            const { memberId } = msg.payload as { memberId: string };
            useRoomStore.setState({
                members: store.members.filter((m) => m.id !== memberId),
            });
            break;
        }
        case 'ROOM_TASK_CREATED':
        case 'ROOM_TASK_ASSIGNED':
        case 'ROOM_TASK_COMPLETED': {
            // Re-fetch tasks list for any task event
            store.fetchTasks();
            break;
        }
        case 'ROOM_STATUS_UPDATE': {
            const { memberId, status } = msg.payload as { memberId: string; status: MemberStatus };
            store.updateMemberStatus(memberId, status);
            break;
        }
    }
});
