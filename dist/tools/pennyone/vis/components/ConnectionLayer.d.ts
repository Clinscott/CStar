import React from 'react';
import { Node, Link } from '../types/index.ts';
interface ConnectionLayerProps {
    links: Link[];
    nodes: Node[];
    activeNodeId: string | number | null;
}
export declare const ConnectionLayer: React.FC<ConnectionLayerProps>;
export {};
