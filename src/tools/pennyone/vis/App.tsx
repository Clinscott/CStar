import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera } from '@react-three/drei';
import { NeuralGraph } from './components/NeuralGraph.js';
import { AgentGhost } from './components/AgentGhost.js';
import { PlaybackHUD } from './components/PlaybackHUD.js';
import * as THREE from 'three';

/**
 * Operation PennyOne: The Matrix App
 */
export const App: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [session, setSession] = useState<any[]>([]);
    const [nodeRegistry, setNodeRegistry] = useState<Map<string, THREE.Vector3>>(new Map());
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [isLive, setIsLive] = useState(true);

    useEffect(() => {
        fetch('/api/matrix')
            .then(res => res.json())
            .then(setData)
            .catch(err => console.error("Failed to fetch matrix data:", err));

        const socket = new WebSocket(`ws://${window.location.host}`);
        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'AGENT_TRACE') {
                setSession(prev => {
                    const next = [...prev, msg.payload];
                    if (isLive) setPlaybackIndex(next.length - 1);
                    return next;
                });
            } else if (msg.type === 'GRAPH_REBUILT') {
                fetch('/api/matrix').then(res => res.json()).then(setData);
            }
        };
        return () => socket.close();
    }, [isLive]);

    if (!data) {
        return (
            <div style={{ color: '#00f2ff', background: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
                [ALFRED]: "Searching for neural graph telemetry..."
            </div>
        );
    }

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
            <Canvas shadows dpr={[1, 2]}>
                <PerspectiveCamera makeDefault position={[0, 50, 200]} fov={60} />
                <OrbitControls makeDefault enableDamping />

                <Stars radius={300} depth={60} count={20000} factor={7} saturation={0} fade speed={1} />
                <ambientLight intensity={0.2} />
                <pointLight position={[100, 100, 100]} intensity={1} color="#00f2ff" />

                <NeuralGraph data={data} onNodesMapped={setNodeRegistry} />
                <AgentGhost
                    trace={session.slice(0, playbackIndex + 1)}
                    nodeRegistry={nodeRegistry}
                />
            </Canvas>
            <HUD summary={data.summary} />
            <PlaybackHUD
                sessionLength={session.length}
                currentIndex={playbackIndex}
                onSeek={setPlaybackIndex}
                isLive={isLive}
                onToggleLive={() => setIsLive(!isLive)}
            />
        </div>
    );
};

const HUD: React.FC<{ summary: { total_files: number, total_loc: number, average_score: number } }> = ({ summary }) => (
    <div style={{ position: 'absolute', top: 20, left: 20, color: '#00f2ff', pointerEvents: 'none', fontFamily: 'monospace', background: 'rgba(0, 0, 0, 0.7)', padding: '15px', border: '1px solid #00f2ff', borderRadius: '4px' }}>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>OPERATION PENNYONE</h1>
        <div>Files Scanned: {summary.total_files}</div>
        <div>Total LOC: {summary.total_loc}</div>
        <div>Avg Gungnir: {summary.average_score.toFixed(2)}</div>
        <div style={{ marginTop: '10px', fontSize: '0.8rem', opacity: 0.6 }}>[ALFRED]: "The matrix is live, sir."</div>
    </div>
);
