import React from 'react';
import { Node, Trajectory } from '../types/index.ts';
interface SelectionPanelShellProps {
    selectedNode: Node;
    trajectories: Trajectory[];
    onClose: () => void;
}
/**
 * [GUNGNIR] Selection Panel
 * Purpose: Decomposed UI Shell for Sector Detail View.
 * Standard: Linscott Protocol ([L] > 4.0 Compliance).
 * @param root0
 * @param root0.selectedNode
 * @param root0.trajectories
 * @param root0.onClose
 */
export declare const SelectionPanelShell: React.FC<SelectionPanelShellProps>;
export {};
