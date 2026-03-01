import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/* eslint-disable */
import { useMemo } from 'react';
import * as THREE from 'three';
import { Float } from '@react-three/drei';
/**
 * AgentGhost: The visual representation of the AI's journey.
 * @param root0
 * @param root0.trace
 * @param root0.nodeRegistry
 */
export const AgentGhost = ({ trace, nodeRegistry }) => {
    // 1. Calculate Path Points
    const points = useMemo(() => {
        return trace
            .map(t => nodeRegistry.get(t.target_path))
            .filter((v) => !!v);
    }, [trace, nodeRegistry]);
    // 2. Generate Arcing Spline (CatmullRomCurve3)
    const curve = useMemo(() => {
        if (points.length < 2)
            return null;
        // Visual Polish: Add arcing control points between nodes to prevent clipping
        const arcedPoints = [];
        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            // Add vertical arc (Y-offset) proportional to distance
            const dist = start.distanceTo(end);
            mid.y += dist * 0.2;
            arcedPoints.push(start, mid);
        }
        arcedPoints.push(points[points.length - 1]);
        return new THREE.CatmullRomCurve3(arcedPoints);
    }, [points]);
    const activeNode = points.length > 0 ? points[points.length - 1] : null;
    return (_jsxs("group", { children: [curve && (_jsxs("mesh", { children: [_jsx("tubeGeometry", { args: [curve, 64, 0.4, 8, false] }), _jsx("meshStandardMaterial", { color: "#00f2ff", emissive: "#00f2ff", emissiveIntensity: 2, transparent: true, opacity: 0.6 })] })), activeNode && (_jsx(Float, { speed: 5, rotationIntensity: 2, floatIntensity: 2, children: _jsxs("mesh", { position: activeNode, children: [_jsx("sphereGeometry", { args: [4, 16, 16] }), _jsx("meshStandardMaterial", { color: "#00f2ff", emissive: "#00f2ff", emissiveIntensity: 10, transparent: true, opacity: 0.3, wireframe: true })] }) }))] }));
};
