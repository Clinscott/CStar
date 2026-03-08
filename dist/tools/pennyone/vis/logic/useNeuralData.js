import { useMemo } from 'react';
/**
 *
 * @param initialData
 * @param gravityData
 */
export function useNeuralData(initialData, gravityData) {
    return useMemo(() => {
        const fallback = { allNodes: [], pyNodes: [], logicNodes: [], links: [], orphanSet: new Set() };
        if (!initialData || !Array.isArray(initialData.files))
            return fallback;
        try {
            const files = Array.isArray(initialData.files) ? initialData.files : [];
            const nodes = files.map((f) => ({
                id: f.path || Math.random().toString(),
                path: f.path || '?',
                loc: f.loc || 0,
                complexity: f.complexity || 0,
                matrix: f.matrix || { overall: 5 },
                intent: f.intent || '...',
                type: (f.path || '').endsWith('.py') ? 'PYTHON' : 'LOGIC',
                gravity: gravityData?.[f.path] || 0
            }));
            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            const linkList = [];
            const usedIds = new Set();
            files.forEach((f) => {
                if (!f.path)
                    return;
                const pathStr = f.path;
                (f.dependencies || []).forEach((dep) => {
                    if (nodeMap.has(dep)) {
                        linkList.push({ source: pathStr, target: dep });
                        usedIds.add(pathStr);
                        usedIds.add(dep);
                    }
                });
            });
            const orphans = new Set();
            nodes.forEach(n => { if (!usedIds.has(n.id))
                orphans.add(n.id); });
            return {
                allNodes: nodes,
                pyNodes: nodes.filter(n => n.type === 'PYTHON'),
                logicNodes: nodes.filter(n => n.type === 'LOGIC'),
                links: linkList,
                orphanSet: orphans
            };
        }
        catch {
            return fallback;
        }
    }, [initialData, gravityData]);
}
export const STELLAR_MAP = {
    gamma: [-2000, 1500, 0], // src/sentinel
    delta: [1500, 1800, 0], // src/tools
    beta: [-1500, -2000, 0], // tests
    epsilon: [3000, 800, 0], // src/tools/pennyone/vis
    alpha: [1800, -2500, 0], // base src/ and root
};
export const getStar = (path) => {
    if (!path)
        return STELLAR_MAP.alpha;
    const p = path.replace(/\\/g, '/').toLowerCase();
    if (p.includes('src/sentinel'))
        return STELLAR_MAP.gamma;
    if (p.includes('src/tools/pennyone/vis'))
        return STELLAR_MAP.epsilon;
    if (p.includes('src/tools'))
        return STELLAR_MAP.delta;
    if (p.includes('tests/'))
        return STELLAR_MAP.beta;
    return STELLAR_MAP.alpha;
};
