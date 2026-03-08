import React from 'react';
import { Node, Link } from '../types/index.ts';
interface NodeLayerProps {
    nodes: Node[];
    type: 'PYTHON' | 'LOGIC';
    hovered: {
        type: string;
        id: number;
    } | null;
    selectedNode: Node | null;
    links: Link[];
    onPointerOver: (e: {
        stopPropagation: () => void;
        instanceId: number;
    }) => void;
    onPointerOut: () => void;
    onPointerDown: (e: {
        stopPropagation: () => void;
        instanceId: number;
    }) => void;
    onClick?: (e: {
        stopPropagation: () => void;
        instanceId: number;
    }) => void;
}
export declare const NodeLayer: React.FC<NodeLayerProps>;
export {};
