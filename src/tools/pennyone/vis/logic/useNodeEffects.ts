import { Node } from '../types/index.ts';

/**
 * [GUNGNIR] Node Effects Hook
 * Purpose: Decouple visual state (scale, color) from the render layer.
 */
export function useNodeEffects() {
    const getVisScale = (loc: number) => Math.max(0.5, Math.sqrt(loc || 1) * 0.08);

    const getStarColor = (path: string): string => {
        if (!path) return '#444444';
        const p = path.replace(/\\/g, '/').toLowerCase();
        if (p.includes('src/sentinel')) return '#00f2ff';
        if (p.includes('src/tools/pennyone/vis')) return '#ff00ff';
        if (p.includes('src/tools')) return '#ff9900';
        if (p.includes('tests/')) return '#00ff66';
        return '#aaaaaa';
    };

    const calculateEffect = (
        node: Node, 
        type: string, 
        hovered: { type: string, id: number } | null, 
        selectedNode: Node | null, 
        links: any[],
        index: number,
        allNodesOfType: Node[] // Pass in the array of nodes to resolve instanceId
    ) => {
        // Resolve the hovered node's actual ID (path) from its instanceId
        const hoveredNodeId = hovered && hovered.type === type ? allNodesOfType[hovered.id]?.id : null;
        const activeNodeId = selectedNode?.id || hoveredNodeId;
        
        let isNeighbor = false;
        if (activeNodeId) {
            isNeighbor = !!(links || []).find(l => {
                const sId = (l.source as any).id || (l.source as string);
                const tId = (l.target as any).id || (l.target as string);
                return (sId === activeNodeId && tId === node.id) || (tId === activeNodeId && sId === node.id);
            });
        }

        let scale = getVisScale(node.loc || 0);
        const isHovered = hovered?.type === type && hovered?.id === index;
        const isSelected = selectedNode?.id === node.id;

        if (isHovered) scale *= 1.5;
        else if (isSelected) scale *= 1.8;
        else if (isNeighbor) scale *= 1.2;

        let color = getStarColor(node.path);
        const nodeMatrix = node.matrix as Record<string, number>;
        const gungnirScore = nodeMatrix?.overall || 5.0;

        // [Ω] GOLD EXCELLENCE: High Gungnir scores shine gold
        if (gungnirScore >= 8.5) {
            color = '#ffd700'; // Gold
        } else if (isHovered || isSelected) {
            color = '#ffffff';
        } else if ((nodeMatrix?.logic || 10) < 4.0) {
            color = '#ff4d4d'; // Toxic/Low Logic
        }

        // [Ω] Complexity Jaggedness: Higher complexity = lower detail (more jagged)
        const complexity = node.complexity || 0;
        const detail = complexity > 20 ? 0 : (complexity > 10 ? 1 : 2);

        return { scale, color, detail, gungnirScore };
    };

    return { calculateEffect };
}

