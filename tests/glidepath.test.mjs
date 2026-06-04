// tests/glidepath.test.mjs
// Unit tests for the glidepath template loader (Phase 3A).
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('loadGlidepathTemplate loads the default_mission template', async () => {
    const mod = await import('../lib/runtime/project-flow.ts').catch((e) => null);
    if (!mod || !mod.loadGlidepathTemplate) return;
    const tpl = mod.loadGlidepathTemplate('default_mission');
    assert.ok(tpl, 'expected the default_mission template to load');
    assert.equal(tpl.templateId, 'default_mission');
    assert.ok(tpl.phases.length >= 3, 'default_mission should have multiple phases');
    assert.ok(tpl.failurePolicy, 'expected a failurePolicy');
});

test('loadGlidepathTemplate loads the feature_development template', async () => {
    const mod = await import('../lib/runtime/project-flow.ts').catch((e) => null);
    if (!mod || !mod.loadGlidepathTemplate) return;
    const tpl = mod.loadGlidepathTemplate('feature_development');
    assert.ok(tpl, 'expected the feature_development template to load');
    assert.equal(tpl.templateId, 'feature_development');
    assert.equal(tpl.phases.length, 7, 'feature_development has 7 phases');
    // The architecture phase is approval-gated.
    const arch = tpl.phases.find((p) => p.id === 'architecture');
    assert.ok(arch, 'expected an architecture phase');
    assert.equal(arch.approvalGate, true, 'architecture phase should be approval-gated');
});

test('loadGlidepathTemplate returns null for a missing template id', async () => {
    const mod = await import('../lib/runtime/project-flow.ts').catch((e) => null);
    if (!mod || !mod.loadGlidepathTemplate) return;
    const tpl = mod.loadGlidepathTemplate('does-not-exist');
    assert.equal(tpl, null);
});

test('selectGlidepathTemplateForObjective picks feature_development for feature requests', async () => {
    const mod = await import('../lib/runtime/project-flow.ts').catch((e) => null);
    if (!mod || !mod.selectGlidepathTemplateForObjective) return;
    assert.equal(mod.selectGlidepathTemplateForObjective('Build a new feature for the dashboard').templateId, 'feature_development');
    assert.equal(mod.selectGlidepathTemplateForObjective('Implement user authentication').templateId, 'feature_development');
    assert.equal(mod.selectGlidepathTemplateForObjective('Add a new feature to the API').templateId, 'feature_development');
});

test('selectGlidepathTemplateForObjective picks default_mission for non-feature work', async () => {
    const mod = await import('../lib/runtime/project-flow.ts').catch((e) => null);
    if (!mod || !mod.selectGlidepathTemplateForObjective) return;
    assert.equal(mod.selectGlidepathTemplateForObjective('Research the market and write a report').templateId, 'default_mission');
    assert.equal(mod.selectGlidepathTemplateForObjective('').templateId, 'default_mission');
});
