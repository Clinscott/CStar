import React from 'react';

interface PlaybackHUDProps {
    sessionLength: number;
    currentIndex: number;
    onSeek: (index: number) => void;
    isLive: boolean;
    onToggleLive: () => void;
}

/**
 * PlaybackHUD: The DVR controls for the Ghost's journey.
 */
export const PlaybackHUD: React.FC<PlaybackHUDProps> = ({
    sessionLength,
    currentIndex,
    onSeek,
    isLive,
    onToggleLive
}) => {
    if (sessionLength === 0) return null;

    return (
        <div className="playback-hud">
            <div className="controls">
                <button
                    onClick={onToggleLive}
                    className={isLive ? 'live-btn active' : 'live-btn'}
                >
                    {isLive ? '● LIVE' : 'PLAYBACK'}
                </button>

                <input
                    type="range"
                    min={0}
                    max={sessionLength - 1}
                    value={currentIndex}
                    onChange={(e) => onSeek(parseInt(e.target.value))}
                    disabled={isLive}
                />

                <span className="timestamp">
                    {currentIndex + 1} / {sessionLength}
                </span>
            </div>

            <style>{`
                .playback-hud {
                    position: absolute;
                    bottom: 40px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 5, 10, 0.9);
                    border: 1px solid #00f2ff;
                    padding: 10px 20px;
                    border-radius: 4px;
                    width: 60%;
                    font-family: monospace;
                    backdrop-filter: blur(8px);
                    box-shadow: 0 0 20px rgba(0, 242, 255, 0.1);
                }
                .controls { display: flex; align-items: center; gap: 20px; }
                .live-btn {
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
                input[type="range"] {
                    flex: 1;
                    accent-color: #00f2ff;
                    cursor: pointer;
                }
                .timestamp { color: #00f2ff; min-width: 60px; text-align: right; }
            `}</style>
        </div>
    );
};
