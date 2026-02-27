import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { NeuralGraph } from './components/NeuralGraph.js';
import { PlaybackHUD } from './components/PlaybackHUD.js';
import { AgentGhost } from './components/AgentGhost.js';
import * as THREE from 'three';
import chalk from 'chalk';

/**
 * PennyOne Visualization Environment
 * Lore: "The Glass Penthouse of the Manor."
 */
export const App: React.FC = () => {
    const [matrixData, setMatrixData] = useState<any>(null);
    const [nodeMap, setNodeMap] = useState<Map<string, THREE.Vector3>>(new Map());
    const [token, setToken] = useState<string | null>(null);

    // 1. Security: Extract token from URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('token');
        if (t) {
            setToken(t);
            console.log('[ALFRED]: "Security token verified. Establishing handshake..."');
        } else {
            console.error('[ODIN]: "SECURITY BREACH! NO TOKEN DETECTED. HALTING STREAM."');
        }
    }, []);

    // 2. Load Matrix Data
    useEffect(() => {
        if (!token) return;

        const loadMatrix = async () => {
            try {
                const res = await fetch('/api/matrix', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMatrixData(data);
                }
            } catch (err) {
                console.error('[ALFRED]: "Failed to synchronize matrix, sir."', err);
            }
        };

        loadMatrix();
    }, [token]);

    if (!token) {
        return (
            <div style={{ color: '#ff4d4d', padding: '40px', fontFamily: 'monospace', textAlign: 'center' }}>
                <h1>[ODIN]: ACCESS DENIED</h1>
                <p>Security Handshake Failed. Valid Token Required.</p>
            </div>
        );
    }

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
            <Canvas shadows gl={{ antialias: true, alpha: true }}>
                <PerspectiveCamera makeDefault position={[0, 100, 300]} fov={60} far={20000} />
                <color attach="background" args={['#00050a']} />

                <ambientLight intensity={0.8} />
                <directionalLight position={[100, 100, 100]} intensity={1.5} color="#00f2ff" />

                {matrixData && (
                    <NeuralGraph
                        data={matrixData}
                        token={token}
                        onNodesMapped={setNodeMap}
                    />
                )}

                <OrbitControls
                    makeDefault
                    enableDamping
                    maxDistance={10000}
                    minDistance={50}
                />


            </Canvas>

            {/* Glass HUD Overlay */}
            <div className="glass-hud">
                <div className="title">CORVUS STAR: SOVEREIGN MATRIX</div>
                <div className="subtitle">Operation PennyOne | Lead Engineer Overhaul</div>
            </div>

            <style>{`
                .glass-hud {
                    position: absolute;
                    top: 20px;
                    left: 20px;
                    background: rgba(0, 5, 10, 0.7);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(0, 242, 255, 0.3);
                    padding: 20px;
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                    border-radius: 4px;
                    pointer-events: none;
                }
                .title { font-size: 1.2rem; font-weight: bold; color: #00f2ff; letter-spacing: 2px; }
                .subtitle { font-size: 0.7rem; color: #aaa; margin-top: 5px; text-transform: uppercase; }
            `}</style>
        </div>
    );
};

