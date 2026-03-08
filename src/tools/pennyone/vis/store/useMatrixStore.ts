import { create } from 'zustand';
import { Node, Link, Trajectory, GhostTrace } from '../types/index.js';
import * as THREE from 'three';

interface MatrixState {
    // 1. Core Data
    matrixData: any | null;
    gravityData: Record<string, number>;
    nodeMap: Map<string, THREE.Vector3>;
    
    // 2. Interaction State
    hovered: { type: string, id: number } | null;
    selectedNode: Node | null;
    trajectories: Trajectory[];
    ghostTraces: GhostTrace[];
    
    // 3. UI/Playback State
    token: string | null;
    isLive: boolean;
    currentIndex: number;
    
    // 4. Actions
    setMatrixData: (data: any) => void;
    setGravityData: (data: any) => void;
    setNodeMap: (map: Map<string, THREE.Vector3>) => void;
    setHovered: (hovered: { type: string, id: number } | null) => void;
    setSelectedNode: (node: Node | null) => void;
    setTrajectories: (trajectories: Trajectory[]) => void;
    addGhostTrace: (trace: GhostTrace) => void;
    setToken: (token: string | null) => void;
    setIsLive: (isLive: boolean) => void;
    setCurrentIndex: (index: number) => void;
}

export const useMatrixStore = create<MatrixState>((set) => ({
    matrixData: null,
    gravityData: {},
    nodeMap: new Map(),
    hovered: null,
    selectedNode: null,
    trajectories: [],
    ghostTraces: [],
    token: null,
    isLive: true,
    currentIndex: 0,

    setMatrixData: (data) => set({ matrixData: data }),
    setGravityData: (data) => set({ gravityData: data }),
    setNodeMap: (map) => set({ nodeMap: map }),
    setHovered: (hovered) => set({ hovered }),
    setSelectedNode: (node) => set({ selectedNode: node }),
    setTrajectories: (trajectories) => set({ trajectories }),
    addGhostTrace: (trace) => set((state) => ({ 
        ghostTraces: [...state.ghostTraces.slice(-10), trace] 
    })),
    setToken: (token) => set({ token }),
    setIsLive: (isLive) => set({ isLive }),
    setCurrentIndex: (index) => set({ currentIndex: index }),
}));
