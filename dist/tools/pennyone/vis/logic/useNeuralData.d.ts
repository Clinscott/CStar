import { Node, Link } from '../types/index.js';
/**
 *
 * @param initialData
 * @param gravityData
 */
export declare function useNeuralData(initialData: any, gravityData: Record<string, number>): {
    allNodes: Node[];
    pyNodes: Node[];
    logicNodes: Node[];
    links: Link[];
    orphanSet: Set<string | number>;
};
export declare const STELLAR_MAP: Record<string, [number, number, number]>;
export declare const getStar: (path: string) => [number, number, number];
