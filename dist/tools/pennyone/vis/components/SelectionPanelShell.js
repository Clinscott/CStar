import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SelectionPanel } from './SelectionPanel.tsx';
import { TrajectoryList } from './TrajectoryList.tsx';
import { SectorMetrics } from './SectorMetrics.tsx';
/**
 * [GUNGNIR] Selection Panel
 * Purpose: Decomposed UI Shell for Sector Detail View.
 * Standard: Linscott Protocol ([L] > 4.0 Compliance).
 * @param root0
 * @param root0.selectedNode
 * @param root0.trajectories
 * @param root0.onClose
 */
export const SelectionPanelShell = ({ selectedNode, trajectories, onClose }) => {
    const filename = (selectedNode.path || '').split(/[\/\\]/).pop() || 'Unknown Sector';
    return (_jsxs(SelectionPanel, { selectedNode: selectedNode, onClose: onClose, children: [_jsx("h1", { style: { color: '#00f2ff', margin: '0 0 10px 0', fontSize: '1.4rem' }, children: filename }), _jsx("div", { className: "path-label", style: { color: '#aaa', fontSize: '10px', marginBottom: '20px' }, children: selectedNode.path }), _jsxs("div", { style: { marginBottom: '15px' }, children: [_jsx("strong", { style: { color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase' }, children: "Intent" }), _jsx("p", { style: { color: '#eee', fontSize: '0.9rem', lineHeight: '1.4', marginTop: '4px' }, children: selectedNode.intent })] }), selectedNode.matrix?.interaction_protocol && (_jsxs("div", { style: { marginBottom: '15px', padding: '10px', background: 'rgba(0, 242, 255, 0.05)', borderLeft: '2px solid #00f2ff' }, children: [_jsx("strong", { style: { color: '#00f2ff', fontSize: '0.8rem', textTransform: 'uppercase' }, children: "Interaction Protocol" }), _jsx("p", { style: { color: '#ddd', fontSize: '0.85rem', lineHeight: '1.4', marginTop: '4px' }, children: selectedNode.matrix.interaction_protocol })] })), _jsx(SectorMetrics, { node: selectedNode }), _jsx(TrajectoryList, { trajectories: trajectories }), _jsx("button", { className: "scan-btn", style: { marginTop: '20px' }, onPointerDown: (e) => { e.stopPropagation(); window.open(`file://${selectedNode.path}`); }, children: "EXTRACT LOGIC" })] }));
};
