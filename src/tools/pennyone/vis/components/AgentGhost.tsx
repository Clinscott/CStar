import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Float } from '@react-three/drei';

interface AgentTrace {
    agent_id: string;
    target_path: string;
    timestamp: number;
}

interface AgentGhostProps {
    trace: AgentTrace[];
    nodeRegistry: Map<string, THREE.Vector3>;
}

/**
 * AgentGhost: The visual representation of the AI's journey.
 */
export const AgentGhost: React.FC<AgentGhostProps> = ({ trace, nodeRegistry }) => {
    // 1. Calculate Path Points
    const points = useMemo(() => {
        return trace
            .map(t => nodeRegistry.get(t.target_path))
            .filter((v): v is THREE.Vector3 => !!v);
    }, [trace, nodeRegistry]);

    // 2. Generate Arcing Spline (CatmullRomCurve3)
    const curve = useMemo(() => {
        if (points.length < 2) return null;

        // Visual Polish: Add arcing control points between nodes to prevent clipping
        const arcedPoints: THREE.Vector3[] = [];
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

    return (
        <group>
            {/* The Arcing Trail */}
            {curve && (
                <mesh>
                    <tubeGeometry args={[curve, 64, 0.4, 8, false]} />
                    <meshStandardMaterial
                        color="#00f2ff"
                        emissive="#00f2ff"
                        emissiveIntensity={2}
                        transparent
                        opacity={0.6}
                    />
                </mesh>
            )}

            {/* The Active Aura */}
            {activeNode && (
                <Float speed={5} rotationIntensity={2} floatIntensity={2}>
                    <mesh position={activeNode}>
                        <sphereGeometry args={[4, 16, 16]} />
                        <meshStandardMaterial
                            color="#00f2ff"
                            emissive="#00f2ff"
                            emissiveIntensity={10}
                            transparent
                            opacity={0.3}
                            wireframe
                        />
                    </mesh>
                </Float>
            )}
        </group>
    );
};
