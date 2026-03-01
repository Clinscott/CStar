import React from 'react';
import * as THREE from 'three';
export declare const NeuralGraph: React.FC<{
    data: Record<string, unknown>;
    gravityData: Record<string, number>;
    token: string;
    onNodesMapped?: (_map: Map<string, THREE.Vector3>) => void;
}>;
