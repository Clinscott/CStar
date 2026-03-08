import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { Node, Link } from '../types/index.ts';

interface NeuralLinkProps {
    start: [number, number, number];
    end: [number, number, number];
    highlighted?: boolean;
}

const NeuralLink: React.FC<NeuralLinkProps> = ({ start, end, highlighted }) => {
    const lineRef = useRef<any>(null);
    useFrame((_state, delta) => {
        if (lineRef.current?.material) {
            lineRef.current.material.dashOffset -= delta * 2.0;
        }
    });

    return (
        <Line
            ref={lineRef}
            points={[start, end]}
            color="#00f2ff"
            lineWidth={highlighted ? 2 : 0.1}
            transparent
            opacity={highlighted ? 0.9 : 0.05}
            dashed={true}
            dashSize={20}
            dashScale={2}
            gapSize={30}
            raycast={() => null}
        />
    );
};

interface ConnectionLayerProps {
    links: Link[];
    nodes: Node[];
    activeNodeId: string | number | null;
}

export const ConnectionLayer: React.FC<ConnectionLayerProps> = ({ links, nodes, activeNodeId }) => {
    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

    const validLinks = useMemo(() => {
        return (links || []).map(l => {
            const source = typeof l.source === 'object' ? l.source : nodeMap.get(l.source);
            const target = typeof l.target === 'object' ? l.target : nodeMap.get(l.target);
            return { source, target };
        }).filter(l => 
            l.source && l.target && 
            typeof (l.source as any).x === 'number' && 
            typeof (l.target as any).x === 'number'
        );
    }, [links, nodeMap]);

    // [Ω] Batch all background links into a single LineSegments geometry
    const { backgroundGeometry, highlightedLinks } = useMemo(() => {
        const bgPoints: number[] = [];
        const hl: any[] = [];

        validLinks.forEach(link => {
            const sNode = link.source as unknown as Node;
            const tNode = link.target as unknown as Node;
            const isHighlighted = activeNodeId && (sNode.id === activeNodeId || tNode.id === activeNodeId);

            if (isHighlighted) {
                hl.push(link);
            } else {
                bgPoints.push(sNode.x || 0, sNode.y || 0, sNode.z || 0);
                bgPoints.push(tNode.x || 0, tNode.y || 0, tNode.z || 0);
            }
        });

        const geo = new THREE.BufferGeometry();
        if (bgPoints.length > 0) {
            geo.setAttribute('position', new THREE.Float32BufferAttribute(bgPoints, 3));
        }

        return { backgroundGeometry: geo, highlightedLinks: hl };
    }, [validLinks, activeNodeId]);

    return (
        <group>
            {/* 1. Batched Background (1 Draw Call) */}
            {backgroundGeometry.attributes.position && (
                <lineSegments geometry={backgroundGeometry}>
                    <lineBasicMaterial
                        color="#00f2ff"
                        transparent
                        opacity={0.05}
                        depthWrite={false}
                        toneMapped={false}
                    />
                </lineSegments>
            )}

            {/* 2. Dynamic Projections (Animated/Dashed) */}
            {highlightedLinks.map((link, i) => {
                const sNode = link.source as unknown as Node;
                const tNode = link.target as unknown as Node;
                return (
                    <NeuralLink
                        key={`hl-link-${i}`}
                        start={[sNode.x || 0, sNode.y || 0, sNode.z || 0]}
                        end={[tNode.x || 0, tNode.y || 0, tNode.z || 0]}
                        highlighted={true}
                    />
                );
            })}
        </group>
    );
};
