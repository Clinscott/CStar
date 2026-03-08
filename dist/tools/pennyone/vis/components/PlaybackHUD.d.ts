import React from 'react';
interface PlaybackHUDProps {
    sessionLength: number;
    currentIndex: number;
    onSeek: (index: number) => void;
    isLive: boolean;
    onToggleLive: () => void;
    isRecording: boolean;
    onStartRecording: () => void;
    onStopRecording: () => void;
}
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
export declare const PlaybackHUD: React.FC<PlaybackHUDProps>;
export {};
