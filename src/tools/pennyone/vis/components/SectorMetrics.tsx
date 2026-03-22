import React from 'react';
import { Node } from  '../types/index.js';

interface SectorMetricsProps {
    node: Node;
}

export const SectorMetrics: React.FC<SectorMetricsProps> = ({ node }) => {
    const matrix = (node.matrix || {}) as Record<string, number>;
    const overall = Number(matrix?.overall) || 0;
    const logic = Number(matrix?.logic) || 0;
    const style = Number(matrix?.style) || 0;
    const intel = Number(matrix?.intel) || 0;
    const aesthetic = Number(matrix?.aesthetic) || 0;
    const stability = Number(matrix?.stability) || 0;
    const coupling = Number(matrix?.coupling) || 0;
    const sovereignty = Number(matrix?.sovereignty) || 0;
    const anomaly = Number(matrix?.anomaly) || 0;
    const gravity = Number(node.gravity) || Number(matrix?.gravity) || 0;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', margin: '20px 0', borderTop: '1px solid #333', paddingTop: '15px' }}>
            {/* Primary Metrics */}
            <Metric label="Gungnir" value={overall.toFixed(2)} color={overall >= 8.5 ? '#ffd700' : (overall < 4 ? '#ff4d4d' : '#00f2ff')} bold />
            <Metric label="Aesthetic" value={aesthetic.toFixed(2)} />
            
            {/* Core Calculus */}
            <Metric label="Logic" value={logic.toFixed(2)} />
            <Metric label="Style" value={style.toFixed(2)} />
            <Metric label="Intel" value={intel.toFixed(2)} />
            <Metric label="Sovereignty" value={(sovereignty * 100).toFixed(0) + '%'} />

            {/* Architectural Pulse */}
            <Metric label="Stability" value={stability.toFixed(2)} color={stability < 0.3 ? '#ff4d4d' : '#fff'} />
            <Metric label="Coupling" value={coupling.toFixed(2)} color={coupling > 0.8 ? '#ff4d4d' : '#fff'} />
            <Metric label="Gravity" value={gravity.toFixed(0)} />
            <Metric label="Anomaly" value={anomaly.toFixed(2)} color={anomaly > 5 ? '#ff4d4d' : '#fff'} />
            
            {/* Base Stats */}
            <Metric label="LOC" value={node.loc || 0} />
            <Metric label="Complexity" value={node.complexity || 0} color={(node.complexity || 0) > 20 ? '#ff4d4d' : '#fff'} />
        </div>
    );
};

const Metric: React.FC<{ label: string, value: string | number, color?: string, bold?: boolean }> = ({ label, value, color = '#fff', bold }) => (
    <div>
        <label style={{ display: 'block', color: '#aaa', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</label>
        <span style={{ color, fontWeight: bold ? 'bold' : 'normal', fontSize: '0.9rem' }}>{value}</span>
    </div>
);
