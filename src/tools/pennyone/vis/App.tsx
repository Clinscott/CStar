import React, { useState, useEffect, Component, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { NeuralGraph } from './components/NeuralGraph.js';
import { PlaybackHUD } from './components/PlaybackHUD.js';
import * as THREE from 'three';

const logToServer = async (type: string, message: string, stack?: string) => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;
    try {
        await fetch(`/api/log?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, message, stack })
        });
    } catch (e) {}
};

class MatrixErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
    componentDidCatch(error: any, info: any) { 
        console.error("Matrix Crash:", error, info); 
        logToServer('CRASH', error.message, error.stack);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ color: '#ff4d4d', padding: '40px', fontFamily: 'monospace', textAlign: 'center', background: '#050000', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h1>[O.D.I.N.]: CRITICAL RUNTIME EXCEPTION</h1>
                    <p style={{ opacity: 0.6 }}>The neural graph has collapsed under its own gravity.</p>
                    <pre style={{ fontSize: '10px', marginTop: '20px', color: '#666' }}>{this.state.error?.message}</pre>
                    <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px', background: '#ff4d4d', color: '#000', border: 'none', cursor: 'pointer' }}>REBOOT MATRIX</button>
                </div>
            );
        }
        return this.props.children;
    }
}

export const App: React.FC = () => {
    const [token, setToken] = useState<string | null>(null);
    const [matrixData, setMatrixData] = useState<any>(null);
    const [gravityData, setGravityData] = useState<any>(null);
    const [nodeMap, setNodeMap] = useState<Map<string, THREE.Vector3>>(new Map());
    const [isLive, setIsLive] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [sessionHistory, setSessionHistory] = useState<any[]>([]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('token');
        if (t) setToken(t);

        const handleError = (e: ErrorEvent) => logToServer('ERROR', e.message, e.error?.stack);
        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
    }, []);

    useEffect(() => {
        if (!token) return;
        const fetchData = async () => {
            try {
                const [matrixRes, gravityRes] = await Promise.all([
                    fetch(`/api/matrix?token=${token}`),
                    fetch(`/api/gravity?token=${token}`)
                ]);
                if (matrixRes.ok) {
                    const mData = await matrixRes.json();
                    setMatrixData(mData);
                }
                if (gravityRes.ok) {
                    const gData = await gravityRes.json();
                    setGravityData(gData);
                } else {
                    setGravityData({});
                }
            } catch (error: any) {
                logToServer('ERROR', `Synchronization failed: ${error.message}`);
            }
        };
        fetchData();
    }, [token]);

    if (!token) {
        return (
            <div style={{ color: '#ff4d4d', padding: '40px', fontFamily: 'monospace', textAlign: 'center', background: '#000', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h1>[O.D.I.N.]: ACCESS DENIED</h1>
                <p>Security Handshake Failed. Valid Token Required.</p>
            </div>
        );
    }

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#00050a' }}>
            <MatrixErrorBoundary>
                {matrixData ? (
                    <>
                        <Canvas shadows gl={{ antialias: true, alpha: true }}>
                            <PerspectiveCamera makeDefault position={[0, 300, 800]} fov={60} far={20000} />
                            <color attach="background" args={['#00050a']} />
                            <fogExp2 attach="fog" args={["#00050a", 0.0001]} />
                            <ambientLight intensity={0.8} />
                            <directionalLight position={[100, 100, 100]} intensity={1.0} color="#00f2ff" />

                            <React.Suspense fallback={null}>
                                <NeuralGraph
                                    data={matrixData}
                                    gravityData={gravityData || {}}
                                    token={token}
                                    onNodesMapped={setNodeMap}
                                />
                            </React.Suspense>

                            <OrbitControls makeDefault enableDamping maxDistance={10000} minDistance={50} />
                        </Canvas>

                        <div className="glass-hud">
                            <div className="title">CORVUS STAR: SOVEREIGN MATRIX</div>
                            <div className="subtitle">Operation PennyOne | Lead Engineer Overhaul</div>
                        </div>

                        <PlaybackHUD
                            sessionLength={sessionHistory?.length || 0}
                            currentIndex={currentIndex}
                            onSeek={setCurrentIndex}
                            isLive={isLive}
                            onToggleLive={() => setIsLive(!isLive)}
                            isRecording={false}
                            onStartRecording={() => {}}
                            onStopRecording={() => {}}
                        />
                    </>
                ) : (
                    <div style={{ color: '#00f2ff', padding: '40px', fontFamily: 'monospace', textAlign: 'center', background: '#00050a', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <h1>[O.D.I.N.]: SYNCHRONIZING NEURAL PATHWAYS...</h1>
                        <p style={{ opacity: 0.6 }}>Establishing Handshake with Manor Storage</p>
                    </div>
                )}
            </MatrixErrorBoundary>

            <style>{`
                .glass-hud {
                    position: absolute; top: 20px; left: 20px;
                    background: rgba(0, 5, 10, 0.7); backdrop-filter: blur(10px);
                    border: 1px solid rgba(0, 242, 255, 0.3); padding: 20px;
                    color: #fff; font-family: 'Inter', sans-serif; border-radius: 4px; pointer-events: none;
                }
                .title { font-size: 1.2rem; font-weight: bold; color: #00f2ff; letter-spacing: 2px; }
                .subtitle { font-size: 0.7rem; color: #aaa; margin-top: 5px; text-transform: uppercase; }
            `}</style>
        </div>
    );
};
