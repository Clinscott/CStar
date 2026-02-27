import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as d3 from 'd3-force-3d';
import gsap from 'gsap';

interface Node extends d3.SimulationNodeDatum {
    id: string;
    path: string;
    loc: number;
    matrix: any;
    intent: string;
    type: 'PYTHON' | 'LOGIC';
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
 * NeuralGraph: The Sovereign Semantic Visualizer
 * Lore: "Observing the pulse of the manor's logic."
 */
export const NeuralGraph: React.FC<{
    data: any,
    token: string,
    onNodesMapped?: (map: Map<string, THREE.Vector3>) => void
}> = ({ data: initialData, token, onNodesMapped }) => {
    const { camera, controls } = useThree() as any;
    const sphereMeshRef = useRef<THREE.InstancedMesh>(null!);
    const tetraMeshRef = useRef<THREE.InstancedMesh>(null!);
    const lineGroupRef = useRef<THREE.Group>(null!);

    const [hovered, setHovered] = useState<{ type: string, id: number } | null>(null);
    const [data, setData] = useState(initialData);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);

    const targetStates = useRef<Map<string, { scale: number, color: THREE.Color }>>(new Map());

    // 1. Prepare Semantic Nodes
    const allNodes: Node[] = useMemo(() => initialData.files.map((f: any) => ({
        id: f.path,
        path: f.path,
        loc: f.loc,
        matrix: f.matrix,
        intent: f.intent || "...",
        type: f.path.endsWith('.py') ? 'PYTHON' : 'LOGIC'
    })), [initialData.files]);

    const pyNodes = useMemo(() => allNodes.filter(n => n.type === 'PYTHON'), [allNodes]);
    const logicNodes = useMemo(() => allNodes.filter(n => n.type === 'LOGIC'), [allNodes]);

    const links: Link[] = useMemo(() => {
        const l: Link[] = [];
        initialData.files.forEach((f: any) => {
            f.dependencies?.forEach((dep: string) => {
                if (allNodes.find(n => n.id === dep)) {
                    l.push({ source: f.path, target: dep });
                }
            });
        });
        return l;
    }, [initialData.files, allNodes]);

    // Scaled for high-performance interaction while maintaining hierarchy
    const getLogScale = (loc: number) => Math.max(0.4, Math.log10(loc || 1) * 0.8);

    // 2. Run Spatial Simulation
    useEffect(() => {
        const degreeMap = new Map<string, number>();
        allNodes.forEach(n => degreeMap.set(n.id, 0));
        links.forEach(l => {
            const sId = (l.source as any).id || l.source;
            const tId = (l.target as any).id || l.target;
            degreeMap.set(sId, (degreeMap.get(sId) || 0) + 1);
            degreeMap.set(tId, (degreeMap.get(tId) || 0) + 1);
        });

        const simulation = (d3 as any).forceSimulation(allNodes, 3)
            .force("link", (d3 as any).forceLink(links).id((d: any) => d.id).distance(200)) // increased distance
            .force("charge", (d3 as any).forceManyBody().strength(-600))
            .force("center", (d3 as any).forceCenter(0, 0, 0))
            .stop();

        for (let i = 0; i < 300; ++i) simulation.tick();

        // Utility Ring Calculation - using true Degree count
        const orphans = allNodes.filter(n => degreeMap.get(n.id) === 0);
        const radius = 600;
        orphans.forEach((n, i) => {
            const theta = (i / orphans.length) * Math.PI * 2;
            n.x = Math.cos(theta) * radius;
            n.z = Math.sin(theta) * radius;
            n.y = (Math.random() - 0.5) * 80;
        });

        if (onNodesMapped) {
            const map = new Map<string, THREE.Vector3>();
            allNodes.forEach(n => map.set(n.path, new THREE.Vector3(n.x, n.y, n.z)));
            onNodesMapped(map);
        }

        // Subspace Relay
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}`);
        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'NODE_UPDATED') {
                const node = allNodes.find(n => n.path === msg.payload.path);
                if (node) {
                    const newScale = getLogScale(msg.payload.loc);
                    const newColor = new THREE.Color();
                    const score = msg.payload.matrix.overall;
                    if (score > 8) newColor.set('#00f2ff');
                    else if (score < 5) newColor.set('#ff4d4d');
                    else newColor.set('#ffffff');
                    targetStates.current.set(node.id, { scale: newScale, color: newColor });
                    node.loc = msg.payload.loc;
                    node.matrix = msg.payload.matrix;
                }
            } else if (msg.type === 'GRAPH_REBUILT') {
                window.location.reload();
            }
        };
        return () => socket.close();
    }, [allNodes, links, onNodesMapped]);

    const linesGeometryRef = useRef<THREE.BufferGeometry>(null!);

    // 3. Render Loop (Animations & Pulse)
    useFrame((state, delta) => {
        const time = state.clock.getElapsedTime();

        // Update Instanced Meshes
        [
            { mesh: sphereMeshRef, nodes: logicNodes, type: 'LOGIC' },
            { mesh: tetraMeshRef, nodes: pyNodes, type: 'PYTHON' }
        ].forEach(({ mesh, nodes, type }) => {
            if (!mesh.current) return;
            nodes.forEach((node, i) => {
                const { id } = node;
                let finalX = node.x || 0;
                let finalY = node.y || 0;
                let finalZ = node.z || 0;

                // utility Ring Rotation - Must sync back to node object for lines
                const isOrphan = links.every(l => {
                    const sId = (l.source as any).id || l.source;
                    const tId = (l.target as any).id || l.target;
                    return sId !== id && tId !== id;
                });

                if (isOrphan) {
                    const radius = 600;
                    const originalTheta = Math.atan2(node.z || 0, node.x || 1);
                    const newTheta = originalTheta + (time * 0.05);
                    finalX = Math.cos(newTheta) * radius;
                    finalZ = Math.sin(newTheta) * radius;

                    // Critical: sync back for line segments
                    node.x = finalX;
                    node.z = finalZ;
                }

                tempObject.matrix.identity(); // Reset matrix to prevent scale bleed
                tempObject.position.set(finalX, finalY, finalZ);

                const target = targetStates.current.get(id);
                let scale = getLogScale(node.loc);
                if (target) scale = THREE.MathUtils.lerp(tempObject.scale.x || scale, target.scale, delta * 3);
                if (hovered?.type === type && hovered?.id === i) scale *= 1.4;
                if (selectedNode?.id === id) scale *= 1.6;

                tempObject.scale.set(scale, scale, scale);
                tempObject.updateMatrix();
                mesh.current.setMatrixAt(i, tempObject.matrix);

                // Persona Auras
                const pathStr = node.path.toLowerCase();
                if (pathStr.includes('agent') || pathStr.includes('core')) tempColor.set('#ff9900'); // ODIN
                else if (pathStr.includes('tool') || pathStr.includes('scanner')) tempColor.set('#00f2ff'); // ALFRED
                else if (node.matrix.overall > 8) tempColor.set('#ffffff');
                else if (node.matrix.overall < 5) tempColor.set('#ff4d4d');
                else tempColor.set('#666666');

                if (target) tempColor.lerp(target.color, delta * 3);
                mesh.current.setColorAt(i, tempColor);
            });
            mesh.current.instanceMatrix.needsUpdate = true;
            if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
        });

        // High-Performance Neural Pathways Update
        if (linesGeometryRef.current && links.length > 0) {
            const positions = new Float32Array(links.length * 6);
            let pIdx = 0;
            links.forEach((link: any) => {
                const s = link.source;
                const t = link.target;
                if (s.x !== undefined && t.x !== undefined) {
                    positions[pIdx++] = s.x; positions[pIdx++] = s.y; positions[pIdx++] = s.z;
                    positions[pIdx++] = t.x; positions[pIdx++] = t.y; positions[pIdx++] = t.z;
                }
            });
            linesGeometryRef.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            linesGeometryRef.current.attributes.position.needsUpdate = true;
        }
    });

    const handleNodeClick = (node: Node) => {
        setSelectedNode(node);
        const targetPos = new THREE.Vector3(node.x!, node.y!, node.z!);
        gsap.to(camera.position, {
            x: targetPos.x + 80, y: targetPos.y + 80, z: targetPos.z + 80,
            duration: 1.5, ease: "power3.inOut"
        });
        if (controls) {
            gsap.to(controls.target, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1.5, ease: "power3.inOut" });
        }
    };

    return (
        <group>
            <instancedMesh
                ref={sphereMeshRef}
                args={[null!, null!, logicNodes.length]}
                frustumCulled={false}
                onPointerMove={(e) => { e.stopPropagation(); setHovered({ type: 'LOGIC', id: e.instanceId! }); }}
                onPointerOut={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); handleNodeClick(logicNodes[e.instanceId!]); }}>
                <icosahedronGeometry args={[12, 2]} />
                <meshStandardMaterial emissive="#111" emissiveIntensity={2} />
            </instancedMesh>

            <instancedMesh
                ref={tetraMeshRef}
                args={[null!, null!, pyNodes.length]}
                frustumCulled={false}
                onPointerMove={(e) => { e.stopPropagation(); setHovered({ type: 'PYTHON', id: e.instanceId! }); }}
                onPointerOut={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); handleNodeClick(pyNodes[e.instanceId!]); }}>
                <tetrahedronGeometry args={[14]} />
                <meshStandardMaterial emissive="#111" emissiveIntensity={2} />
            </instancedMesh>

            <lineSegments frustumCulled={false}>
                <bufferGeometry ref={linesGeometryRef} />
                <lineBasicMaterial color="#00f2ff" transparent opacity={0.8} />
            </lineSegments>


            {selectedNode && (
                <Html fullscreen>
                    <div className="glass-panel">
                        <div className="panel-header">
                            <span>SECTOR: {selectedNode.type}</span>
                            <button onClick={() => setSelectedNode(null)}>×</button>
                        </div>
                        <div className="panel-content">
                            <h1>{selectedNode.path.split('/').pop()}</h1>
                            <div className="path-label">{selectedNode.path}</div>
                            <p>{selectedNode.intent}</p>
                            <div className="stats-grid">
                                <div><label>LOC</label>{selectedNode.loc}</div>
                                <div><label>GUNGNIR</label>{selectedNode.matrix.overall.toFixed(2)}</div>
                            </div>
                            <button className="scan-btn" onClick={() => window.open(`file://${selectedNode.path}`)}>EXTRACT LOGIC</button>
                        </div>
                    </div>
                    <style>{`
                        .glass-panel { position: absolute; right: 40px; top: 40px; width: 380px; background: rgba(0, 5, 10, 0.6); backdrop-filter: blur(30px); border: 1px solid #00f2ff55; color: #fff; font-family: monospace; }
                        .panel-header { display: flex; justify-content: space-between; padding: 10px 15px; background: #00f2ff22; font-size: 10px; color: #00f2ff; }
                        .panel-header button { background: none; border: none; color: #00f2ff; cursor: pointer; font-size: 20px; }
                        .panel-content { padding: 30px; }
                        h1 { margin: 0; font-size: 1.4rem; color: #00f2ff; }
                        .path-label { font-size: 9px; opacity: 0.4; margin-bottom: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                        p { font-size: 0.8rem; line-height: 1.6; color: #ccc; margin-bottom: 30px; }
                        .stats-grid { display: flex; gap: 40px; margin-bottom: 40px; }
                        .stats-grid label { display: block; font-size: 10px; color: #00f2ff; opacity: 0.6; margin-bottom: 5px; }
                        .scan-btn { width: 100%; padding: 12px; background: transparent; border: 1px solid #00f2ff; color: #00f2ff; cursor: pointer; transition: all 0.3s; }
                        .scan-btn:hover { background: #00f2ff; color: #000; box-shadow: 0 0 20px #00f2ff77; }
                    `}</style>
                </Html>
            )}
        </group>
    );
};
