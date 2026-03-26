import { describe, it, expect, beforeEach } from 'vitest';
import { AgentP2PBus, type P2PMessage } from '../../../electron/agent-p2p';

describe('AgentP2PBus', () => {
    let bus: AgentP2PBus;

    beforeEach(() => {
        bus = new AgentP2PBus();
    });

    it('sends a message and stores in recipient inbox', () => {
        const msg = bus.send('sera', 'rio', 'Hello Rio!');
        expect(msg.from).toBe('sera');
        expect(msg.to).toBe('rio');
        expect(msg.content).toBe('Hello Rio!');
        expect(msg.read).toBe(false);

        const inbox = bus.getInbox('rio');
        expect(inbox.length).toBe(1);
        expect(inbox[0].content).toBe('Hello Rio!');
    });

    it('returns empty array for empty inbox', () => {
        expect(bus.getInbox('unknown')).toEqual([]);
    });

    it('filters unread messages', () => {
        const msg = bus.send('sera', 'rio', 'msg1');
        bus.send('sera', 'rio', 'msg2');

        bus.markRead('rio', msg.id);

        const unread = bus.getInbox('rio', true);
        expect(unread.length).toBe(1);
        expect(unread[0].content).toBe('msg2');
    });

    it('markRead returns false for non-existent message', () => {
        expect(bus.markRead('rio', 'fake-id')).toBe(false);
    });

    it('markRead returns false for non-existent agent', () => {
        expect(bus.markRead('nonexistent', 'fake-id')).toBe(false);
    });

    it('clears inbox', () => {
        bus.send('sera', 'rio', 'msg');
        bus.clearInbox('rio');
        expect(bus.getInbox('rio')).toEqual([]);
    });

    it('gets conversation between two agents', () => {
        bus.send('sera', 'rio', 'Hi Rio');
        bus.send('rio', 'sera', 'Hi Sera');
        bus.send('sera', 'rio', 'How are you?');

        // getConversation(A, B) returns:
        //   A's inbox from B + B's inbox from A, sorted by timestamp
        const conv = bus.getConversation('sera', 'rio');
        expect(conv.length).toBe(3);
        // All three messages should be present
        const contents = conv.map((m) => m.content);
        expect(contents).toContain('Hi Rio');
        expect(contents).toContain('Hi Sera');
        expect(contents).toContain('How are you?');
        // Should be sorted by timestamp (ascending)
        for (let i = 1; i < conv.length; i++) {
            expect(conv[i].timestamp).toBeGreaterThanOrEqual(
                conv[i - 1].timestamp,
            );
        }
    });

    it('emits message event on send', () => {
        let emitted = false;
        bus.on('message', (from: string, to: string, msg: P2PMessage) => {
            emitted = true;
            expect(from).toBe('sera');
            expect(to).toBe('rio');
            expect(msg.content).toBe('test');
        });
        bus.send('sera', 'rio', 'test');
        expect(emitted).toBe(true);
    });

    it('evicts oldest messages when over limit', () => {
        // Default max is 100
        for (let i = 0; i < 105; i++) {
            bus.send('sera', 'rio', `msg-${i}`);
        }
        const inbox = bus.getInbox('rio');
        expect(inbox.length).toBe(100);
        // Oldest messages (0-4) should be evicted
        expect(inbox[0].content).toBe('msg-5');
    });
});
