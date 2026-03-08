import { Node, Trajectory, GhostTrace } from '../types/index.js';
import * as THREE from 'three';
interface MatrixState {
    matrixData: any | null;
    gravityData: Record<string, number>;
    nodeMap: Map<string, THREE.Vector3>;
    hovered: {
        type: string;
        id: number;
    } | null;
    selectedNode: Node | null;
    trajectories: Trajectory[];
    ghostTraces: GhostTrace[];
    token: string | null;
    isLive: boolean;
    currentIndex: number;
    setMatrixData: (data: any) => void;
    setGravityData: (data: any) => void;
    setNodeMap: (map: Map<string, THREE.Vector3>) => void;
    setHovered: (hovered: {
        type: string;
        id: number;
    } | null) => void;
    setSelectedNode: (node: Node | null) => void;
    setTrajectories: (trajectories: Trajectory[]) => void;
    addGhostTrace: (trace: GhostTrace) => void;
    setToken: (token: string | null) => void;
    setIsLive: (isLive: boolean) => void;
    setCurrentIndex: (index: number) => void;
}
export declare const useMatrixStore: import("zustand").UseBoundStore<import("zustand").StoreApi<MatrixState>>;
export {};
