import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/* eslint-disable */
import React, { useEffect, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, AdaptiveDpr } from '@react-three/drei';
import { NeuralGraph } from './components/NeuralGraph.tsx';
import { PlaybackHUD } from './components/PlaybackHUD.tsx';
import { SelectionPanelShell } from './components/SelectionPanelShell.tsx';
import { useMatrixStore } from './store/useMatrixStore.js';
const logToServer = async (type, message, stack) => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token)
        return;
    try {
        await fetch(`/api/log?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, message, stack })
        });
    }
    catch (_e) { }
};
class MatrixErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) {
        console.error('Matrix Crash:', error, info);
        logToServer('CRASH', error.message, error.stack);
    }
    render() {
        if (this.state.hasError) {
            return (_jsxs("div", { style: { color: '#ff4d4d', padding: '40px', fontFamily: 'monospace', textAlign: 'center', background: '#050000', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }, children: [_jsx("h1", { children: "[O.D.I.N.]: CRITICAL RUNTIME EXCEPTION" }), _jsx("p", { style: { opacity: 0.6 }, children: "The neural graph has collapsed under its own gravity." }), _jsx("pre", { style: { fontSize: '12px', marginTop: '20px', color: '#ffaaaa', textAlign: 'left', whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto' }, children: this.state.error?.stack || this.state.error?.message }), _jsx("button", { onClick: () => window.location.reload(), style: { marginTop: '20px', padding: '10px', background: '#ff4d4d', color: '#000', border: 'none', cursor: 'pointer' }, children: "REBOOT MATRIX" })] }));
        }
        return this.props.children;
    }
}
export const App = () => {
    const { token, setToken, matrixData, setMatrixData, gravityData, setGravityData, isLive, setIsLive, currentIndex, setCurrentIndex, selectedNode, setSelectedNode, trajectories } = useMatrixStore();
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('token');
        if (t)
            setToken(t);
        const handleError = (e) => logToServer('ERROR', e.message, e.error?.stack);
        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
    }, []);
    const fetchData = async () => {
        if (!token)
            return;
        try {
            const ts = Date.now();
            const [matrixRes, gravityRes] = await Promise.all([
                fetch(`/api/matrix?token=${token}&_ts=${ts}`),
                fetch(`/api/gravity?token=${token}&_ts=${ts}`)
            ]);
            if (matrixRes.status === 401) {
                logToServer('AUTH_ERROR', '401 Unauthorized - Token mismatch');
                return;
            }
            if (matrixRes.ok) {
                const mData = await matrixRes.json();
                setMatrixData(mData);
            }
            if (gravityRes.ok) {
                const gData = await gravityRes.json();
                setGravityData(gData);
            }
            else {
                setGravityData({});
            }
        }
        catch (error) {
            logToServer('ERROR', `Synchronization failed: ${error.message}`);
        }
    };
    useEffect(() => {
        fetchData();
    }, [token]);
    if (!token) {
        return (_jsxs("div", { style: { color: '#ff4d4d', padding: '40px', fontFamily: 'monospace', textAlign: 'center', background: '#000', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }, children: [_jsx("h1", { children: "[O.D.I.N.]: ACCESS DENIED" }), _jsx("p", { children: "Security Handshake Failed. Valid Token Required." })] }));
    }
    return (_jsxs("div", { style: { width: '100vw', height: '100vh', background: '#00050a', position: 'relative', overflow: 'hidden' }, children: [_jsx(MatrixErrorBoundary, { children: matrixData ? (_jsxs(_Fragment, { children: [_jsxs(Canvas, { shadows: true, gl: { antialias: false, alpha: true, stencil: false, depth: true }, dpr: [1, 2], children: [_jsx(PerspectiveCamera, { makeDefault: true, position: [0, 300, 800], fov: 60, far: 20000 }), _jsx("color", { attach: "background", args: ['#00050a'] }), _jsx("fogExp2", { attach: "fog", args: ['#00050a', 0.0001] }), _jsx("ambientLight", { intensity: 0.8 }), _jsx("directionalLight", { position: [100, 100, 100], intensity: 1.0, color: "#00f2ff" }), _jsx(React.Suspense, { fallback: null, children: _jsx(NeuralGraph, { onRefresh: fetchData }) }), _jsx(OrbitControls, { makeDefault: true, enableDamping: true }), _jsx(AdaptiveDpr, { pixelated: true })] }), _jsxs("div", { className: "glass-hud", children: [_jsx("div", { className: "title", children: "CORVUS STAR: SOVEREIGN MATRIX" }), _jsx("div", { className: "subtitle", children: "Operation PennyOne | Lead Engineer Overhaul" })] }), selectedNode && (_jsx(SelectionPanelShell, { selectedNode: selectedNode, trajectories: trajectories, onClose: () => setSelectedNode(null) })), _jsx(PlaybackHUD, { sessionLength: 0, currentIndex: currentIndex, onSeek: setCurrentIndex, isLive: isLive, onToggleLive: () => setIsLive(!isLive), isRecording: false, onStartRecording: () => { }, onStopRecording: () => { } })] })) : (_jsxs("div", { style: { color: '#00f2ff', padding: '40px', fontFamily: 'monospace', textAlign: 'center', background: '#00050a', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }, children: [_jsx("h1", { children: "[O.D.I.N.]: SYNCHRONIZING NEURAL PATHWAYS..." }), _jsx("p", { style: { opacity: 0.6 }, children: "Establishing Handshake with Manor Storage" })] })) }), _jsx("style", { children: `
                .glass-hud {
                    position: absolute; top: 20px; left: 20px;
                    background: rgba(0, 5, 10, 0.7); backdrop-filter: blur(10px);
                    border: 1px solid rgba(0, 242, 255, 0.3); padding: 20px;
                    color: #fff; font-family: 'Inter', sans-serif; border-radius: 4px; pointer-events: none;
                    z-index: 100;
                }
                .title { font-size: 1.2rem; font-weight: bold; color: #00f2ff; letter-spacing: 2px; }
                .subtitle { font-size: 0.7rem; color: #aaa; margin-top: 5px; text-transform: uppercase; }
            ` })] }));
};
