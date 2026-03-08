import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PlaybackHUD: The DVR controls for the Ghost's journey.
 * @param root0
 * @param root0.sessionLength
 * @param root0.currentIndex
 * @param root0.onSeek
 * @param root0.isLive
 * @param root0.onToggleLive
 * @param root0.isRecording
 * @param root0.onStartRecording
 * @param root0.onStopRecording
 */
export const PlaybackHUD = ({ sessionLength, currentIndex, onSeek, isLive, onToggleLive, isRecording, onStartRecording, onStopRecording }) => {
    return (_jsxs("div", { className: "playback-hud", children: [_jsxs("div", { className: "controls", children: [_jsx("button", { onClick: onToggleLive, className: isLive ? 'live-btn active' : 'live-btn', children: isLive ? '● LIVE' : 'PLAYBACK' }), _jsx("input", { type: "range", min: 0, max: Math.max(0, sessionLength - 1), value: currentIndex, onChange: (e) => onSeek(parseInt(e.target.value)), disabled: isLive }), _jsxs("span", { className: "timestamp", children: [currentIndex + 1, " / ", sessionLength] }), _jsx("button", { onClick: isRecording ? onStopRecording : onStartRecording, className: isRecording ? 'rec-btn active' : 'rec-btn', children: isRecording ? '● REC' : 'REC' })] }), _jsx("style", { children: `
                .playback-hud {
                    position: absolute;
                    bottom: 40px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 5, 10, 0.9);
                    border: 1px solid #00f2ff;
                    padding: 10px 20px;
                    border-radius: 4px;
                    width: 70%;
                    font-family: monospace;
                    backdrop-filter: blur(8px);
                    box-shadow: 0 0 20px rgba(0, 242, 255, 0.1);
                    pointer-events: none;
                }
                .controls { display: flex; align-items: center; gap: 20px; pointer-events: auto; }
                .live-btn, .rec-btn {
                    background: transparent;
                    border: 1px solid #00f2ff;
                    color: #00f2ff;
                    padding: 5px 15px;
                    cursor: pointer;
                    font-weight: bold;
                    min-width: 100px;
                }
                .live-btn.active {
                    background: #00f2ff;
                    color: #000;
                    box-shadow: 0 0 10px #00f2ff;
                }
                .rec-btn {
                    border-color: #ff4d4d;
                    color: #ff4d4d;
                }
                .rec-btn.active {
                    background: #ff4d4d;
                    color: #fff;
                    box-shadow: 0 0 10px #ff4d4d;
                    animation: blink 1s infinite;
                }
                @keyframes blink {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                input[type="range"] {
                    flex: 1;
                    accent-color: #00f2ff;
                    cursor: pointer;
                }
                .timestamp { color: #00f2ff; min-width: 60px; text-align: right; }
            ` })] }));
};
