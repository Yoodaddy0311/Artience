import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../../electron/artibot-registry';

describe('parseFrontmatter', () => {
    it('returns empty object when no frontmatter', () => {
        expect(parseFrontmatter('no frontmatter here')).toEqual({});
    });

    it('parses simple key-value pairs', () => {
        const content = `---
name: test-skill
description: A test skill
category: development
---
Body content here`;

        const result = parseFrontmatter(content);
        expect(result.name).toBe('test-skill');
        expect(result.description).toBe('A test skill');
        expect(result.category).toBe('development');
    });

    it('parses list values', () => {
        const content = `---
name: my-skill
triggers:
  - "build"
  - "compile"
  - "deploy"
---`;

        const result = parseFrontmatter(content);
        expect(result.name).toBe('my-skill');
        expect(result.triggers).toEqual(['build', 'compile', 'deploy']);
    });

    it('parses inline list [a, b, c]', () => {
        const content = `---
platforms: [windows, macos, linux]
---`;

        const result = parseFrontmatter(content);
        expect(result.platforms).toEqual(['windows', 'macos', 'linux']);
    });

    it('strips quotes from values', () => {
        const content = `---
name: "quoted-name"
value: 'single-quoted'
---`;

        const result = parseFrontmatter(content);
        expect(result.name).toBe('quoted-name');
        expect(result.value).toBe('single-quoted');
    });

    it('handles empty frontmatter', () => {
        const content = `---
---`;

        const result = parseFrontmatter(content);
        expect(result).toEqual({});
    });

    it('handles mixed key-values and lists', () => {
        const content = `---
name: complex
version: 1.0
tags:
  - alpha
  - beta
author: test
---`;

        const result = parseFrontmatter(content);
        expect(result.name).toBe('complex');
        expect(result.version).toBe('1.0');
        expect(result.tags).toEqual(['alpha', 'beta']);
        expect(result.author).toBe('test');
    });
});
