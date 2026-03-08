import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
// [🛡️] THE GUNGNIR AURA SHADER
const GungnirAuraMaterial = shaderMaterial({
    uTime: 0,
    uColor: new THREE.Color('#00f2ff'),
    uGlowColor: new THREE.Color('#ffffff'),
    uIntensity: 1.0,
    uPulseSpeed: 1.0
}, 
// Vertex Shader
`
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `, 
// Fragment Shader
`
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    uniform vec3 uColor;
    uniform vec3 uGlowColor;
    uniform float uIntensity;
    uniform float uPulseSpeed;

    void main() {
        // Fresnel effect
        vec3 viewDirection = normalize(-vPosition);
        float fresnel = pow(1.0 - dot(vNormal, viewDirection), 3.0);
        
        // Pulsing logic
        float pulse = 0.8 + 0.2 * sin(uTime * 3.0 * uPulseSpeed);
        
        vec3 finalColor = mix(uColor, uGlowColor, fresnel);
        float alpha = fresnel * uIntensity * pulse;
        
        gl_FragColor = vec4(finalColor, alpha);
    }
    `);
extend({ GungnirAuraMaterial });
export const FresnelAura = ({ node }) => {
    const materialRef = useRef(null);
    const isToxic = (Number(node.matrix?.logic) || 10) < 4.0;
    const isExcellence = (Number(node.matrix?.overall) || 0) >= 8.5;
    const gravity = node.gravity || 0;
    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uTime = state.clock.elapsedTime;
        }
    });
    const scale = useMemo(() => {
        const base = 40;
        return base + (gravity * 0.5);
    }, [gravity]);
    const color = isToxic ? '#ff4d4d' : (isExcellence ? '#ffd700' : '#00f2ff');
    const intensity = isExcellence ? 2.0 : 1.0;
    const pulseSpeed = isToxic ? 2.0 : 1.0;
    return (_jsxs("mesh", { position: [node.x || 0, node.y || 0, node.z || 0], children: [_jsx("sphereGeometry", { args: [scale, 32, 32] }), _jsx("gungnirAuraMaterial", { ref: materialRef, uColor: new THREE.Color(color), uGlowColor: new THREE.Color('#ffffff'), uIntensity: intensity, uPulseSpeed: pulseSpeed, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })] }));
};
export const SelectionHighlight = ({ node }) => {
    const meshRef = useRef(null);
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.02;
            meshRef.current.rotation.z += 0.01;
            const s = 1.2 + 0.1 * Math.sin(state.clock.elapsedTime * 5);
            meshRef.current.scale.set(s, s, s);
        }
    });
    return (_jsxs("mesh", { ref: meshRef, position: [node.x || 0, node.y || 0, node.z || 0], children: [_jsx("torusGeometry", { args: [35, 2, 16, 100] }), _jsx("meshStandardMaterial", { color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 5, toneMapped: false })] }));
};
