/**
 * Minimal type declarations for the `dagre` graph-layout library.
 *
 * The official `@types/dagre` package is unmaintained and only
 * covers dagre 0.7. dagre 0.8.x ships without types, so we
 * declare the subset our codebase actually uses. The runtime
 * falls back to a pure-JS layout if dagre is missing, so this
 * declaration only needs to cover the call sites in
 * `lib/services/graph-layout.ts`.
 *
 * Do NOT add a runtime dependency on `@types/dagre` -- it
 * silently downgrades the types and the dependency tree grows
 * for no benefit.
 */
declare module 'dagre' {
    export interface GraphLabel {
        width?: number;
        height?: number;
        label?: string;
        [key: string]: unknown;
    }

    export interface GraphEdge {
        [key: string]: unknown;
    }

    export interface GraphNode extends GraphLabel {
        x?: number;
        y?: number;
    }

    export interface GraphConfig {
        rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
        align?: 'UL' | 'UR' | 'DL' | 'DR';
        nodesep?: number;
        edgesep?: number;
        ranksep?: number;
        marginx?: number;
        marginy?: number;
        acyclicer?: 'greedy' | 'none' | undefined;
        ranker?: 'tight-tree' | 'longest-path' | 'network-simplex' | undefined;
        [key: string]: unknown;
    }

    export interface GraphInstance {
        setGraph(config: GraphConfig): void;
        setDefaultEdgeLabel(fn: () => GraphEdge): void;
        setNode(id: string, label?: GraphLabel): void;
        setEdge(source: string, target: string, label?: GraphEdge, name?: string): void;
        hasNode(id: string): boolean;
        node(id: string): GraphNode;
        edges(): Array<{ v: string; w: string }>;
        graph(): GraphConfig;
    }

    export interface GraphConstructor {
        new(config?: { multigraph?: boolean; directed?: boolean; compound?: boolean }): GraphInstance;
    }

    export const graphlib: {
        Graph: GraphConstructor;
    };

    export function layout(graph: GraphInstance): void;

    const _default: {
        graphlib: GraphInstance['graph'] extends never ? never : {
            Graph: GraphConstructor;
        };
        layout: typeof layout;
    };

    export default _default;
}
