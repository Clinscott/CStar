import React from 'react';
import { Node } from '../types/index.ts';
interface SelectionPanelProps {
    selectedNode: Node;
    onClose: () => void;
    children?: React.ReactNode;
}
/**
 * [GUNGNIR] Selection Panel (v2.0)
 * Purpose: Screen-space UI Overlay for Sector Detail.
 * Fixes: No longer stuck in 3D space; always visible on selection.
 */
export declare const SelectionPanel: React.FC<SelectionPanelProps>;
export {};
