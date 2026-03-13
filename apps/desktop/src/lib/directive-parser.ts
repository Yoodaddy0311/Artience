/**
 * Directive Parser — parses CEO directives ($), task requests (#),
 * and normal messages from chat input.
 *
 * Rules:
 *   $ prefix → 'ceo' (company-wide directive routed via CTO)
 *   # prefix → 'task' (task request routed to recommended agent)
 *   @agentName → extracted as targetAgent
 *   otherwise → 'normal'
 */

export type DirectiveType = 'ceo' | 'task' | 'normal';

export interface ParsedDirective {
    type: DirectiveType;
    content: string;
    rawInput: string;
    targetAgent?: string;
}

const AGENT_MENTION_RE = /@([a-zA-Z][a-zA-Z0-9_-]*)/;

export function parseDirective(input: string): ParsedDirective {
    const trimmed = input.trim();

    if (trimmed.startsWith('$')) {
        const body = trimmed.slice(1).trim();
        const targetAgent = extractTargetAgent(body);
        return {
            type: 'ceo',
            content: removeAgentMention(body),
            rawInput: input,
            ...(targetAgent && { targetAgent }),
        };
    }

    if (trimmed.startsWith('#')) {
        const body = trimmed.slice(1).trim();
        const targetAgent = extractTargetAgent(body);
        return {
            type: 'task',
            content: removeAgentMention(body),
            rawInput: input,
            ...(targetAgent && { targetAgent }),
        };
    }

    return {
        type: 'normal',
        content: trimmed,
        rawInput: input,
    };
}

function extractTargetAgent(text: string): string | undefined {
    const match = text.match(AGENT_MENTION_RE);
    return match ? match[1] : undefined;
}

function removeAgentMention(text: string): string {
    return text.replace(AGENT_MENTION_RE, '').trim();
}
