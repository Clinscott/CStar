import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, useTexture, Segments, Segment } from '@react-three/drei';
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
    gravity?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    source: string;
    target: string;
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

const SelectionHighlight: React.FC<{ node: Node }> = ({ node }) => {
    const meshRef = useRef<THREE.Mesh>(null!);
    useFrame((state) => {
        if (!meshRef.current || !node) return;
        const time = state.clock.getElapsedTime();
        meshRef.current.position.set(node.x || 0, node.y || 0, node.z || 0);
        meshRef.current.rotation.y = time * 0.5;
        const scale = 2.5 + Math.sin(time * 3) * 0.2;
        meshRef.current.scale.set(scale, scale, scale);
    });
    return (
        <mesh ref={meshRef} raycast={() => null}>
            <boxGeometry args={[30, 30, 30]} />
            <meshStandardMaterial wireframe color="#fff" emissive="#00f2ff" emissiveIntensity={10} transparent opacity={0.8} />
        </mesh>
    );
};

const SpriteIcon: React.FC<{ node: Node }> = ({ node }) => {
    const odinTexture = useTexture('/assets/odin-core.png');
    const alfredTexture = useTexture('/assets/alfred-core.png');
    const orphanTexture = useTexture('/assets/orphan.png');

    const texture = useMemo(() => {
        if (!node?.path) return orphanTexture;
        const p = node.path.toLowerCase();
        if (p.includes('agent') || p.includes('core')) return odinTexture;
        if (p.includes('tool') || p.includes('scanner')) return alfredTexture;
        return orphanTexture;
    }, [node?.path, odinTexture, alfredTexture, orphanTexture]);

    const spriteRef = useRef<THREE.Sprite>(null!);
    useFrame(() => {
        if (!spriteRef.current || !node) return;
        spriteRef.current.position.set(node.x || 0, node.y || 0, node.z || 0);
    });

    return (
        <sprite ref={spriteRef} scale={[25, 25, 1]} raycast={() => null}>
            <spriteMaterial map={texture} transparent opacity={0.9} depthTest={false} color={node?.path?.endsWith('.py') ? '#ff9900' : '#00f2ff'} />
        </sprite>
    );
};

export const NeuralGraph: React.FC<{
    data: any;
    gravityData: Record<string, number>;
    token: string;
    onNodesMapped?: (map: Map<string, THREE.Vector3>) => void;
}> = ({ data: initialData, gravityData, onNodesMapped }) => {
    const { camera, controls } = useThree() as any;
    const sphereMeshRef = useRef<THREE.InstancedMesh>(null!);
    const tetraMeshRef = useRef<THREE.InstancedMesh>(null!);

    const [simReady, setSimReady] = useState(false);
    const [hovered, setHovered] = useState<{ type: string, id: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);

    // 1. Prepare Semantic Nodes
    const { allNodes, pyNodes, logicNodes, links, orphanSet } = useMemo(() => {
        const fallback = { allNodes: [], pyNodes: [], logicNodes: [], links: [], orphanSet: new Set<string>() };
        if (!initialData || !Array.isArray(initialData.files)) return fallback;

        try {
            const nodes: Node[] = initialData.files.map((f: any) => ({
                id: f.path || Math.random().toString(),
                path: f.path || '?',
                loc: f.loc || 0,
                matrix: f.matrix || { overall: 5 },
                intent: f.intent || "...",
                type: (f.path || '').endsWith('.py') ? 'PYTHON' : 'LOGIC',
                gravity: gravityData?.[f.path] || 0
            }));

            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            const linkList: Link[] = [];
            const usedIds = new Set<string>();

            initialData.files.forEach((f: any) => {
                if (!f.path) return;
                (f.dependencies || []).forEach((dep: string) => {
                    if (nodeMap.has(dep)) {
                        linkList.push({ source: f.path, target: dep });
                        usedIds.add(f.path);
                        usedIds.add(dep);
                    }
                });
            });

            const orphans = new Set<string>();
            nodes.forEach(n => { if (!usedIds.has(n.id)) orphans.add(n.id); });

            return {
                allNodes: nodes,
                pyNodes: nodes.filter(n => n.type === 'PYTHON'),
                logicNodes: nodes.filter(n => n.type === 'LOGIC'),
                links: linkList,
                orphanSet: orphans
            };
        } catch (e) {
            return fallback;
        }
    }, [initialData, gravityData]);

    const getLogScale = (loc: number) => Math.max(0.8, Math.log10(loc || 1) * 1.2); // Increased node size

    // 2. Static Simulation
    useEffect(() => {
        if (!allNodes || allNodes.length === 0) {
            setSimReady(true);
            return;
        }

        try {
            const simulation = (d3 as any).forceSimulation(allNodes, 3)
                .force("link", (d3 as any).forceLink(links || []).id((d: any) => d.id).distance(300))
                .force("charge", (d3 as any).forceManyBody().strength((d: any) => -1000 - (d.gravity || 0) * 150))
                .force("collide", (d3 as any).forceCollide().radius((d: any) => getLogScale(d.loc) * 80))
                .force("center", (d3 as any).forceCenter(0, 0, 0));

            for (let i = 0; i < 300; ++i) simulation.tick();
            simulation.stop();

            const orphans = allNodes.filter(n => orphanSet.has(n.id));
            const radius = 1000;
            const oCount = orphans.length || 1;
            orphans.forEach((n, i) => {
                const theta = (i / oCount) * Math.PI * 2;
                n.x = Math.cos(theta) * radius;
                n.z = Math.sin(theta) * radius;
                n.y = (Math.random() - 0.5) * 200;
            });

            if (onNodesMapped) {
                const map = new Map<string, THREE.Vector3>();
                allNodes.forEach(n => map.set(n.path, new THREE.Vector3(n.x || 0, n.y || 0, n.z || 0)));
                onNodesMapped(map);
            }
        } catch (e) {}

        setSimReady(true);
    }, [allNodes, links, onNodesMapped, orphanSet]);

    // 3. Render Loop
    useFrame(() => {
        if (!simReady) return;

        const layers = [
            { mesh: sphereMeshRef, nodes: logicNodes || [], type: 'LOGIC' },
            { mesh: tetraMeshRef, nodes: pyNodes || [], type: 'PYTHON' }
        ];

        layers.forEach(({ mesh, nodes, type }) => {
            if (!mesh.current || !nodes) return;
            nodes.forEach((node, i) => {
                if (i >= mesh.current.count) return;
                tempObject.matrix.identity();
                tempObject.position.set(node.x || 0, node.y || 0, node.z || 0);
                
                let scale = getLogScale(node.loc);
                const isHovered = hovered?.type === type && hovered?.id === i;
                const isSelected = selectedNode?.id === node.id;
                
                if (isHovered) scale *= 1.5;
                if (isSelected) scale *= 1.8;

                tempObject.scale.set(scale, scale, scale);
                tempObject.updateMatrix();
                mesh.current.setMatrixAt(i, tempObject.matrix);

                const p = (node.path || '').toLowerCase();
                if (isHovered || isSelected) {
                    tempColor.set('#ffffff');
                } else if (p.includes('agent') || p.includes('core')) {
                    tempColor.set('#ff9900');
                } else if (p.includes('tool') || p.includes('scanner')) {
                    tempColor.set('#00f2ff');
                } else if ((node.matrix?.overall || 5) > 8) {
                    tempColor.set('#ffffff');
                } else if ((node.matrix?.overall || 5) < 5) {
                    tempColor.set('#ff4d4d');
                } else {
                    tempColor.set('#444444');
                }
                mesh.current.setColorAt(i, tempColor);
            });
            mesh.current.instanceMatrix.needsUpdate = true;
            if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
        });
    });

    const handleNodeClick = (node: Node) => {
        if (!node) return;
        console.log(`[ALFRED]: "Handshaking with sector: ${node.path}"`);
        setSelectedNode(node);
        const targetPos = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
        gsap.to(camera.position, { x: targetPos.x + 200, y: targetPos.y + 150, z: targetPos.z + 400, duration: 1.2, ease: "power2.inOut" });
        if (controls) gsap.to(controls.target, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1.2, ease: "power2.inOut" });
    };

    if (!simReady) return null;

    const validLinks = (links || []).filter(l => l.source && l.target && typeof (l.source as any).x === 'number' && typeof (l.target as any).x === 'number');

    return (
        <group>
            {validLinks.length > 0 && (
                <Segments limit={validLinks.length} lineWidth={1.0} transparent opacity={0.15} color="#00f2ff" raycast={() => null}>
                    {validLinks.map((link, i) => (
                        <Segment key={`seg-${i}`} start={[(link.source as any).x, (link.source as any).y, (link.source as any).z]} end={[(link.target as any).x, (link.target as any).y, (link.target as any).z]} />
                    ))}
                </Segments>
            )}

            <instancedMesh ref={sphereMeshRef} args={[null as any, null as any, (logicNodes || []).length]} frustumCulled={false}
                onPointerOver={(e) => { e.stopPropagation(); setHovered({ type: 'LOGIC', id: e.instanceId! }); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(null); document.body.style.cursor = 'auto'; }}
                onPointerDown={(e) => { e.stopPropagation(); handleNodeClick(logicNodes![e.instanceId!]); }}>
                <icosahedronGeometry args={[15, 2]} />
                <meshStandardMaterial emissive="#111" emissiveIntensity={2} />
            </instancedMesh>

            <instancedMesh ref={tetraMeshRef} args={[null as any, null as any, (pyNodes || []).length]} frustumCulled={false}
                onPointerOver={(e) => { e.stopPropagation(); setHovered({ type: 'PYTHON', id: e.instanceId! }); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(null); document.body.style.cursor = 'auto'; }}
                onPointerDown={(e) => { e.stopPropagation(); handleNodeClick(pyNodes![e.instanceId!]); }}>
                <tetrahedronGeometry args={[18]} />
                <meshStandardMaterial emissive="#111" emissiveIntensity={10} toneMapped={false} />
            </instancedMesh>

            <React.Suspense fallback={null}>
                {(allNodes || []).filter((_, i) => i % 30 === 0).map((node, i) => <SpriteIcon key={`sprite-${i}`} node={node} />)}
            </React.Suspense>

            {selectedNode && <SelectionHighlight node={selectedNode} />}

            {selectedNode && (
                <Html fullscreen>
                    <div className="glass-panel" onPointerDown={(e) => e.stopPropagation()}>
                        <div className="panel-header">
                            <span>SECTOR: {selectedNode.type}</span>
                            <button onPointerDown={(e) => { e.stopPropagation(); setSelectedNode(null); }}>×</button>
                        </div>
                        <div className="panel-content">
                            <h1 style={{ color: '#00f2ff', margin: '0 0 10px 0', fontSize: '1.4rem' }}>{(selectedNode.path || '').split('/').pop()}</h1>
                            <div className="path-label" style={{ color: '#aaa', fontSize: '10px', marginBottom: '20px' }}>{selectedNode.path}</div>
                            <p style={{ color: '#eee', fontSize: '0.9rem', lineHeight: '1.4' }}>{selectedNode.intent}</p>
                            <div className="stats-grid" style={{ display: 'flex', gap: '30px', margin: '20px 0' }}>
                                <div><label style={{ display: 'block', color: '#00f2ff', fontSize: '10px' }}>LOC</label><span style={{ color: '#fff' }}>{selectedNode.loc}</span></div>
                                <div><label style={{ display: 'block', color: '#00f2ff', fontSize: '10px' }}>GUNGNIR</label><span style={{ color: '#fff' }}>{(selectedNode.matrix?.overall || 0).toFixed(2)}</span></div>
                            </div>
                            <button className="scan-btn" onPointerDown={(e) => { e.stopPropagation(); window.open(`file://${selectedNode.path}`); }}>EXTRACT LOGIC</button>
                        </div>
                    </div>
                    <style>{`
                        .glass-panel { 
                            position: absolute; 
                            left: 50%; 
                            top: 50%; 
                            transform: translate(-50%, -50%); 
                            width: 400px; 
                            background: #111111; 
                            border: 2px solid #00f2ff; 
                            color: #ffffff; 
                            font-family: 'Courier New', monospace; 
                            box-shadow: 0 0 30px rgba(0, 242, 255, 0.4);
                            pointer-events: auto;
                            z-index: 1000;
                        }
                        .panel-header { 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: center;
                            padding: 8px 15px; 
                            background: #00f2ff; 
                            color: #000; 
                            font-weight: bold;
                        }
                        .panel-header button { 
                            background: #000; border: none; color: #00f2ff; cursor: pointer; 
                            width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
                        }
                        .panel-content { padding: 25px; }
                        .scan-btn { 
                            width: 100%; padding: 12px; background: #00f2ff; border: none; color: #000; 
                            font-weight: bold; cursor: pointer; transition: all 0.2s; 
                        }
                        .scan-btn:hover { background: #fff; box-shadow: 0 0 15px #fff; }
                    `}</style>
                </Html>
            )}
        </group>
    );
};
