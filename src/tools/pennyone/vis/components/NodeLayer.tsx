import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Node, Link } from '../types/index.ts';
import { useNodeEffects } from '../logic/useNodeEffects.ts';

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

interface NodeLayerProps {
    nodes: Node[];
    type: 'PYTHON' | 'LOGIC';
    hovered: { type: string, id: number } | null;
    selectedNode: Node | null;
    links: Link[];
    onPointerOver: (e: { stopPropagation: () => void; instanceId: number }) => void;
    onPointerOut: () => void;
    onPointerDown: (e: { stopPropagation: () => void; instanceId: number }) => void;
    onClick?: (e: { stopPropagation: () => void; instanceId: number }) => void;
}

interface NodeTierProps extends NodeLayerProps {
    tierNodes: { node: Node, originalIndex: number }[];
    detail: number;
}

const NodeTier: React.FC<NodeTierProps> = ({
    nodes, tierNodes, type, hovered, selectedNode, links, detail,
    onPointerOver, onPointerOut, onPointerDown, onClick
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { calculateEffect } = useNodeEffects();

    useFrame(() => {
        const currentMesh = meshRef.current;
        if (!currentMesh || !tierNodes || tierNodes.length === 0) return;

        tierNodes.forEach((item, i) => {
            const { scale, color } = calculateEffect(item.node, type, hovered, selectedNode, links, item.originalIndex, nodes);

            tempObject.matrix.identity();
            tempObject.position.set(item.node.x || 0, item.node.y || 0, item.node.z || 0);
            tempObject.scale.set(scale, scale, scale);
            tempObject.updateMatrix();
            currentMesh.setMatrixAt(i, tempObject.matrix);

            tempColor.set(color);
            currentMesh.setColorAt(i, tempColor);
        });

        currentMesh.instanceMatrix.needsUpdate = true;
        if (currentMesh.instanceColor) currentMesh.instanceColor.needsUpdate = true;
    });

    if (tierNodes.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[null as any, null as any, tierNodes.length]}
            frustumCulled={false}
            onPointerOver={(e) => {
                e.stopPropagation();
                onPointerOver({ stopPropagation: e.stopPropagation, instanceId: tierNodes[e.instanceId].originalIndex });
            }}
            onPointerOut={onPointerOut}
            onPointerDown={(e) => {
                e.stopPropagation();
                onPointerDown({ stopPropagation: e.stopPropagation, instanceId: tierNodes[e.instanceId].originalIndex });
            }}
            onClick={(e) => {
                if (onClick) {
                    e.stopPropagation();
                    onClick({ stopPropagation: e.stopPropagation, instanceId: tierNodes[e.instanceId].originalIndex });
                }
            }}
        >
            {type === 'PYTHON' ? 
                <tetrahedronGeometry args={[18, detail === 0 ? 0 : 1]} /> : 
                <icosahedronGeometry args={[15, detail]} />
            }
            <meshStandardMaterial 
                emissive="#ffffff" 
                emissiveIntensity={0.5} 
                toneMapped={false} 
            />
        </instancedMesh>
    );
};

export const NodeLayer: React.FC<NodeLayerProps> = (props) => {
    const { calculateEffect } = useNodeEffects();

    const nodesByDetail = useMemo(() => {
        const tiers: { node: Node, originalIndex: number }[][] = [[], [], []];
        props.nodes.forEach((node, i) => {
            const { detail } = calculateEffect(node, props.type, props.hovered, props.selectedNode, props.links, i, props.nodes);
            const tierIdx = Math.max(0, Math.min(2, detail));
            tiers[tierIdx].push({ node, originalIndex: i });
        });
        return tiers;
    }, [props.nodes, props.hovered, props.selectedNode, props.links, props.type, calculateEffect]);

    return (
        <group>
            <NodeTier {...props} tierNodes={nodesByDetail[0]} detail={0} />
            <NodeTier {...props} tierNodes={nodesByDetail[1]} detail={1} />
            <NodeTier {...props} tierNodes={nodesByDetail[2]} detail={2} />
        </group>
    );
};
