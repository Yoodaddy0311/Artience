import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MailChangedFile {
    path: string;
    action: 'created' | 'modified' | 'deleted';
    linesAdded: number;
    linesRemoved: number;
}

export interface MailTestResults {
    passed: number;
    failed: number;
    skipped: number;
    coverage?: number;
}

export interface MailReport {
    summary: string;
    toolsUsed: string[];
    changedFiles: MailChangedFile[];
    testResults?: MailTestResults;
    duration?: number;
}

export interface MailAction {
    type: 'approved' | 'changes_requested' | 'acknowledged';
    timestamp: number;
    comment?: string;
}

export type MailStatus =
    | 'pending'
    | 'approved'
    | 'changes_requested'
    | 'acknowledged';

export interface MailMessage {
    id: string;
    fromAgentId: string;
    fromAgentName: string;
    subject: string;
    body: string;
    type: 'report' | 'error' | 'question' | 'notification';
    timestamp: number;
    read: boolean;
    report?: MailReport;
    status: MailStatus;
    actions: MailAction[];
}

interface MailState {
    messages: MailMessage[];
    unreadCount: number;
    isInboxOpen: boolean;
    addMessage: (
        msg: Omit<MailMessage, 'id' | 'read' | 'status' | 'actions'> &
            Partial<Pick<MailMessage, 'status' | 'actions'>>,
    ) => void;
    markAsRead: (id: string) => void;
    markAllRead: () => void;
    deleteMessage: (id: string) => void;
    clearAll: () => void;
    toggleInbox: () => void;
    setInboxOpen: (open: boolean) => void;
    updateStatus: (id: string, status: MailStatus, comment?: string) => void;
}

const computeUnread = (messages: MailMessage[]) =>
    messages.filter((m) => !m.read).length;

export const useMailStore = create<MailState>()(
    persist(
        (set) => ({
            messages: [],
            unreadCount: 0,
            isInboxOpen: false,

            addMessage: (msg) =>
                set((s) => {
                    const newMsg: MailMessage = {
                        ...msg,
                        id: crypto.randomUUID(),
                        read: false,
                        status: msg.status ?? 'pending',
                        actions: msg.actions ?? [],
                    };
                    const messages = [newMsg, ...s.messages];
                    return { messages, unreadCount: computeUnread(messages) };
                }),

            markAsRead: (id) =>
                set((s) => {
                    const messages = s.messages.map((m) =>
                        m.id === id ? { ...m, read: true } : m,
                    );
                    return { messages, unreadCount: computeUnread(messages) };
                }),

            markAllRead: () =>
                set((s) => ({
                    messages: s.messages.map((m) => ({ ...m, read: true })),
                    unreadCount: 0,
                })),

            deleteMessage: (id) =>
                set((s) => {
                    const messages = s.messages.filter((m) => m.id !== id);
                    return { messages, unreadCount: computeUnread(messages) };
                }),

            clearAll: () => set({ messages: [], unreadCount: 0 }),

            toggleInbox: () => set((s) => ({ isInboxOpen: !s.isInboxOpen })),

            setInboxOpen: (open) => set({ isInboxOpen: open }),

            updateStatus: (id, status, comment) =>
                set((s) => {
                    const action: MailAction = {
                        type: status as MailAction['type'],
                        timestamp: Date.now(),
                        comment,
                    };
                    const messages = s.messages.map((m) =>
                        m.id === id
                            ? {
                                  ...m,
                                  status,
                                  actions: [...m.actions, action],
                              }
                            : m,
                    );
                    return { messages };
                }),
        }),
        {
            name: 'dogba-mail-store',
            partialize: (state) => ({
                messages: state.messages,
            }),
            merge: (persisted, current) => {
                const merged = {
                    ...current,
                    ...(persisted as Partial<MailState>),
                };
                merged.unreadCount = computeUnread(merged.messages);
                return merged;
            },
        },
    ),
);
