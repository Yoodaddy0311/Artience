import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface P2PMessage {
    id: string;
    from: string;
    to: string;
    content: string;
    timestamp: number;
    read: boolean;
}

export class AgentP2PBus extends EventEmitter {
    private inbox: Map<string, P2PMessage[]> = new Map();
    private maxPerAgent = 100;

    send(from: string, to: string, content: string): P2PMessage {
        const msg: P2PMessage = {
            id: randomUUID(),
            from,
            to,
            content,
            timestamp: Date.now(),
            read: false,
        };

        const messages = this.inbox.get(to) || [];
        messages.push(msg);

        // Evict oldest when over limit
        if (messages.length > this.maxPerAgent) {
            messages.splice(0, messages.length - this.maxPerAgent);
        }

        this.inbox.set(to, messages);
        this.emit('message', from, to, msg);
        return msg;
    }

    getInbox(agentId: string, unreadOnly = false): P2PMessage[] {
        const messages = this.inbox.get(agentId) || [];
        if (unreadOnly) {
            return messages.filter((m) => !m.read);
        }
        return [...messages];
    }

    markRead(agentId: string, messageId: string): boolean {
        const messages = this.inbox.get(agentId);
        if (!messages) return false;

        const msg = messages.find((m) => m.id === messageId);
        if (!msg) return false;

        msg.read = true;
        return true;
    }

    clearInbox(agentId: string): void {
        this.inbox.delete(agentId);
    }

    getConversation(agentA: string, agentB: string): P2PMessage[] {
        const aMessages = this.inbox.get(agentA) || [];
        const bMessages = this.inbox.get(agentB) || [];

        const conversation = [
            ...aMessages.filter((m) => m.from === agentB),
            ...bMessages.filter((m) => m.from === agentA),
        ];

        conversation.sort((a, b) => a.timestamp - b.timestamp);
        return conversation;
    }
}

export const agentP2P = new AgentP2PBus();
