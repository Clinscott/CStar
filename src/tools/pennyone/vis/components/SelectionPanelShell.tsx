import React from 'react';
import { SelectionPanel } from  './SelectionPanel.js';
import { TrajectoryList } from  './TrajectoryList.js';
import { SectorMetrics } from  './SectorMetrics.js';
import { Node, Trajectory } from  '../types/index.js';

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
export const SelectionPanelShell: React.FC<SelectionPanelShellProps> = ({ selectedNode, trajectories, onClose }) => {
    const filename = (selectedNode.path || '').split(/[\/\\]/).pop() || 'Unknown Sector';

    return (
        <SelectionPanel selectedNode={selectedNode} onClose={onClose}>
            <h1 style={{ color: '#00f2ff', margin: '0 0 10px 0', fontSize: '1.4rem' }}>{filename}</h1>
            <div className="path-label" style={{ color: '#aaa', fontSize: '10px', marginBottom: '20px' }}>
                {selectedNode.path}
            </div>
            
            <div style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase' }}>Intent</strong>
                <p style={{ color: '#eee', fontSize: '0.9rem', lineHeight: '1.4', marginTop: '4px' }}>{selectedNode.intent}</p>
            </div>

            {selectedNode.interactionProtocol && (
                <div style={{ marginBottom: '15px', padding: '10px', background: 'rgba(0, 242, 255, 0.05)', borderLeft: '2px solid #00f2ff' }}>
                    <strong style={{ color: '#00f2ff', fontSize: '0.8rem', textTransform: 'uppercase' }}>Interaction Protocol</strong>
                    <p style={{ color: '#ddd', fontSize: '0.85rem', lineHeight: '1.4', marginTop: '4px' }}>
                        {selectedNode.interactionProtocol}
                    </p>
                </div>
            )}
            
            <SectorMetrics node={selectedNode} />
            <TrajectoryList trajectories={trajectories} />

            <button 
                className="scan-btn" 
                style={{ marginTop: '20px' }} 
                onPointerDown={(e) => { e.stopPropagation(); window.open(`file://${selectedNode.path}`); }}
            >
                EXTRACT LOGIC
            </button>
        </SelectionPanel>
    );
};
