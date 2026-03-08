import { jsx as _jsx } from "react/jsx-runtime";
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
const TraceLine = ({ points }) => {
    const lineRef = useRef(null);
    useFrame((_state, delta) => {
        if (lineRef.current?.material) {
            lineRef.current.material.dashOffset -= delta * 5.0;
        }
    });
    if (points.length < 2)
        return null;
    return (_jsx(Line, { ref: lineRef, points: points, color: "#00f2ff", lineWidth: 3, dashed: true, dashSize: 50, dashScale: 1, gapSize: 20, transparent: true, opacity: 0.8 }));
};
/**
 * 👻 GHOST TRACE LAYER
 * Visualizes the agent's movement through the matrix.
 */
export const GhostTraceLayer = ({ traces }) => {
    return (_jsx("group", { children: traces.map((trace) => (_jsx(TraceLine, { points: trace.points }, trace.id))) }));
};
