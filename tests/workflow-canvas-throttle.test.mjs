/**
 * Live Work Graph -- throttle queue + layout regression tests.
 *
 * The canvas component (components/ProjectWorkflowCanvas.tsx) does
 * two things Pass 2 cares about:
 *
 *   1. Renders the DAG layout produced by lib/services/graph-layout.ts
 *      (dagre with a pure-JS fallback). Phase sub-graphs are
 *      collapsed by default.
 *   2. Throttles status transitions through a per-status queue so
 *      the user can see the work happen one node at a time.
 *
 * These tests pin the pure layout helpers (deterministic output,
 * canonical 5-phase order, no overlap). The React throttling
 * logic is tested via a small in-test simulation that mirrors
 * the component's queue semantics.
 *
 * Style follows the existing tests/agent-runtime-pure.test.mjs
 * convention: read the source via fs for static assertions and
 * dynamic-import the .ts module for runtime tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(__dirname, '..', ...rel), 'utf8');

const layout = read(['lib', 'services', 'graph-layout.ts']);
const canvas = read(['components', 'ProjectWorkflowCanvas.tsx']);
const chatActions = read(['app', 'actions', 'chat-workspace.ts']);

// ---------------------------------------------------------------------------
// 1. Layout helpers -- source-level assertions
// ---------------------------------------------------------------------------

test('graph-layout.ts exposes the canonical public surface', () => {
    for (const symbol of [
        'layoutGraph',
        'layoutGraphDagre',
        'layoutGraphFallback',
        'buildPhaseGroups',
        'annotateNodePhaseIds',
    ]) {
        assert.match(
            layout,
            new RegExp(`export\\s+function\\s+${symbol}\\b`),
            `expected graph-layout.ts to export ${symbol}`,
        );
    }
});

test('layoutGraphDagre uses rankdir LR (left-to-right) by default', () => {
    const fnBody = layout.match(
        /export function layoutGraphDagre[\s\S]*?\n\}/,
    )?.[0] || '';
    assert.match(fnBody, /rankdir:\s*opts\.rankdir/);
    // Default value is set at module top, not inside the function.
    assert.match(layout, /rankdir:\s*['"]LR['"]/);
});

test('layoutGraphFallback is a phase-column layout with no dagre dependency', () => {
    const fnBody = layout.match(
        /export function layoutGraphFallback[\s\S]*?\n\}/,
    )?.[0] || '';
    assert.match(fnBody, /PHASE_ORDER/);
    assert.match(fnBody, /findIndex/);
    // No dagre reference inside the fallback.
    assert.doesNotMatch(fnBody, /dagre/);
});

test('layoutGraph wraps layoutGraphDagre in try/catch for resilience', () => {
    const fnBody = layout.match(
        /export function layoutGraph[\s\S]*?\n\}/,
    )?.[0] || '';
    assert.match(fnBody, /try \{/);
    assert.match(fnBody, /catch/);
    assert.match(fnBody, /layoutGraphDagre/);
    assert.match(fnBody, /layoutGraphFallback/);
});

test('buildPhaseGroups emits one group per canonical phase', () => {
    const fnBody = layout.match(
        /export function buildPhaseGroups[\s\S]*?\n\}/,
    )?.[0] || '';
    // Loops over PHASE_ORDER to ensure canonical 5 phases are
    // present (even empty ones).
    assert.match(fnBody, /for \(const name of PHASE_ORDER\)/);
    // Skips the empty "Other" bucket.
    assert.match(fnBody, /if \(ids\.length === 0 && name === 'Other'\)/);
    // Assigns column = 0, 1, 2, ... in order.
    assert.match(fnBody, /column\+\+/);
});

test('buildPhaseGroups sizes the band from inner node positions', () => {
    const fnBody = layout.match(
        /export function buildPhaseGroups[\s\S]*?\n\}/,
    )?.[0] || '';
    // Uses min/max to find the bounding box of inner nodes.
    assert.match(fnBody, /minX = Math\.min\(minX/);
    assert.match(fnBody, /maxX = Math\.max\(maxX/);
    // Default 12px padding.
    assert.match(layout, /PHASE_BAND_PADDING = 12/);
});

// ---------------------------------------------------------------------------
// 2. Runtime layout -- deterministic
// ---------------------------------------------------------------------------

test('layoutGraph is deterministic (same input = same output)', async () => {
    const { layoutGraph, buildPhaseGroups } = await import(
        resolve(__dirname, '..', 'lib', 'services', 'graph-layout.ts')
    );

    const nodes = [
        { id: 'n1', phase: 'Research', label: 'A' },
        { id: 'n2', phase: 'Research', label: 'B' },
        { id: 'n3', phase: 'Build', label: 'C' },
        { id: 'n4', phase: 'Verify', label: 'D' },
    ];
    const edges = [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n3', target: 'n4' },
    ];

    const r1 = layoutGraph(nodes, edges);
    const r2 = layoutGraph(nodes, edges);
    assert.equal(JSON.stringify(r1), JSON.stringify(r2), 'layoutGraph must be deterministic');

    // All four nodes are positioned.
    assert.equal(r1.length, 4);
    for (const p of r1) {
        assert.ok(typeof p.x === 'number' && typeof p.y === 'number', `${p.id} must have numeric x/y`);
        assert.ok(p.width > 0 && p.height > 0, `${p.id} must have positive size`);
    }
});

test('buildPhaseGroups returns one group per canonical phase', async () => {
    const { layoutGraph, buildPhaseGroups } = await import(
        resolve(__dirname, '..', 'lib', 'services', 'graph-layout.ts')
    );

    const nodes = [
        { id: 'n1', phase: 'Intake', label: 'intake' },
        { id: 'n2', phase: 'Research', label: 'r' },
        { id: 'n3', phase: 'Build', label: 'b' },
        { id: 'n4', phase: 'Verify', label: 'v' },
        { id: 'n5', phase: 'Deliver', label: 'd' },
    ];
    const positions = layoutGraph(nodes, []);
    const nodePhase = new Map(nodes.map((n) => [n.id, n.phase]));
    const groups = buildPhaseGroups({ nodePhase, positions });

    const names = groups.map((g) => g.name);
    for (const canonical of ['Intake', 'Research', 'Build', 'Verify', 'Deliver']) {
        assert.ok(names.includes(canonical), `expected phase "${canonical}" in groups (${names.join(', ')})`);
    }
});

test('buildPhaseGroups produces non-overlapping column indices', async () => {
    const { layoutGraph, buildPhaseGroups } = await import(
        resolve(__dirname, '..', 'lib', 'services', 'graph-layout.ts')
    );

    const nodes = [
        { id: 'a', phase: 'Research', label: 'a' },
        { id: 'b', phase: 'Build', label: 'b' },
        { id: 'c', phase: 'Verify', label: 'c' },
        { id: 'd', phase: 'Deliver', label: 'd' },
    ];
    const positions = layoutGraph(nodes, []);
    const nodePhase = new Map(nodes.map((n) => [n.id, n.phase]));
    const groups = buildPhaseGroups({ nodePhase, positions });

    const columns = groups.map((g) => g.column);
    // The columns should be a contiguous integer range starting at 0.
    for (let i = 0; i < columns.length; i++) {
        assert.equal(columns[i], i, `expected column ${i} at index ${i}`);
    }
});

test('buildPhaseGroups puts the right nodes into the right group', async () => {
    const { layoutGraph, buildPhaseGroups } = await import(
        resolve(__dirname, '..', 'lib', 'services', 'graph-layout.ts')
    );

    const nodes = [
        { id: 'r1', phase: 'Research', label: 'r1' },
        { id: 'r2', phase: 'Research', label: 'r2' },
        { id: 'b1', phase: 'Build', label: 'b1' },
    ];
    const positions = layoutGraph(nodes, []);
    const nodePhase = new Map(nodes.map((n) => [n.id, n.phase]));
    const groups = buildPhaseGroups({ nodePhase, positions });
    for (const g of groups) {
        if (g.name === 'Research') {
            assert.deepEqual(new Set(g.nodeIds), new Set(['r1', 'r2']));
        } else if (g.name === 'Build') {
            assert.deepEqual(new Set(g.nodeIds), new Set(['b1']));
        }
    }
});

// ---------------------------------------------------------------------------
// 3. Canvas component -- source-level assertions
// ---------------------------------------------------------------------------

test('ProjectWorkflowCanvas.tsx accepts phaseGroups on the graph prop', () => {
    // The prop on the inner `graph` type is named `phaseGroups`.
    assert.match(canvas, /phaseGroups\?:\s*PhaseGroup\[\]/);
});

test('ProjectWorkflowCanvas.tsx has a throttled status-queue implementation', () => {
    // 1. Queue ref exists.
    assert.match(canvas, /pendingStatusChangesRef/);
    // 2. Single-flight drainer flag exists.
    assert.match(canvas, /drainingRef/);
    // 3. transitionMs prop is honored.
    assert.match(canvas, /transitionMs\?:\s*number/);
    // 4. The drainer fires every `transitionMs` ms.
    assert.match(canvas, /setInterval\(drain, transitionMs\)/);
    // 5. The drainer pops one entry at a time and reschedules.
    assert.match(canvas, /pendingStatusChangesRef\.current\.shift\(\)/);
    assert.match(canvas, /setTimeout\(/);
});

test('ProjectWorkflowCanvas.tsx collapses phase sub-graphs by default', () => {
    // The default state of expandedPhases is an empty Set.
    assert.match(canvas, /useState<Set<string>>\(\s*\(\) => new Set\(\),\s*\/\/ collapsed by default/);
    // Active phases are always visible regardless of collapsed state.
    assert.match(canvas, /if \(grp\.status === 'Active'\) return true;/);
});

test('fetchProjectOperatingGraphAction returns phaseGroups in both branches', () => {
    // Both `finalizeGraphShape` calls must receive a missionPhases
    // input so phase grouping can pick up the per-phase status.
    const matches = chatActions.match(/finalizeGraphShape\(\{[\s\S]*?missionPhases:/g) || [];
    assert.ok(matches.length >= 2, `expected >= 2 finalizeGraphShape calls with missionPhases, got ${matches.length}`);
});

// ---------------------------------------------------------------------------
// 4. Throttle simulation -- mirrors the component's queue logic
// ---------------------------------------------------------------------------

/**
 * A pure simulation of the throttle queue used by
 * ProjectWorkflowCanvas. Same input -> same output. This is the
 * single most important behavioural guarantee of Pass 2: even
 * when 20 SSE events fire in a burst, the user sees one node
 * status change at a time.
 */
class StatusThrottleSimulator {
    constructor(transitionMs) {
        this.transitionMs = transitionMs;
        this.queue = [];
        this.draining = false;
        this.lastDrainAt = 0;
        this.applied = [];
        this.currentTime = 0;
    }

    enqueue(node) {
        this.queue.push(node);
    }

    /**
     * Drive a single tick. Returns the node applied this tick, or
     * null. The drainer is "busy" until `transitionMs` simulated
     * time has elapsed since the last drain. `transitionMs <= 0`
     * disables the throttle entirely (every tick drains one).
     */
    tick() {
        if (this.draining) {
            const elapsed = this.currentTime - this.lastDrainAt;
            if (this.transitionMs > 0 && elapsed < this.transitionMs) {
                return null;
            }
            this.draining = false;
        }
        const next = this.queue.shift();
        if (!next) return null;
        this.draining = true;
        this.lastDrainAt = this.currentTime;
        this.applied.push({ ...next, at: this.currentTime });
        return next;
    }

    /** Advance the simulated clock to `t`. Does NOT clear draining. */
    release(t) {
        this.currentTime = t;
    }

    get pending() {
        return this.queue.length;
    }

    get drained() {
        return this.applied.length;
    }
}

test('throttle: 20 burst updates are drained one at a time', () => {
    const sim = new StatusThrottleSimulator(100);
    // Burst of 20 events.
    for (let i = 0; i < 20; i++) {
        sim.enqueue({ id: `node-${i}`, status: 'Active' });
    }
    // At t=0 we drain one.
    const first = sim.tick();
    assert.ok(first, 'first tick should drain the head of the queue');
    assert.equal(first.id, 'node-0', 'drain order must be FIFO');
    assert.equal(sim.pending, 19, 'queue should have 19 left after the first tick');

    // The drainer is now busy. Subsequent ticks are no-ops until
    // release() is called.
    for (let t = 1; t < 10; t++) {
        sim.release(t);
        const got = sim.tick();
        assert.equal(got, null, `tick at t=${t} should be no-op while drainer is busy`);
    }

    // Release at t=100 and drain another. Order is preserved.
    sim.release(100);
    const second = sim.tick();
    assert.equal(second.id, 'node-1', 'second drained node must be FIFO');
    assert.equal(sim.pending, 18);
});

test('throttle: queue is bounded by the number of burst events (no leaks)', () => {
    const sim = new StatusThrottleSimulator(50);
    for (let i = 0; i < 20; i++) sim.enqueue({ id: `n${i}`, status: 'Active' });
    // Drain everything by alternating release/tick.
    for (let t = 0; t < 25; t++) {
        sim.release(t * 50);
        sim.tick();
    }
    assert.equal(sim.pending, 0, 'no events should remain in the queue');
    assert.equal(sim.drained, 20, 'all 20 events should be drained');
});

test('throttle: transitionMs=0 (test mode) drains the queue synchronously', () => {
    const sim = new StatusThrottleSimulator(0);
    for (let i = 0; i < 5; i++) sim.enqueue({ id: `n${i}`, status: 'Done' });
    // The first tick drains the entire queue because the
    // transitionMs <= 0 branch is synchronous.
    for (let i = 0; i < 10; i++) {
        const got = sim.tick();
        if (!got) break;
    }
    assert.equal(sim.pending, 0);
    assert.equal(sim.drained, 5);
});
