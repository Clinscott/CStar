import { useMemo } from 'react';
import { Node, Link } from  '../types/index.js';

interface MatrixFilePayload {
    path?: string;
    loc?: number;
    complexity?: number;
    matrix?: Record<string, unknown>;
    intent?: string;
    interaction_protocol?: string;
    dependencies?: unknown;
    cluster?: number;
}

interface MatrixProjectionPayload {
    files?: MatrixFilePayload[];
}

export function materializeNeuralData(
    initialData: MatrixProjectionPayload | null | undefined,
    gravityData: Record<string, number>,
) {
    const fallback = { allNodes: [], pyNodes: [], logicNodes: [], links: [], orphanSet: new Set<string | number>() };
    if (!initialData || !Array.isArray(initialData.files)) return fallback;

    try {
        const files = Array.isArray(initialData.files) ? initialData.files : [];
        const nodes: Node[] = files.map((file) => {
            const path = typeof file.path === 'string' ? file.path : '?';
            const matrix = file.matrix && typeof file.matrix === 'object' ? file.matrix : { overall: 5 };
            const interactionProtocol =
                typeof file.interaction_protocol === 'string'
                    ? file.interaction_protocol
                    : typeof (matrix as Record<string, unknown>).interaction_protocol === 'string'
                      ? ((matrix as Record<string, unknown>).interaction_protocol as string)
                      : undefined;
            return {
                id: path,
                path,
                loc: typeof file.loc === 'number' ? file.loc : 0,
                complexity: typeof file.complexity === 'number' ? file.complexity : 0,
                matrix,
                intent: typeof file.intent === 'string' ? file.intent : '...',
                interactionProtocol,
                type: path.endsWith('.py') ? 'PYTHON' : 'LOGIC',
                gravity: gravityData?.[path] || 0,
            };
        });

        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const linkList: Link[] = [];
        const usedIds = new Set<string | number>();

        files.forEach((file) => {
            if (typeof file.path !== 'string') return;
            const dependencies = Array.isArray(file.dependencies)
                ? file.dependencies.filter((dep): dep is string => typeof dep === 'string')
                : [];

            dependencies.forEach((dep) => {
                if (nodeMap.has(dep)) {
                    linkList.push({ source: file.path as string, target: dep });
                    usedIds.add(file.path as string);
                    usedIds.add(dep);
                }
            });
        });

        const orphans = new Set<string | number>();
        nodes.forEach(n => { if (!usedIds.has(n.id)) orphans.add(n.id); });

        return {
            allNodes: nodes,
            pyNodes: nodes.filter(n => n.type === 'PYTHON'),
            logicNodes: nodes.filter(n => n.type === 'LOGIC'),
            links: linkList,
            orphanSet: orphans
        };
    } catch {
        return fallback;
    }
}

/**
 *
 * @param initialData
 * @param gravityData
 */
export function useNeuralData(initialData: any, gravityData: Record<string, number>) {
    return useMemo(() => materializeNeuralData(initialData, gravityData), [initialData, gravityData]);
}

export const STELLAR_MAP: Record<string, [number, number, number]> = {
    gamma: [-2000, 1500, 0],   // src/sentinel
    delta: [1500, 1800, 0],    // src/tools
    beta: [-1500, -2000, 0],   // tests
    epsilon: [3000, 800, 0],   // src/tools/pennyone/vis
    alpha: [1800, -2500, 0],   // base src/ and root
};

export const getStar = (path: string): [number, number, number] => {
    if (!path) return STELLAR_MAP.alpha;
    const p = path.replace(/\\/g, '/').toLowerCase();
    if (p.includes('src/sentinel')) return STELLAR_MAP.gamma;
    if (p.includes('src/tools/pennyone/vis')) return STELLAR_MAP.epsilon;
    if (p.includes('src/tools')) return STELLAR_MAP.delta;
    if (p.includes('tests/')) return STELLAR_MAP.beta;
    return STELLAR_MAP.alpha;
};

/')) return STELLAR_MAP.beta;
    return STELLAR_MAP.alpha;
};

