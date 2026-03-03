import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { GhostTrace } from '../types/index.ts';

interface GhostTraceLayerProps {
    traces: GhostTrace[];
}

const TraceLine: React.FC<{ points: [number, number, number][] }> = ({ points }) => {
    const lineRef = useRef<any>(null);
    
    useFrame((_state, delta) => {
        if (lineRef.current?.material) {
            lineRef.current.material.dashOffset -= delta * 5.0;
        }
    });

    if (points.length < 2) return null;

    return (
        <Line
            ref={lineRef}
            points={points}
            color="#00f2ff"
            lineWidth={3}
            dashed
            dashSize={50}
            dashScale={1}
            gapSize={20}
            transparent
            opacity={0.8}
        />
    );
};

/**
 * 👻 GHOST TRACE LAYER
 * Visualizes the agent's movement through the matrix.
 */
export const GhostTraceLayer: React.FC<GhostTraceLayerProps> = ({ traces }) => {
    return (
        <group>
            {traces.map((trace) => (
                <TraceLine key={trace.id} points={trace.points} />
            ))}
        </group>
    );
};
