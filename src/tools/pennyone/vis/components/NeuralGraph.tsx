import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, extend } from '@react-three/fiber';
import { Html, useTexture, shaderMaterial } from '@react-three/drei';
import * as d3 from 'd3-force-3d';
import gsap from 'gsap';

// [Ω] Custom Shaders from ThreeJS-Skills Codex
const PulseMaterial = shaderMaterial(
    { time: 0, color: new THREE.Color('#00f2ff') },
    // Vertex
    `varying vec2 vUv;
     void main() {
       vUv = uv;
       gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
     }`,
    // Fragment
    `uniform float time;
     uniform vec3 color;
     varying vec2 vUv;
     void main() {
       float dash = sin(vUv.x * 20.0 - time * 10.0);
       if (dash < 0.0) discard;
       gl_FragColor = vec4(color, 1.0);
     }`
);

const FresnelMaterial = shaderMaterial(
    { time: 0, color: new THREE.Color('#ff4d4d'), glowColor: new THREE.Color('#ff0000') },
    // Vertex
    `varying vec3 vNormal;
     varying vec3 vWorldPosition;
     void main() {
       vNormal = normalize(normalMatrix * normal);
       vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
       gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
     }`,
    // Fragment
    `uniform float time;
     uniform vec3 color;
     uniform vec3 glowColor;
     varying vec3 vNormal;
     varying vec3 vWorldPosition;
     void main() {
       vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
       float fresnel = pow(1.0 - dot(viewDirection, vNormal), 3.0);
       float pulse = 0.8 + 0.2 * sin(time * 2.0);
       gl_FragColor = vec4(mix(color, glowColor, fresnel * pulse), 1.0);
     }`
);

extend({ PulseMaterial, FresnelMaterial });

interface Node extends d3.SimulationNodeDatum {
    id: string;
    path: string;
    loc: number;
    matrix: Record<string, unknown>;
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
    const materialRef = useRef<THREE.ShaderMaterial & { time: number }>(null);
    useFrame((state) => {
        if (!materialRef.current) return;
        materialRef.current.time = state.clock.getElapsedTime();
    });
    return (
        <mesh position={[node.x || 0, node.y || 0, node.z || 0]} raycast={() => null}>
            <boxGeometry args={[40, 40, 40]} />
            <pulseMaterial ref={materialRef} transparent color="#ffffff" />
        </mesh>
    );
};

const FresnelAura: React.FC<{ node: Node }> = ({ node }) => {
    const materialRef = useRef<THREE.ShaderMaterial & { time: number }>(null);
    const logicVal = Number((node.matrix as Record<string, number>)?.logic);
    const isToxic = (!isNaN(logicVal) ? logicVal : 10) < 4.0;

    useFrame((state) => {
        if (!materialRef.current) return;
        materialRef.current.time = state.clock.getElapsedTime();
    });

    return (
        <mesh position={[node.x || 0, node.y || 0, node.z || 0]} scale={[2.2, 2.2, 2.2]} raycast={() => null}>
            <icosahedronGeometry args={[15, 2]} />
            <fresnelMaterial
                ref={materialRef}
                transparent
                color={isToxic ? '#ff0000' : '#00f2ff'}
                glowColor={isToxic ? '#ff4d4d' : '#ffffff'}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
};

const NeuralLink: React.FC<{ start: [number, number, number], end: [number, number, number] }> = ({ start, end }) => {
    const materialRef = useRef<THREE.ShaderMaterial & { time: number }>(null);
    useFrame((state) => {
        if (materialRef.current) materialRef.current.time = state.clock.getElapsedTime();
    });

    const points = useMemo(() => [new THREE.Vector3(...start), new THREE.Vector3(...end)], [start, end]);
    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0], 2));
        return geo;
    }, [points]);

    return (
        <line geometry={geometry}>
            <pulseMaterial ref={materialRef} transparent opacity={0.4} color="#00f2ff" />
        </line>
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

    const spriteRef = useRef<THREE.Sprite>(null);
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
    data: Record<string, unknown>;
    gravityData: Record<string, number>;
    token: string;
    onNodesMapped?: (_map: Map<string, THREE.Vector3>) => void;
}> = ({ data: initialData, gravityData, token, onNodesMapped }) => {
    const { camera, controls } = useThree();
    const sphereMeshRef = useRef<THREE.InstancedMesh>(null);
    const tetraMeshRef = useRef<THREE.InstancedMesh>(null);

    const [simReady, setSimReady] = useState(false);
    const [hovered, setHovered] = useState<{ type: string, id: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [trajectories, setTrajectories] = useState<any[]>([]);

    // 1. Prepare Semantic Nodes
    const { allNodes, pyNodes, logicNodes, links, orphanSet } = useMemo(() => {
        const fallback = { allNodes: [], pyNodes: [], logicNodes: [], links: [], orphanSet: new Set<string>() };
        if (!initialData || !Array.isArray(initialData.files)) return fallback;

        try {
            const files = Array.isArray(initialData.files) ? initialData.files : [];
            const nodes: Node[] = files.map((f: Record<string, unknown>) => ({
                id: (f.path as string) || Math.random().toString(),
                path: (f.path as string) || '?',
                loc: (f.loc as number) || 0,
                matrix: (f.matrix as Record<string, unknown>) || { overall: 5 },
                intent: (f.intent as string) || '...',
                type: ((f.path as string) || '').endsWith('.py') ? 'PYTHON' : 'LOGIC',
                gravity: gravityData?.[f.path as string] || 0
            }));

            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            const linkList: Link[] = [];
            const usedIds = new Set<string>();

            files.forEach((f: Record<string, unknown>) => {
                if (!f.path) return;
                const pathStr = f.path as string;
                ((f.dependencies as string[]) || []).forEach((dep: string) => {
                    if (nodeMap.has(dep)) {
                        linkList.push({ source: pathStr, target: dep });
                        usedIds.add(pathStr);
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
        } catch {
            return fallback;
        }
    }, [initialData, gravityData]);

    const getLogScale = (loc: number) => Math.max(0.8, Math.log10(loc || 1) * 1.2);

    // 2. Trajectory Fetching
    useEffect(() => {
        if (!selectedNode || !token) {
            setTrajectories([]);
            return;
        }
        const fetchTrajectories = async () => {
            try {
                const res = await fetch(`/api/matrix/trajectories?token=${token}&file=${encodeURIComponent(selectedNode.path)}`);
                if (res.ok) {
                    const data = await res.json();
                    setTrajectories(data);
                }
            } catch (err) {
                console.error('[PENNYONE]: Trajectory fetch failed.', err);
            }
        };
        fetchTrajectories();
    }, [selectedNode, token]);

    // 2. Static Simulation
    useEffect(() => {
        if (!allNodes || allNodes.length === 0) {
            setSimReady(true);
            return;
        }

        try {
            (d3 as typeof import('d3-force-3d')).forceSimulation(allNodes, 3)
                .force('link', (d3 as typeof import('d3-force-3d')).forceLink(links || []).id((d: unknown) => (d as Node).id).distance(300))
                .force('charge', (d3 as typeof import('d3-force-3d')).forceManyBody().strength((d: unknown) => -1000 - (((d as Node).gravity as number) || 0) * 150))
                .force('collide', (d3 as typeof import('d3-force-3d')).forceCollide().radius((d: unknown) => getLogScale(((d as Node).loc as number) || 1) * 80))
                .force('center', (d3 as typeof import('d3-force-3d')).forceCenter(0, 0, 0));

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
        } catch { /* empty */ }

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
            const currentMesh = mesh.current;
            if (!currentMesh || !nodes) return;
            nodes.forEach((node, i) => {
                if (i >= currentMesh.count) return;
                tempObject.matrix.identity();
                tempObject.position.set(node.x || 0, node.y || 0, node.z || 0);

                let scale = getLogScale(node.loc);
                const isHovered = hovered?.type === type && hovered?.id === i;
                const isSelected = selectedNode?.id === node.id;

                if (isHovered) scale *= 1.5;
                if (isSelected) scale *= 1.8;

                tempObject.scale.set(scale, scale, scale);
                tempObject.updateMatrix();
                currentMesh.setMatrixAt(i, tempObject.matrix);

                const p = (node.path || '').toLowerCase();
                const nodeMatrix = node.matrix as Record<string, number>;
                if (isHovered || isSelected) {
                    tempColor.set('#ffffff');
                } else if (p.includes('agent') || p.includes('core')) {
                    tempColor.set('#ff9900');
                } else if (p.includes('tool') || p.includes('scanner')) {
                    tempColor.set('#00f2ff');
                } else if ((nodeMatrix?.overall || 5) > 8) {
                    tempColor.set('#ffffff');
                } else if ((nodeMatrix?.overall || 5) < 5) {
                    tempColor.set('#ff4d4d');
                } else {
                    tempColor.set('#444444');
                }
                currentMesh.setColorAt(i, tempColor);
            });
            currentMesh.instanceMatrix.needsUpdate = true;
            if (currentMesh.instanceColor) currentMesh.instanceColor.needsUpdate = true;
        });
    });

    const handleNodeClick = (node: Node) => {
        if (!node) return;
        console.log(`[ALFRED]: "Handshaking with sector: ${node.path}"`);
        setSelectedNode(node);
        const targetPos = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
        gsap.to(camera.position, { x: targetPos.x + 200, y: targetPos.y + 150, z: targetPos.z + 400, duration: 1.2, ease: 'power2.inOut' });
        if (controls) gsap.to((controls as unknown as { target: THREE.Vector3 }).target, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1.2, ease: 'power2.inOut' });
    };

    if (!simReady) return null;

    const validLinks = (links || []).filter(l => l.source && l.target && typeof (l.source as unknown as Node).x === 'number' && typeof (l.target as unknown as Node).x === 'number');

    return (
        <group>
            {validLinks.length > 0 && validLinks.map((link, i) => (
                <NeuralLink
                    key={`link-${i}`}
                    start={[(link.source as unknown as Node).x || 0, (link.source as unknown as Node).y || 0, (link.source as unknown as Node).z || 0]}
                    end={[(link.target as unknown as Node).x || 0, (link.target as unknown as Node).y || 0, (link.target as unknown as Node).z || 0]}
                />
            ))}

            {(allNodes || []).filter(n => (n.gravity || 0) > 50 || (Number((n.matrix as Record<string, number>)?.logic) || 10) < 4.0).map((node, i) => (
                <FresnelAura key={`aura-${i}`} node={node} />
            ))}

            <instancedMesh ref={sphereMeshRef} args={[null as unknown as THREE.BufferGeometry, null as unknown as THREE.Material, (logicNodes || []).length]} frustumCulled={false}
                onPointerOver={(e) => { e.stopPropagation(); setHovered({ type: 'LOGIC', id: e.instanceId as number }); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(null); document.body.style.cursor = 'auto'; }}
                onPointerDown={(e) => { e.stopPropagation(); if (logicNodes?.[(e as unknown as { instanceId: number }).instanceId]) handleNodeClick(logicNodes[(e as unknown as { instanceId: number }).instanceId]); }}>
                <icosahedronGeometry args={[15, 2]} />
                <meshStandardMaterial emissive="#111" emissiveIntensity={2} />
            </instancedMesh>

            <instancedMesh ref={tetraMeshRef} args={[null as unknown as THREE.BufferGeometry, null as unknown as THREE.Material, (pyNodes || []).length]} frustumCulled={false}
                onPointerOver={(e) => { e.stopPropagation(); setHovered({ type: 'PYTHON', id: e.instanceId as number }); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(null); document.body.style.cursor = 'auto'; }}
                onPointerDown={(e) => { e.stopPropagation(); if (pyNodes?.[(e as unknown as { instanceId: number }).instanceId]) handleNodeClick(pyNodes[(e as unknown as { instanceId: number }).instanceId]); }}>
                <tetrahedronGeometry args={[18]} />
                <meshStandardMaterial emissive="#111" emissiveIntensity={10} toneMapped={false} />
            </instancedMesh>

            <React.Suspense fallback={null}>
                {(allNodes || []).map((node, i) => <SpriteIcon key={`sprite-${i}`} node={node} />)}
            </React.Suspense>

            {selectedNode && <SelectionHighlight node={selectedNode} />}

            {selectedNode && (
                <Html>
                    <div className="glass-panel-wrapper" onPointerDown={(e) => e.stopPropagation()}>
                        <div className="glass-panel">
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
                                    <div><label style={{ display: 'block', color: '#00f2ff', fontSize: '10px' }}>GUNGNIR</label><span style={{ color: '#fff' }}>{(Number((selectedNode.matrix as Record<string, number>)?.overall) || 0).toFixed(2)}</span></div>
                                </div>

                                {trajectories.length > 0 && (
                                    <div className="trajectory-log" style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
                                        <label style={{ display: 'block', color: '#00f2ff', fontSize: '10px', marginBottom: '10px' }}>NEURAL TRAJECTORIES</label>
                                        <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.8rem' }}>
                                            {trajectories.map((t, i) => (
                                                <div key={i} style={{ marginBottom: '10px', padding: '5px', background: '#1a1a1a', borderLeft: `2px solid ${t.final_score > t.initial_score ? '#00ff00' : '#ff4d4d'}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#888' }}>{new Date(t.timestamp).toLocaleDateString()}</span>
                                                        <span style={{ color: t.final_score > t.initial_score ? '#00ff00' : '#ff4d4d' }}>
                                                            {t.initial_score.toFixed(1)} → {t.final_score.toFixed(1)}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '3px' }}>{t.justification}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button className="scan-btn" style={{ marginTop: '20px' }} onPointerDown={(e) => { e.stopPropagation(); window.open(`file://${selectedNode.path}`); }}>EXTRACT LOGIC</button>
                            </div>
                        </div>
                    </div>
                    <style>{`
                        .glass-panel-wrapper {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            pointer-events: none;
                        }
                        .glass-panel { 
                            display: flex;
                            flex-direction: column;
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
