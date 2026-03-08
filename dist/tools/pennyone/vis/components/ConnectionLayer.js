import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
const NeuralLink = ({ start, end, highlighted }) => {
    const lineRef = useRef(null);
    useFrame((_state, delta) => {
        if (lineRef.current?.material) {
            lineRef.current.material.dashOffset -= delta * 2.0;
        }
    });
    return (_jsx(Line, { ref: lineRef, points: [start, end], color: "#00f2ff", lineWidth: highlighted ? 2 : 0.1, transparent: true, opacity: highlighted ? 0.9 : 0.05, dashed: true, dashSize: 20, dashScale: 2, gapSize: 30, raycast: () => null }));
};
export const ConnectionLayer = ({ links, nodes, activeNodeId }) => {
    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const validLinks = useMemo(() => {
        return (links || []).map(l => {
            const source = typeof l.source === 'object' ? l.source : nodeMap.get(l.source);
            const target = typeof l.target === 'object' ? l.target : nodeMap.get(l.target);
            return { source, target };
        }).filter(l => l.source && l.target &&
            typeof l.source.x === 'number' &&
            typeof l.target.x === 'number');
    }, [links, nodeMap]);
    // [Ω] Batch all background links into a single LineSegments geometry
    const { backgroundGeometry, highlightedLinks } = useMemo(() => {
        const bgPoints = [];
        const hl = [];
        validLinks.forEach(link => {
            const sNode = link.source;
            const tNode = link.target;
            const isHighlighted = activeNodeId && (sNode.id === activeNodeId || tNode.id === activeNodeId);
            if (isHighlighted) {
                hl.push(link);
            }
            else {
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
    return (_jsxs("group", { children: [backgroundGeometry.attributes.position && (_jsx("lineSegments", { geometry: backgroundGeometry, children: _jsx("lineBasicMaterial", { color: "#00f2ff", transparent: true, opacity: 0.05, depthWrite: false, toneMapped: false }) })), highlightedLinks.map((link, i) => {
                const sNode = link.source;
                const tNode = link.target;
                return (_jsx(NeuralLink, { start: [sNode.x || 0, sNode.y || 0, sNode.z || 0], end: [tNode.x || 0, tNode.y || 0, tNode.z || 0], highlighted: true }, `hl-link-${i}`));
            })] }));
};
