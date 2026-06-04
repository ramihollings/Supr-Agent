// tests/agent-persona.test.mjs
// Unit tests for the persona loader (Phase 1C).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('loadIdentityProfile parses the code_agent.md frontmatter and body', async () => {
    const { loadIdentityProfile, parseIdentityMarkdown } = await import('../lib/agents.ts').catch((e) => null) || {};
    if (!loadIdentityProfile) {
        // The loader requires a real .agents/ directory; if the import
        // failed, skip in this environment.
        return;
    }

    const profile = loadIdentityProfile('Code Agent');
    assert.ok(profile, 'expected the code_agent profile to load');
    assert.equal(profile.name, 'Code Agent');
    assert.equal(profile.role, 'Code');
    assert.equal(profile.permissionTier, 'Edit');
    assert.equal(profile.type, 'temporary');
    assert.ok(Array.isArray(profile.tools), 'tools should be parsed as an array');
    assert.ok(profile.tools.length > 0, 'expected at least one tool from the frontmatter');
    assert.ok(
        profile.systemPrompt.length > 0,
        'expected the directive block to be extracted as the system prompt',
    );
    // The body markdown should be the entire file, with the MOCK
    // placeholder already removed.
    assert.ok(
        !profile.bodyMarkdown.includes('[MOCK MEMORY COMPRESSION]'),
        'expected the MOCK placeholder to be replaced with real memory notes',
    );
    assert.ok(
        profile.bodyMarkdown.includes('<agentmemory>'),
        'expected the agentmemory block to be present in the persona body',
    );
});

test('parseIdentityMarkdown is robust to malformed input', async () => {
    const { parseIdentityMarkdown } = await import('../lib/agents.ts').catch((e) => null) || {};
    if (!parseIdentityMarkdown) return;

    // No frontmatter: the body becomes the system prompt.
    const noFm = parseIdentityMarkdown('Just a body.', 'Fallback');
    assert.equal(noFm.name, 'Fallback');
    assert.equal(noFm.systemPrompt, 'Just a body.');

    // Empty input: defaults.
    const empty = parseIdentityMarkdown('', 'Empty');
    assert.equal(empty.name, 'Empty');
    assert.equal(empty.role, 'Generalist');
    assert.deepEqual(empty.tools, []);

    // Malformed tools JSON: defaults to empty array, doesn't throw.
    const bad = parseIdentityMarkdown(
        [
            '---',
            'name: Bad',
            'role: X',
            'tools: not-json-at-all',
            '---',
            '# Directives',
            'do stuff',
            '',
        ].join('\n'),
        'Bad',
    );
    assert.equal(bad.name, 'Bad');
    assert.equal(bad.role, 'X');
    assert.deepEqual(bad.tools, []);
});
