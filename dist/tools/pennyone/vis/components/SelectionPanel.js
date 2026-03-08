import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * [GUNGNIR] Selection Panel (v2.0)
 * Purpose: Screen-space UI Overlay for Sector Detail.
 * Fixes: No longer stuck in 3D space; always visible on selection.
 */
export const SelectionPanel = ({ selectedNode, onClose, children }) => {
    return (_jsxs("div", { className: "selection-panel-container", children: [_jsxs("div", { className: "glass-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("span", { className: "sector-tag", children: ["SECTOR: ", selectedNode.path.split('.').pop()?.toUpperCase()] }), _jsx("button", { className: "close-btn", onClick: onClose, children: "\u00D7" })] }), _jsx("div", { className: "panel-content", children: children })] }), _jsx("style", { children: `
                .selection-panel-container {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    bottom: 20px;
                    width: 450px;
                    z-index: 2000;
                    display: flex;
                    flex-direction: column;
                    pointer-events: none;
                }
                .glass-panel { 
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: rgba(0, 5, 10, 0.85);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(0, 242, 255, 0.4);
                    color: #ffffff;
                    font-family: 'Inter', sans-serif;
                    box-shadow: -10px 0 50px rgba(0, 0, 0, 0.5);
                    pointer-events: auto;
                    overflow: hidden;
                    border-radius: 4px;
                }
                .panel-header { 
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    background: rgba(0, 242, 255, 0.1);
                    border-bottom: 1px solid rgba(0, 242, 255, 0.2);
                }
                .sector-tag {
                    color: #00f2ff;
                    font-weight: bold;
                    letter-spacing: 1px;
                    font-size: 0.75rem;
                }
                .close-btn { 
                    background: transparent;
                    border: none;
                    color: rgba(255, 255, 255, 0.5);
                    cursor: pointer; 
                    font-size: 1.5rem;
                    transition: all 0.2s;
                }
                .close-btn:hover {
                    color: #ff4d4d;
                    transform: scale(1.1);
                }
                .panel-content { 
                    padding: 30px;
                    flex: 1;
                    overflow-y: auto;
                }
                .panel-content::-webkit-scrollbar { width: 4px; }
                .panel-content::-webkit-scrollbar-thumb { background: rgba(0, 242, 255, 0.3); }
            ` })] }));
};
