import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useTexture, Instances, Instance } from '@react-three/drei';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, forceZ } from 'd3-force-3d';
import gsap from 'gsap';
import { useMatrixStore } from '../store/useMatrixStore.js';
import { ConnectionLayer } from './ConnectionLayer.tsx';
import { FresnelAura, SelectionHighlight } from './AuraLayers.tsx';
import { TextLabel } from './TextLabel.tsx';
import { GhostTraceLayer } from './GhostTraceLayer.tsx';
import { useNeuralData, STELLAR_MAP, getStar } from '../logic/useNeuralData.ts';
/**
 * 🔱 NEURAL GRAPH (v6.0)
 * Optimized for One Mind Flow and High-Fidelity Rendering.
 */
export const NeuralGraph = ({ onRefresh }) => {
    const { camera, controls } = useThree();
    const [simReady, setSimReady] = useState(false);
    const { matrixData, gravityData, token, setHovered, selectedNode, setSelectedNode, setTrajectories, ghostTraces, addGhostTrace, setNodeMap } = useMatrixStore();
    const { allNodes, pyNodes, logicNodes, links } = useNeuralData(matrixData, gravityData);
    const odinTexture = useTexture('/assets/odin-core.png');
    const alfredTexture = useTexture('/assets/alfred-core.png');
    // 1. D3 Force Simulation
    useEffect(() => {
        if (!allNodes || allNodes.length === 0) {
            setSimReady(true);
            return;
        }
        const simulation = forceSimulation(allNodes, 3)
            .force('link', forceLink(links || []).id((d) => d.id).distance(1500))
            .force('charge', forceManyBody().strength((d) => -12000 - (d.gravity || 0) * 200))
            .force('collide', forceCollide().radius((d) => Math.max(1, Math.sqrt(d.loc || 1) * 0.1) * 80))
            .force('x', forceX().x((d) => getStar(d.path)[0]).strength(0.4))
            .force('y', forceY().y((d) => getStar(d.path)[1]).strength(0.4))
            .force('z', forceZ().z((d) => getStar(d.path)[2]).strength(0.4));
        for (let i = 0; i < 150; i++)
            simulation.tick();
        simulation.stop();
        const map = new Map();
        allNodes.forEach(n => map.set(n.path, new THREE.Vector3(n.x || 0, n.y || 0, n.z || 0)));
        setNodeMap(map);
        setSimReady(true);
    }, [allNodes, links]);
    // 2. WebSocket Logic
    useEffect(() => {
        if (!token)
            return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/matrix?token=${token}`);
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'MATRIX_UPDATED' && onRefresh)
                    onRefresh();
                if (msg.type === 'AGENT_TRACE') {
                    const targetNode = allNodes.find(n => n.path === msg.payload.target_path);
                    if (targetNode) {
                        addGhostTrace({
                            id: Math.random().toString(),
                            points: [[targetNode.x || 0, targetNode.y || 0, targetNode.z || 0]],
                            activeNodeId: targetNode.id,
                            timestamp: Date.now()
                        });
                    }
                }
            }
            catch (err) { }
        };
        return () => ws.close();
    }, [allNodes, onRefresh, token]);
    const handleNodeClick = useCallback((node) => {
        setSelectedNode(node);
        const targetPos = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
        gsap.to(camera.position, {
            x: targetPos.x + 400,
            y: targetPos.y + 300,
            z: targetPos.z + 600,
            duration: 1.5,
            ease: 'power3.inOut'
        });
        if (controls) {
            gsap.to(controls.target, {
                x: targetPos.x,
                y: targetPos.y,
                z: targetPos.z,
                duration: 1.5,
                ease: 'power3.inOut'
            });
        }
    }, [camera, controls, setSelectedNode]);
    useEffect(() => {
        if (!selectedNode || !token) {
            setTrajectories([]);
            return;
        }
        fetch(`/api/matrix/trajectories?token=${token}&file=${encodeURIComponent(selectedNode.path)}`)
            .then(res => res.json())
            .then(setTrajectories)
            .catch(() => setTrajectories([]));
    }, [selectedNode, token, setTrajectories]);
    if (!simReady)
        return null;
    const activeNodeId = selectedNode?.id || ghostTraces[ghostTraces.length - 1]?.activeNodeId;
    return (_jsxs("group", { children: [_jsxs("group", { position: [0, 0, 0], children: [_jsx("sprite", { scale: [1500, 1500, 1], children: _jsx("spriteMaterial", { map: odinTexture, transparent: true, alphaTest: 0.05, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }) }), _jsxs("mesh", { children: [_jsx("sphereGeometry", { args: [250, 32, 32] }), _jsx("meshStandardMaterial", { color: "#00f2ff", emissive: "#00f2ff", emissiveIntensity: 5, transparent: true, opacity: 0.05, wireframe: true })] }), _jsx("pointLight", { intensity: 10, distance: 5000, color: "#00f2ff" })] }), _jsx("sprite", { position: STELLAR_MAP.alpha, scale: [800, 800, 1], children: _jsx("spriteMaterial", { map: odinTexture, transparent: true, alphaTest: 0.05, opacity: 0.4, color: "#ffd700", blending: THREE.AdditiveBlending, depthWrite: false }) }), _jsx("sprite", { position: STELLAR_MAP.gamma, scale: [700, 700, 1], children: _jsx("spriteMaterial", { map: alfredTexture, transparent: true, alphaTest: 0.05, opacity: 0.4, color: "#00f2ff", blending: THREE.AdditiveBlending, depthWrite: false }) }), _jsx(ConnectionLayer, { links: links, nodes: allNodes, activeNodeId: activeNodeId }), _jsx(GhostTraceLayer, { traces: ghostTraces }), _jsxs(Instances, { range: logicNodes.length, children: [_jsx("icosahedronGeometry", { args: [15, 1] }), _jsx("meshStandardMaterial", { emissive: "#ffffff", emissiveIntensity: 0.5 }), logicNodes.map((node, i) => (_jsx(Instance, { position: [node.x || 0, node.y || 0, node.z || 0], onClick: (e) => { e.stopPropagation(); handleNodeClick(node); }, onPointerOver: (e) => { e.stopPropagation(); setHovered({ type: 'LOGIC', id: i }); document.body.style.cursor = 'pointer'; }, onPointerOut: () => { setHovered(null); document.body.style.cursor = 'auto'; } }, `logic-${node.path}`)))] }), _jsxs(Instances, { range: pyNodes.length, children: [_jsx("tetrahedronGeometry", { args: [18, 0] }), _jsx("meshStandardMaterial", { emissive: "#ffffff", emissiveIntensity: 0.5 }), pyNodes.map((node, i) => (_jsx(Instance, { position: [node.x || 0, node.y || 0, node.z || 0], onClick: (e) => { e.stopPropagation(); handleNodeClick(node); }, onPointerOver: (e) => { e.stopPropagation(); setHovered({ type: 'PYTHON', id: i }); document.body.style.cursor = 'pointer'; }, onPointerOut: () => { setHovered(null); document.body.style.cursor = 'auto'; } }, `py-${node.path}`)))] }), allNodes.filter(n => (n.gravity || 0) > 50 || (Number(n.matrix?.logic) || 10) < 4.0).map((node) => (_jsx(FresnelAura, { node: node }, `aura-${node.path}`))), allNodes.map((node) => _jsx(TextLabel, { node: node }, `label-${node.path}`)), selectedNode && _jsx(SelectionHighlight, { node: selectedNode })] }));
};
