import { describe, it, expect } from 'vitest';
import {
    toTaskSlug,
    formatDate,
    formatDateReadable,
    generateDependencyMermaid,
    generateArchitectureMermaid,
} from '../../../electron/report-generator';

describe('toTaskSlug', () => {
    it('converts spaces to hyphens', () => {
        expect(toTaskSlug('hello world test')).toBe('hello-world-test');
    });

    it('removes special characters', () => {
        expect(toTaskSlug('feat: add @login!')).toBe('feat-add-login');
    });

    it('truncates to 30 characters', () => {
        const long = 'a'.repeat(50);
        expect(toTaskSlug(long).length).toBeLessThanOrEqual(30);
    });

    it('handles Korean text', () => {
        const slug = toTaskSlug('코드 리뷰 완료');
        expect(slug).toBe('코드-리뷰-완료');
    });

    it('trims whitespace', () => {
        expect(toTaskSlug('  hello  ')).toBe('hello');
    });
});

describe('formatDate', () => {
    it('formats date as YYYY-MM-DD_HH-mm', () => {
        const d = new Date(2026, 2, 15, 14, 30);
        expect(formatDate(d)).toBe('2026-03-15_14-30');
    });

    it('pads single digits', () => {
        const d = new Date(2026, 0, 5, 9, 5);
        expect(formatDate(d)).toBe('2026-01-05_09-05');
    });
});

describe('formatDateReadable', () => {
    it('formats date as YYYY-MM-DD HH:mm', () => {
        const d = new Date(2026, 2, 15, 14, 30);
        expect(formatDateReadable(d)).toBe('2026-03-15 14:30');
    });
});

describe('generateDependencyMermaid', () => {
    it('returns empty string for no files', () => {
        expect(generateDependencyMermaid([])).toBe('');
    });

    it('generates mermaid graph with subgraphs per directory', () => {
        const files = [
            { file: 'src/lib/utils.ts', action: 'modified' },
            { file: 'src/lib/helper.ts', action: 'created' },
            { file: 'tests/unit.test.ts', action: 'created' },
        ];
        const result = generateDependencyMermaid(files);
        expect(result).toContain('graph TD');
        expect(result).toContain('subgraph');
        expect(result).toContain('utils.ts');
        expect(result).toContain('helper.ts');
        expect(result).toContain('unit.test.ts');
    });

    it('applies correct CSS classes', () => {
        const files = [
            { file: 'a.ts', action: 'created' },
            { file: 'b.ts', action: 'modified' },
            { file: 'c.ts', action: 'deleted' },
        ];
        const result = generateDependencyMermaid(files);
        expect(result).toContain(':::created');
        expect(result).toContain(':::modified');
        expect(result).toContain(':::deleted');
    });

    it('includes color definitions', () => {
        const files = [{ file: 'a.ts', action: 'created' }];
        const result = generateDependencyMermaid(files);
        expect(result).toContain('classDef created fill:#d4edda');
        expect(result).toContain('classDef modified fill:#cce5ff');
        expect(result).toContain('classDef deleted fill:#f8d7da');
    });
});

describe('generateArchitectureMermaid', () => {
    it('generates flowchart with nodes and edges', () => {
        const arch = {
            nodes: [
                { id: 'A', label: 'Frontend' },
                { id: 'B', label: 'Backend' },
            ],
            edges: [{ from: 'A', to: 'B', label: 'API' }],
        };
        const result = generateArchitectureMermaid(arch);
        expect(result).toContain('flowchart TD');
        expect(result).toContain('A["Frontend"]');
        expect(result).toContain('B["Backend"]');
        expect(result).toContain('A -->|API| B');
    });

    it('handles edges without labels', () => {
        const arch = {
            nodes: [
                { id: 'A', label: 'X' },
                { id: 'B', label: 'Y' },
            ],
            edges: [{ from: 'A', to: 'B' }],
        };
        const result = generateArchitectureMermaid(arch);
        expect(result).toContain('A --> B');
    });

    it('handles empty architecture', () => {
        const result = generateArchitectureMermaid({ nodes: [], edges: [] });
        expect(result).toContain('flowchart TD');
    });
});
