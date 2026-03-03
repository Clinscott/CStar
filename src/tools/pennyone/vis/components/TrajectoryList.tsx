import React from 'react';
import { Trajectory } from '../types/index.ts';

interface TrajectoryListProps {
    trajectories: Trajectory[];
}

export const TrajectoryList: React.FC<TrajectoryListProps> = ({ trajectories }) => {
    if (trajectories.length === 0) return null;

    return (
        <div className="trajectory-log" style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
            <label style={{ display: 'block', color: '#00f2ff', fontSize: '10px', marginBottom: '10px' }}>NEURAL TRAJECTORIES</label>
            <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.8rem' }}>
                {trajectories.map((t, i) => (
                    <div key={i} style={{ marginBottom: '10px', padding: '5px', background: '#1a1a1a', borderLeft: `2px solid ${t.final_score > t.initial_score ? '#00ff00' : '#ff4d4d'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#888' }}>{new Date(t.timestamp).toLocaleDateString()}</span>
                            <span style={{ color: t.final_score > t.initial_score ? '#00ff00' : '#ff4d4d' }}>
                                {t.initial_score.toFixed(1)} → {t.final_score.toFixed(1)}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '3px' }}>{t.justification}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
