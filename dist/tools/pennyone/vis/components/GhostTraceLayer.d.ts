import React from 'react';
import { GhostTrace } from '../types/index.ts';
interface GhostTraceLayerProps {
    traces: GhostTrace[];
}
/**
 * 👻 GHOST TRACE LAYER
 * Visualizes the agent's movement through the matrix.
 */
export declare const GhostTraceLayer: React.FC<GhostTraceLayerProps>;
export {};
