import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as d3 from 'd3-force-3d';

interface Node extends d3.SimulationNodeDatum {
    id: string;
    path: string;
    loc: number;
    matrix: any;
    intent: string;
    x?: number;
    y?: number;
    z?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    source: string;
    target: string;
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

/**
 * [ALFRED]: "The visual cortex is being recalibrated, sir. 
 * We now observe the matrix with logarithmic depth and interaction-aware sensors."
 */
export const NeuralGraph: React.FC<{ data: any, onNodesMapped?: (map: Map<string, THREE.Vector3>) => void }> = ({ data: initialData, onNodesMapped }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const [hovered, setHovered] = useState<number | null>(null);
    const [data, setData] = useState(initialData);

    // Dynamic Interpolation State
    const targetStates = useRef<Map<number, { scale: number, color: THREE.Color }>>(new Map());

    // 1. Prepare Simulation Data
    const nodes: Node[] = useMemo(() => data.files.map((f: any) => ({
        id: f.path,
        path: f.path,
        loc: f.loc,
        matrix: f.matrix,
        intent: f.intent || "..."
    })), [data.files]);

    const links: Link[] = useMemo(() => {
        const l: Link[] = [];
        data.files.forEach((f: any) => {
            f.dependencies?.forEach((dep: string) => {
                if (nodes.find(n => n.id === dep)) {
                    l.push({ source: f.path, target: dep });
                }
            });
        });
        return l;
    }, [data.files, nodes]);

    // Index mapping for fast lookups
    const pathToIndex = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((n, i) => map.set(n.path, i));
        return map;
    }, [nodes]);

    // Helper for logarithmic scaling
    const getLogScale = (loc: number) => Math.max(0.5, Math.log10(loc || 1) * 2);

    // 2. Run Spatial Simulation & WebSocket Connection
    useEffect(() => {
        const simulation = (d3 as any).forceSimulation(nodes, 3)
            .force("link", (d3 as any).forceLink(links).id((d: any) => d.id).distance(100))
            .force("charge", (d3 as any).forceManyBody().strength(-200))
            .force("center", (d3 as any).forceCenter(0, 0, 0))
            .stop();

        for (let i = 0; i < 300; ++i) simulation.tick();

        // Populate Coordinate Registry
        if (onNodesMapped) {
            const map = new Map<string, THREE.Vector3>();
            nodes.forEach(n => {
                map.set(n.path, new THREE.Vector3(n.x || 0, n.y || 0, n.z || 0));
            });
            onNodesMapped(map);
        }

        // WebSocket Subspace Relay
        const socket = new WebSocket(`ws://${window.location.host}`);
        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'NODE_UPDATED') {
                const idx = pathToIndex.get(msg.payload.path);
                if (idx !== undefined) {
                    const newScale = getLogScale(msg.payload.loc);
                    const newColor = new THREE.Color();
                    const score = msg.payload.matrix.overall;
                    if (score > 8) newColor.set('#00f2ff');
                    else if (score < 5) newColor.set('#ff4d4d');
                    else newColor.set('#ffffff');

                    // Queue for interpolation
                    targetStates.current.set(idx, { scale: newScale, color: newColor });

                    // Update the underlying data ref for hover cards
                    nodes[idx].loc = msg.payload.loc;
                    nodes[idx].matrix = msg.payload.matrix;
                    nodes[idx].intent = msg.payload.intent;
                }
            } else if (msg.type === 'GRAPH_REBUILT') {
                console.log('[ALFRED]: "Structural shift detected. Re-buffering matrix..."');
                fetch('/api/matrix').then(res => res.json()).then(setData);
            }
        };

        return () => socket.close();
    }, [nodes, links, pathToIndex, getLogScale]);

    // 3. Render Loop (with interpolation)
    useFrame((state, delta) => {
        nodes.forEach((node, i) => {
            const { x, y, z } = node;
            tempObject.position.set(x || 0, y || 0, z || 0);

            // Interpolate Scale
            const target = targetStates.current.get(i);
            const currentScale = getLogScale(node.loc);
            let scale = currentScale;

            if (target) {
                scale = THREE.MathUtils.lerp(tempObject.scale.x || currentScale, target.scale, delta * 5);
                if (Math.abs(scale - target.scale) < 0.01) {
                    // Update complete
                }
            }

            // Highlight hovered node
            if (hovered === i) {
                scale *= 1.2;
            }

            tempObject.scale.set(scale, scale, scale);
            tempObject.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObject.matrix);

            // Interpolate Color
            const score = node.matrix.overall;
            if (score > 8) tempColor.set('#00f2ff');
            else if (score < 5) tempColor.set('#ff4d4d');
            else tempColor.set('#ffffff');

            if (target) {
                tempColor.lerp(target.color, delta * 5);
            }

            meshRef.current.setColorAt(i, tempColor);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    // 4. Render Edges (LineSegments)
    const edgeGeometry = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array(links.length * 6);
        links.forEach((link, i) => {
            const sourceNode = link.source as any as Node;
            const targetNode = link.target as any as Node;
            vertices[i * 6] = sourceNode.x || 0;
            vertices[i * 6 + 1] = sourceNode.y || 0;
            vertices[i * 6 + 2] = sourceNode.z || 0;
            vertices[i * 6 + 3] = targetNode.x || 0;
            vertices[i * 6 + 4] = targetNode.y || 0;
            vertices[i * 6 + 5] = targetNode.z || 0;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        return geometry;
    }, [links]);

    return (
        <>
            <instancedMesh
                ref={meshRef}
                args={[null!, null!, nodes.length]}
                onPointerMove={(e) => {
                    e.stopPropagation();
                    setHovered(e.instanceId!);
                }}
                onPointerOut={() => setHovered(null)}
            >
                <icosahedronGeometry args={[1, 2]} />
                <meshStandardMaterial emissive="#111" />
            </instancedMesh>

            <lineSegments geometry={edgeGeometry}>
                <lineBasicMaterial color="#00f2ff" transparent opacity={0.2} />
            </lineSegments>

            {hovered !== null && nodes[hovered] && (
                <Html position={[nodes[hovered].x || 0, nodes[hovered].y || 0, nodes[hovered].z || 0]} pointerEvents="none">
                    <div className="hover-card">
                        <div className="title">FILE: {nodes[hovered].path.split(/[\\/]/).pop()}</div>
                        <div className="intent">{nodes[hovered].intent}</div>
                        <div className="stats">
                            LOC: {nodes[hovered].loc} | GUNGNIR: {nodes[hovered].matrix?.overall?.toFixed(2)}
                        </div>
                        <div className="matrix-bar">
                            <div className="segment" style={{ width: `${(nodes[hovered].matrix?.logic || 0) * 10}%`, background: '#00f2ff' }}></div>
                            <div className="segment" style={{ width: `${(nodes[hovered].matrix?.style || 0) * 10}%`, background: '#ffffff' }}></div>
                            <div className="segment" style={{ width: `${(nodes[hovered].matrix?.intel || 0) * 10}%`, background: '#ff4d4d' }}></div>
                        </div>
                    </div>
                    <style>{`
                        .hover-card {
                            background: rgba(0, 5, 10, 0.9);
                            backdrop-filter: blur(4px);
                            color: #00f2ff;
                            padding: 12px;
                            border: 1px solid #00f2ff;
                            border-radius: 2px;
                            width: 280px;
                            font-family: 'Courier New', Courier, monospace;
                            transform: translate(25px, -50%);
                            box-shadow: 0 0 15px rgba(0, 242, 255, 0.2);
                        }
                        .title { font-weight: bold; border-bottom: 1px solid #00f2ff33; padding-bottom: 5px; margin-bottom: 8px; font-size: 0.9rem; color: #fff; }
                        .intent { font-size: 0.75rem; color: #aaa; margin-bottom: 8px; line-height: 1.2; font-style: italic; }
                        .stats { font-size: 0.8rem; margin-bottom: 8px; }
                        .matrix-bar { display: flex; height: 3px; background: #111; overflow: hidden; }
                        .segment { height: 100%; transition: width 0.3s; }
                    `}</style>
                </Html>
            )}
        </>
    );
};
