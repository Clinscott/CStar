import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, forceZ } from 'd3-force-3d';
import gsap from 'gsap';

import { Node, Link, Trajectory, GhostTrace } from '../types/index.ts';
import { NodeLayer } from './NodeLayer.tsx';
import { ConnectionLayer } from './ConnectionLayer.tsx';
import { FresnelAura, SelectionHighlight } from './AuraLayers.tsx';
import { TextLabel } from './TextLabel.tsx';
import { SelectionPanelShell } from './SelectionPanelShell.tsx';
import { GhostTraceLayer } from './GhostTraceLayer.tsx';
import { useNeuralData, STELLAR_MAP, getStar } from '../logic/useNeuralData.ts';

interface SimulationNode extends Node {
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
}

/**
 * 🔱 NEURAL GRAPH (v5.0) - THE ACTIVE ORACLE VIEW
 * Lane 1: The Ghost in the Machine (Real-time Agent Traces)
 * Lane 2: Gungnir Aesthetics (Gold Excellence, Complexity Jaggedness)
 * Lane 3: High-Fidelity Physics (Gravity & Spacing)
 */
export const NeuralGraph: React.FC<{
    data: any;
    gravityData: Record<string, number>;
    token: string;
    onNodesMapped?: (_map: Map<string, THREE.Vector3>) => void;
}> = ({ data: initialData, gravityData, token, onNodesMapped }) => {
    const { camera, controls } = useThree();
    const [simReady, setSimReady] = useState(false);
    const [hovered, setHovered] = useState<{ type: string, id: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
    const [ghostTraces, setGhostTraces] = useState<GhostTrace[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const [dragState, setDragState] = useState<{ node: Node, isDragging: boolean, startCluster: string } | null>(null);

    const { allNodes, pyNodes, logicNodes, links } = useNeuralData(initialData, gravityData);

    // 1. D3 Force Simulation (Physics & Gravity)
    useEffect(() => {
        if (!allNodes || allNodes.length === 0) {
            setSimReady(true);
            return;
        }

        const simulation = forceSimulation(allNodes, 3)
            .force('link', forceLink(links || []).id((d: SimulationNode) => d.id).distance(1500))
            .force('charge', forceManyBody().strength((d: SimulationNode) => -12000 - (d.gravity || 0) * 200))
            .force('collide', forceCollide().radius((d: SimulationNode) => Math.max(1, Math.sqrt(d.loc || 1) * 0.1) * 80))
            .force('x', forceX().x((d: SimulationNode) => getStar(d.path)[0]).strength(0.4))
            .force('y', forceY().y((d: SimulationNode) => getStar(d.path)[1]).strength(0.4))
            .force('z', forceZ().z((d: SimulationNode) => getStar(d.path)[2]).strength(0.4));

        // Let it stabilize
        for (let i = 0; i < 150; i++) simulation.tick();
        simulation.stop();

        if (onNodesMapped) {
            const map = new Map<string, THREE.Vector3>();
            allNodes.forEach(n => map.set(n.path, new THREE.Vector3(n.x || 0, n.y || 0, n.z || 0)));
            onNodesMapped(map);
        }
        setSimReady(true);
    }, [allNodes, links, onNodesMapped]);

    // 2. Ghost Trace Logic (Agent Tracking)
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/matrix`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'AGENT_TRACE') {
                    const ping = msg.payload;
                    const targetNode = allNodes.find(n => n.path === ping.target_path);
                    if (targetNode) {
                        setGhostTraces(prev => {
                            const lastTrace = prev[prev.length - 1];
                            const newPoint: [number, number, number] = [targetNode.x || 0, targetNode.y || 0, targetNode.z || 0];
                            
                            if (lastTrace && (Date.now() - lastTrace.timestamp) < 30000) {
                                return [...prev.slice(0, -1), { 
                                    ...lastTrace, 
                                    points: [...lastTrace.points, newPoint],
                                    timestamp: Date.now(),
                                    activeNodeId: targetNode.id
                                }];
                            }
                            
                            return [...prev.slice(-10), {
                                id: Math.random().toString(),
                                points: [newPoint],
                                activeNodeId: targetNode.id,
                                timestamp: Date.now()
                            }];
                        });
                    }
                }
            } catch (err) { }
        };

        return () => ws.close();
    }, [allNodes]);

    // 3. Selection & Camera Focus
    const handleNodeClick = useCallback((node: Node) => {
        if (!node) return;
        setSelectedNode(node);
        const targetPos = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
        gsap.to(camera.position, { x: targetPos.x + 300, y: targetPos.y + 200, z: targetPos.z + 500, duration: 1.5, ease: 'power3.inOut' });
        if (controls) gsap.to((controls as any).target, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1.5, ease: 'power3.inOut' });
    }, [camera, controls]);

    // 4. Trajectory Fetching
    useEffect(() => {
        if (!selectedNode || !token) {
            setTrajectories([]);
            return;
        }
        fetch(`/api/matrix/trajectories?token=${token}&file=${encodeURIComponent(selectedNode.path)}`)
            .then(res => res.json())
            .then(setTrajectories)
            .catch(err => console.error('[PENNYONE] Trajectory fail:', err));
    }, [selectedNode, token]);

    if (!simReady) return null;

    const activeNodeIdFromHover = hovered ? (hovered.type === 'PYTHON' ? pyNodes : logicNodes)?.[hovered.id]?.id : null;
    const activeNodeId = selectedNode?.id || ghostTraces[ghostTraces.length - 1]?.activeNodeId || activeNodeIdFromHover;

    const handlePointerDown = (type: 'PYTHON' | 'LOGIC', e: any) => {
        e.stopPropagation();
        const node = type === 'PYTHON' ? pyNodes[e.instanceId] : logicNodes[e.instanceId];
        if (node) {
            handleNodeClick(node);
            
            // Determine initial cluster
            let startCluster = 'alpha';
            let minDist = Infinity;
            const pos = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
            for (const [name, coords] of Object.entries(STELLAR_MAP)) {
                const dist = pos.distanceTo(new THREE.Vector3(...coords));
                if (dist < minDist) { minDist = dist; startCluster = name; }
            }
            
            setDragState({ node, isDragging: false, startCluster });
        }
    };

    const handlePointerMove = (e: any) => {
        if (dragState) {
            setDragState(prev => ({ ...prev!, isDragging: true }));
            if (controls) controls.enabled = false;
        }
    };

    const handlePointerUp = (e: any) => {
        if (dragState && dragState.isDragging && e.point) {
            const dropPoint = e.point;
            
            let closestCluster = 'alpha';
            let minDist = Infinity;
            for (const [name, coords] of Object.entries(STELLAR_MAP)) {
                const dist = dropPoint.distanceTo(new THREE.Vector3(...coords));
                if (dist < minDist) { minDist = dist; closestCluster = name; }
            }

            if (closestCluster !== dragState.startCluster) {
                let targetDir = 'src/';
                if (closestCluster === 'gamma') targetDir = 'src/sentinel/';
                if (closestCluster === 'epsilon') targetDir = 'src/tools/pennyone/vis/';
                if (closestCluster === 'delta') targetDir = 'src/tools/';
                if (closestCluster === 'beta') targetDir = 'tests/';

                const fileName = dragState.node.path.split('/').pop() || dragState.node.path.split('\\').pop() || '';
                const targetPath = targetDir + fileName;

                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'ARCHITECT_NODE_MOVED',
                        payload: {
                            sourcePath: dragState.node.path,
                            targetPath: targetPath
                        }
                    }));
                }
            }
        }
        if (controls) controls.enabled = true;
        setDragState(null);
    };

    return (
        <group onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
            {/* Infrastructure Layers */}
            <ConnectionLayer links={links} activeNodeId={activeNodeId} />
            <GhostTraceLayer traces={ghostTraces} />

            {/* High-Gravity / Low-Logic / High-Excellence Auras */}
            {allNodes.filter(n => (n.gravity || 0) > 50 || (Number((n.matrix as any)?.logic) || 10) < 4.0 || (Number((n.matrix as any)?.overall) || 0) >= 8.5).map((node, i) => (
                <FresnelAura key={`aura-${i}`} node={node} />
            ))}

            {/* Node Content Layers */}
            <NodeLayer
                nodes={logicNodes}
                type="LOGIC"
                hovered={hovered}
                selectedNode={selectedNode}
                links={links}
                onPointerOver={(e) => { e.stopPropagation(); setHovered({ type: 'LOGIC', id: e.instanceId }); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(null); document.body.style.cursor = 'auto'; }}
                onPointerDown={(e) => handlePointerDown('LOGIC', e)}
            />

            <NodeLayer
                nodes={pyNodes}
                type="PYTHON"
                hovered={hovered}
                selectedNode={selectedNode}
                links={links}
                onPointerOver={(e) => { e.stopPropagation(); setHovered({ type: 'PYTHON', id: e.instanceId }); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(null); document.body.style.cursor = 'auto'; }}
                onPointerDown={(e) => handlePointerDown('PYTHON', e)}
            />

            {/* Information Overlays */}
            <React.Suspense fallback={null}>
                {allNodes.map((node, i) => <TextLabel key={`text-${i}`} node={node} />)}
            </React.Suspense>

            {selectedNode && <SelectionHighlight node={selectedNode} />}

            {selectedNode && (
                <SelectionPanelShell
                    selectedNode={selectedNode}
                    trajectories={trajectories}
                    onClose={() => setSelectedNode(null)}
                />
            )}
        </group>
    );
};
