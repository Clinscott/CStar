import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import { Node } from '../types/index.ts';

/**
 * 🌀 FRESNEL MATERIAL
 * High-fidelity glow for important or toxic sectors.
 */
export const FresnelMaterial = shaderMaterial(
    { time: 0, color: new THREE.Color('#ff4d4d'), glowColor: new THREE.Color('#ff0000') },
    // Vertex
    `varying vec3 vNormal;
     varying vec3 vWorldPosition;
     void main() {
       vNormal = normalize(normalMatrix * normal);
       vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
       gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
     }`,
    // Fragment
    `uniform float time;
     uniform vec3 color;
     uniform vec3 glowColor;
     varying vec3 vNormal;
     varying vec3 vWorldPosition;
     void main() {
       vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
       float fresnel = pow(1.0 - dot(viewDirection, vNormal), 3.0);
       float pulse = 0.8 + 0.2 * sin(time * 2.0);
       gl_FragColor = vec4(mix(color, glowColor, fresnel * pulse), 1.0);
     }`
);

extend({ FresnelMaterial });

declare global {
    namespace JSX {
        interface IntrinsicElements {
            fresnelMaterial: any;
        }
    }
}

/**
 * ✨ SELECTION HIGHLIGHT
 * Rotating wireframe box for the selected node.
 */
export const SelectionHighlight: React.FC<{ node: Node }> = ({ node }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    
    useFrame((state) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.y = state.clock.getElapsedTime();
        meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.5;
    });

    return (
        <mesh 
            ref={meshRef}
            position={[node.x || 0, node.y || 0, node.z || 0]} 
            raycast={() => null}
        >
            <boxGeometry args={[45, 45, 45]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.4} wireframe />
        </mesh>
    );
};

/**
 * ☄️ FRESNEL AURA
 * Glowing shell for high-gravity or low-logic nodes.
 */
export const FresnelAura: React.FC<{ node: Node }> = ({ node }) => {
    const materialRef = useRef<any>(null);
    const logicVal = Number((node.matrix as Record<string, number>)?.logic);
    const isToxic = (!isNaN(logicVal) ? logicVal : 10) < 4.0;
    const gungnir = Number((node.matrix as Record<string, number>)?.overall) || 5.0;
    const isGold = gungnir >= 8.5;

    useFrame((state) => {
        if (!materialRef.current) return;
        materialRef.current.time = state.clock.getElapsedTime();
    });

    return (
        <mesh position={[node.x || 0, node.y || 0, node.z || 0]} scale={[2.5, 2.5, 2.5]} raycast={() => null}>
            <icosahedronGeometry args={[15, 2]} />
            <fresnelMaterial
                ref={materialRef}
                transparent
                color={isToxic ? '#ff0000' : (isGold ? '#ffd700' : '#00f2ff')}
                glowColor={isToxic ? '#ff4d4d' : (isGold ? '#ffffff' : '#ffffff')}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </mesh>
    );
};
