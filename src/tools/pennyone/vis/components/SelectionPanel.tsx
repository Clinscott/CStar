import React from 'react';
import { Html } from '@react-three/drei';
import { Node } from '../types/index.ts';

interface SelectionPanelProps {
    selectedNode: Node;
    onClose: () => void;
    children?: React.ReactNode;
}

export const SelectionPanel: React.FC<SelectionPanelProps> = ({ selectedNode, onClose, children }) => {
    return (
        <Html wrapperClass="interactive-html-wrapper" style={{ pointerEvents: 'none' }}>
            <div className="glass-panel-wrapper" onPointerDown={(e) => e.stopPropagation()}>
                <div className="glass-panel">
                    <div className="panel-header">
                        <span>SECTOR: {selectedNode.type}</span>
                        <button onPointerDown={(e) => { e.stopPropagation(); onClose(); }}>×</button>
                    </div>
                    <div className="panel-content">
                        {children}
                    </div>
                </div>
            </div>
            <style>{`
                .glass-panel-wrapper { display: flex; align-items: center; justify-content: center; pointer-events: none; }
                .glass-panel { 
                    display: flex; flex-direction: column; width: 400px; background: #111111; 
                    border: 2px solid #00f2ff; color: #ffffff; font-family: 'Courier New', monospace; 
                    box-shadow: 0 0 30px rgba(0, 242, 255, 0.4); pointer-events: auto; z-index: 1000;
                }
                .panel-header { 
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 8px 15px; background: #00f2ff; color: #000; font-weight: bold;
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
    );
};
