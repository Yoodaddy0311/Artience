import Store from 'electron-store';
import { AGENT_PERSONAS } from '../src/data/agent-personas';

export interface AgentRecord {
    id: string;
    name: string;
    role: string;
    personality: string;
    department?: string;
    provider?: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

interface AgentDbSchema {
    agents: Record<string, AgentRecord>;
    seeded: boolean;
}

class AgentDB {
    private store: Store<AgentDbSchema> | null = null;

    init(): void {
        if (this.store) return;
        this.store = new Store<AgentDbSchema>({
            name: 'artience-agents',
            defaults: {
                agents: {},
                seeded: false,
            },
        });
    }

    seed(): void {
        this.ensureInit();
        if (this.store!.get('seeded')) return;

        const now = new Date().toISOString();
        const agents = this.store!.get('agents');

        for (const [id, persona] of Object.entries(AGENT_PERSONAS)) {
            if (agents[id]) continue;
            agents[id] = {
                id,
                name: id.charAt(0).toUpperCase() + id.slice(1),
                role: persona.role,
                personality: persona.personality,
                active: true,
                createdAt: now,
                updatedAt: now,
            };
        }

        this.store!.set('agents', agents);
        this.store!.set('seeded', true);
    }

    getAll(includeInactive = false): AgentRecord[] {
        this.ensureInit();
        const agents = Object.values(this.store!.get('agents'));
        if (includeInactive) return agents;
        return agents.filter((a) => a.active);
    }

    get(id: string): AgentRecord | undefined {
        this.ensureInit();
        return this.store!.get('agents')[id];
    }

    create(agent: Omit<AgentRecord, 'createdAt' | 'updatedAt'>): AgentRecord {
        this.ensureInit();
        const agents = this.store!.get('agents');
        if (agents[agent.id]) {
            throw new Error(`Agent '${agent.id}' already exists`);
        }

        const now = new Date().toISOString();
        const record: AgentRecord = {
            ...agent,
            createdAt: now,
            updatedAt: now,
        };
        agents[agent.id] = record;
        this.store!.set('agents', agents);
        return record;
    }

    update(id: string, patch: Partial<AgentRecord>): AgentRecord | undefined {
        this.ensureInit();
        const agents = this.store!.get('agents');
        const existing = agents[id];
        if (!existing) return undefined;

        const updated: AgentRecord = {
            ...existing,
            ...patch,
            id, // prevent id overwrite
            updatedAt: new Date().toISOString(),
        };
        agents[id] = updated;
        this.store!.set('agents', agents);
        return updated;
    }

    delete(id: string): boolean {
        this.ensureInit();
        const agents = this.store!.get('agents');
        if (!agents[id]) return false;

        agents[id] = {
            ...agents[id],
            active: false,
            updatedAt: new Date().toISOString(),
        };
        this.store!.set('agents', agents);
        return true;
    }

    search(query: string): AgentRecord[] {
        this.ensureInit();
        const q = query.toLowerCase();
        return Object.values(this.store!.get('agents')).filter(
            (a) =>
                a.active &&
                (a.name.toLowerCase().includes(q) ||
                    a.role.toLowerCase().includes(q) ||
                    a.personality.toLowerCase().includes(q)),
        );
    }

    private ensureInit(): void {
        if (!this.store) {
            this.init();
        }
    }
}

export const agentDB = new AgentDB();
