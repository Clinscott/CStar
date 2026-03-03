import React from 'react';
import { Node } from '../types/index.ts';

interface SectorMetricsProps {
    node: Node;
}

export const SectorMetrics: React.FC<SectorMetricsProps> = ({ node }) => {
    const overallScore = Number((node.matrix as Record<string, number>)?.overall) || 0;

    return (
        <div className="stats-grid" style={{ display: 'flex', gap: '30px', margin: '20px 0' }}>
            <div>
                <label style={{ display: 'block', color: '#00f2ff', fontSize: '10px' }}>LOC</label>
                <span style={{ color: '#fff' }}>{node.loc}</span>
            </div>
            <div>
                <label style={{ display: 'block', color: '#00f2ff', fontSize: '10px' }}>GUNGNIR</label>
                <span style={{ color: '#fff' }}>{overallScore.toFixed(2)}</span>
            </div>
        </div>
    );
};
