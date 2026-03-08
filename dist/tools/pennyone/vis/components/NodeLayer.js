import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useNodeEffects } from '../logic/useNodeEffects.ts';
const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();
const NodeTier = ({ nodes, tierNodes, type, hovered, selectedNode, links, detail, onPointerOver, onPointerOut, onPointerDown, onClick }) => {
    const meshRef = useRef(null);
    const { calculateEffect } = useNodeEffects();
    useFrame(() => {
        const currentMesh = meshRef.current;
        if (!currentMesh || !tierNodes || tierNodes.length === 0)
            return;
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
        if (currentMesh.instanceColor)
            currentMesh.instanceColor.needsUpdate = true;
    });
    if (tierNodes.length === 0)
        return null;
    return (_jsxs("instancedMesh", { ref: meshRef, args: [null, null, tierNodes.length], frustumCulled: false, onPointerOver: (e) => {
            e.stopPropagation();
            onPointerOver({ stopPropagation: e.stopPropagation, instanceId: tierNodes[e.instanceId].originalIndex });
        }, onPointerOut: onPointerOut, onPointerDown: (e) => {
            e.stopPropagation();
            onPointerDown({ stopPropagation: e.stopPropagation, instanceId: tierNodes[e.instanceId].originalIndex });
        }, onClick: (e) => {
            if (onClick) {
                e.stopPropagation();
                onClick({ stopPropagation: e.stopPropagation, instanceId: tierNodes[e.instanceId].originalIndex });
            }
        }, children: [type === 'PYTHON' ?
                _jsx("tetrahedronGeometry", { args: [18, detail === 0 ? 0 : 1] }) :
                _jsx("icosahedronGeometry", { args: [15, detail] }), _jsx("meshStandardMaterial", { emissive: "#ffffff", emissiveIntensity: 0.5, toneMapped: false })] }));
};
export const NodeLayer = (props) => {
    const { calculateEffect } = useNodeEffects();
    const nodesByDetail = useMemo(() => {
        const tiers = [[], [], []];
        props.nodes.forEach((node, i) => {
            const { detail } = calculateEffect(node, props.type, props.hovered, props.selectedNode, props.links, i, props.nodes);
            const tierIdx = Math.max(0, Math.min(2, detail));
            tiers[tierIdx].push({ node, originalIndex: i });
        });
        return tiers;
    }, [props.nodes, props.hovered, props.selectedNode, props.links, props.type, calculateEffect]);
    return (_jsxs("group", { children: [_jsx(NodeTier, { ...props, tierNodes: nodesByDetail[0], detail: 0 }), _jsx(NodeTier, { ...props, tierNodes: nodesByDetail[1], detail: 1 }), _jsx(NodeTier, { ...props, tierNodes: nodesByDetail[2], detail: 2 })] }));
};
