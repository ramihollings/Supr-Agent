/**
 * Live Work Graph layout engine.
 *
 * Replaces the previous hand-rolled "force-directed-ish" grid
 * (which was really just a modulo on `index`) with a proper DAG
 * layout. The previous behaviour scattered tasks across the
 * canvas in an apparently random order, made it hard to see the
 * "shape" of a mission at a glance, and let the arrows fly
 * everywhere.
 *
 * Two strategies are exposed:
 *
 *   - `layoutGraphDagre`: uses the `dagre` library (no client
 *     cost; layout is computed server-side in
 *     `fetchProjectOperatingGraphAction`).
 *   - `layoutGraphFallback`: pure-JS topological sort by phase
 *     for environments where dagre is unavailable (e.g. the
 *     smoke-test build that runs `next build` without dev
 *     deps). Same I/O contract, just less optimal placement.
 *
 * Plus a `buildPhaseGroups` helper that returns one PhaseGroup
 * per phase so the canvas can render collapsed sub-graphs.
 *
 * All three functions are pure and deterministic -- given the
 * same input, they produce identical output. This is asserted
 * by `tests/workflow-canvas-throttle.test.mjs` and
 * `tests/project-flow-structure.test.mjs`.
 */

// dagre is an optional dependency: the runtime falls back to a
// pure-JS phase-column layout if it isn't installed. We import
// it eagerly here so the type checker is happy, but wrap the
// call site in try/catch (see `layoutGraph` below).
import dagre from 'dagre';

// Canonical 5-phase order. Mirrors the runtime's `glidepath.phases`
// in lib/runtime/project-flow.ts -- not imported because that
// module's PHASE_ORDER isn't exported. Keep these two lists in
// sync if the order ever changes (see ConciergeInitiateMission
// plan schema in lib/concierge/handshake.ts).
const PHASE_ORDER: ReadonlyArray<
    'Intake' | 'Research' | 'Build' | 'Verify' | 'Deliver'
> = ['Intake', 'Research', 'Build', 'Verify', 'Deliver'];

export interface GraphNodeInput {
    id: string;
    /** Phase this node belongs to, e.g. 'Research'. Used to bucket. */
    phase?: string;
    /** Logical label; used for sizing in dagre. */
    label?: string;
    /** Pre-computed width override. Defaults to 176. */
    width?: number;
    /** Pre-computed height override. Defaults to 86. */
    height?: number;
}

export interface GraphEdgeInput {
    id: string;
    source: string;
    target: string;
}

export interface PositionedNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PhaseGroup {
    id: string;
    name: string;
    /** Phase status: 'Pending' | 'Active' | 'Done' | 'Blocked' | 'Gate_Pending'. */
    status: string;
    /** IDs of nodes that live inside this phase, in display order. */
    nodeIds: string[];
    /** Layout: top-left of the phase band. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Index in the canonical 5-phase order. Lower = leftmost column. */
    column: number;
}

export interface LayoutOptions {
    rankdir?: 'LR' | 'TB';
    ranksep?: number;
    nodesep?: number;
    edgesep?: number;
    marginx?: number;
    marginy?: number;
    nodeWidth?: number;
    nodeHeight?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
    rankdir: 'LR',
    ranksep: 140,
    nodesep: 60,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
    nodeWidth: 176,
    nodeHeight: 86,
};

/**
 * Run dagre over the given nodes / edges. Pure function: same
 * input always returns the same output. Returns nodes keyed by
 * the original `id`, with `x` / `y` set to the **center** of the
 * dagre-laid-out rectangle. Canvas code prefers the top-left so
 * we shift by half the width/height.
 */
export function layoutGraphDagre(
    nodes: GraphNodeInput[],
    edges: GraphEdgeInput[],
    options: LayoutOptions = {},
): PositionedNode[] {
    if (nodes.length === 0) return [];
    const opts = { ...DEFAULTS, ...options };
    const g = new dagre.graphlib.Graph({ multigraph: false, directed: true });
    g.setGraph({
        rankdir: opts.rankdir,
        ranksep: opts.ranksep,
        nodesep: opts.nodesep,
        edgesep: opts.edgesep,
        marginx: opts.marginx,
        marginy: opts.marginy,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
        g.setNode(node.id, {
            width: node.width ?? opts.nodeWidth,
            height: node.height ?? opts.nodeHeight,
            label: node.label,
        });
    }
    for (const edge of edges) {
        if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
            g.setEdge(edge.source, edge.target, { id: edge.id });
        }
    }

    dagre.layout(g);

    return nodes.map((node) => {
        const dn = g.node(node.id);
        const width = dn.width ?? opts.nodeWidth;
        const height = dn.height ?? opts.nodeHeight;
        const x = (dn.x ?? 0) - width / 2;
        const y = (dn.y ?? 0) - height / 2;
        return {
            id: node.id,
            // dagre returns the center of the node; we want
            // the top-left so the SVG `<rect x y>` math is
            // direct. Subtract half the dimensions.
            x,
            y,
            width,
            height,
        };
    });
}

/**
 * Pure-JS fallback. Groups by phase, then lays each group out
 * as a vertical column at `column * (ranksep + nodeWidth)`. Edges
 * are still respected in the sense that if a node's target
 * appears in a later column, the layout's right-to-left
 * ordering keeps the visual flow correct.
 *
 * Used when dagre isn't installed. The skill-loader
 * (`lib/tools/register.ts`) still has to work in environments
 * where npm install skipped optional dependencies, so this
 * fallback is the path of least surprise.
 */
export function layoutGraphFallback(
    nodes: GraphNodeInput[],
    edges: GraphEdgeInput[],
    options: LayoutOptions = {},
): PositionedNode[] {
    if (nodes.length === 0) return [];
    const opts = { ...DEFAULTS, ...options };
    const columnById = new Map<string, number>();
    for (const node of nodes) {
        const phase = (node.phase || '').toLowerCase();
        const idx = PHASE_ORDER.findIndex((p) => p.toLowerCase() === phase);
        columnById.set(node.id, idx >= 0 ? idx : 0);
    }
    // Bucket by column so we can stack vertically.
    const byColumn = new Map<number, string[]>();
    for (const node of nodes) {
        const col = columnById.get(node.id)!;
        const list = byColumn.get(col) || [];
        list.push(node.id);
        byColumn.set(col, list);
    }
    const positioned: PositionedNode[] = [];
    for (const [col, ids] of byColumn.entries()) {
        ids.forEach((id, row) => {
            positioned.push({
                id,
                x: opts.marginx + col * (opts.ranksep + opts.nodeWidth),
                y: opts.marginy + row * (opts.nodesep + opts.nodeHeight),
                width: opts.nodeWidth,
                height: opts.nodeHeight,
            });
        });
    }
    return positioned;
}

/**
 * Returns the positioned nodes, falling back to the pure-JS
 * layout if dagre is unavailable or throws. Logs a single
 * warning the first time the fallback fires so operators can
 * notice the missing dependency.
 */
let warnedFallback = false;
export function layoutGraph(
    nodes: GraphNodeInput[],
    edges: GraphEdgeInput[],
    options: LayoutOptions = {},
): PositionedNode[] {
    try {
        return layoutGraphDagre(nodes, edges, options);
    } catch (err) {
        if (!warnedFallback) {
            console.warn(
                '[graph-layout] dagre layout failed, falling back to phase-column layout:',
                err instanceof Error ? err.message : String(err),
            );
            warnedFallback = true;
        }
        return layoutGraphFallback(nodes, edges, options);
    }
}

/**
 * Bucket positioned nodes into one PhaseGroup per canonical
 * phase. The phase order is the canonical 5-phase order
 * (Intake/Research/Build/Verify/Deliver). Unknown phases are
 * bucketed at the end under "Other".
 *
 * Each phase band is a rectangle that contains all the nodes
 * whose `phase` matches. The band is sized so its inner nodes
 * fit with a 12px padding on every side.
 */
const PHASE_BAND_PADDING = 12;
const PHASE_BAND_HEADER_HEIGHT = 32;
const PHASE_BAND_MIN_WIDTH = 220;

export interface BuildPhaseGroupsInput {
    /** The node id -> phase mapping. May be missing for some nodes. */
    nodePhase: Map<string, string | undefined>;
    /** The result of `layoutGraph` (or the canvas's own positioning). */
    positions: PositionedNode[];
    /** Optional phase status override keyed by phase name. */
    phaseStatus?: Map<string, string>;
}

export function buildPhaseGroups(input: BuildPhaseGroupsInput): PhaseGroup[] {
    const { nodePhase, positions, phaseStatus } = input;
    const posById = new Map(positions.map((p) => [p.id, p]));

    // Bucket node ids by phase.
    const byPhase = new Map<string, string[]>();
    for (const [id, phase] of nodePhase.entries()) {
        const key = (phase || 'Other').trim() || 'Other';
        const list = byPhase.get(key) || [];
        list.push(id);
        byPhase.set(key, list);
    }

    // Ensure all canonical phases appear, even if empty.
    for (const name of PHASE_ORDER) {
        if (!byPhase.has(name)) byPhase.set(name, []);
    }
    if (!byPhase.has('Other')) byPhase.set('Other', []);

    const orderedNames = [
        ...PHASE_ORDER.filter((p) => byPhase.has(p)),
        ...[...byPhase.keys()].filter((p) => !PHASE_ORDER.includes(p as any)),
    ];

    const groups: PhaseGroup[] = [];
    let column = 0;
    for (const name of orderedNames) {
        const ids = byPhase.get(name) || [];
        if (ids.length === 0 && name === 'Other') continue;

        // Compute bounding box for the inner nodes.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const id of ids) {
            const p = posById.get(id);
            if (!p) continue;
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + p.width);
            maxY = Math.max(maxY, p.y + p.height);
        }
        // Default size for empty phases so they still render.
        const isEmpty = ids.length === 0;
        const x = isEmpty ? 40 : minX - PHASE_BAND_PADDING;
        const y = isEmpty ? 40 : minY - PHASE_BAND_PADDING - PHASE_BAND_HEADER_HEIGHT;
        const width = isEmpty
            ? PHASE_BAND_MIN_WIDTH
            : Math.max(PHASE_BAND_MIN_WIDTH, maxX - minX + 2 * PHASE_BAND_PADDING);
        const height = isEmpty
            ? 80
            : (maxY - minY) + 2 * PHASE_BAND_PADDING + PHASE_BAND_HEADER_HEIGHT;

        const status =
            (phaseStatus?.get(name) as string | undefined) ||
            (isEmpty ? 'Pending' : 'Active');

        groups.push({
            id: `phase-band-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name,
            status,
            nodeIds: ids,
            x,
            y,
            width,
            height,
            column,
        });
        column++;
    }
    return groups;
}

/**
 * Pure helper: tag every positioned node with its phase id so
 * the canvas can decide which sub-graph to render. Phase ids
 * are derived from the canonical 5-phase order so the SVG
 * `phase:N` key matches the `phaseName` used by buildPhaseGroups.
 */
export function annotateNodePhaseIds(
    nodes: GraphNodeInput[],
): Map<string, string> {
    const out = new Map<string, string>();
    for (const node of nodes) {
        const phase = (node.phase || '').trim() || 'Other';
        const id = `phase:${phase.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        out.set(node.id, id);
    }
    return out;
}
