import { create } from 'zustand';
export const useMatrixStore = create((set) => ({
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
