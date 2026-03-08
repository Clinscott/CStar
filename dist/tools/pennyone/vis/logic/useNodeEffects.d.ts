import { Node } from '../types/index.js';
/**
 * [GUNGNIR] Node Effects Hook
 * Purpose: Decouple visual state (scale, color) from the render layer.
 */
export declare function useNodeEffects(): {
    calculateEffect: (node: Node, type: string, hovered: {
        type: string;
        id: number;
    } | null, selectedNode: Node | null, links: any[], index: number, allNodesOfType: Node[]) => {
        scale: number;
        color: string;
        detail: number;
        gungnirScore: number;
    };
};
