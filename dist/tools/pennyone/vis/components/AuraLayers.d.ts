import React from 'react';
import * as THREE from 'three';
import { ThreeElement } from '@react-three/fiber';
import { Node } from '../types/index.js';
declare const GungnirAuraMaterial: typeof THREE.ShaderMaterial & {
    key: string;
};
declare module '@react-three/fiber' {
    interface ThreeElements {
        gungnirAuraMaterial: ThreeElement<typeof GungnirAuraMaterial>;
    }
}
export declare const FresnelAura: React.FC<{
    node: Node;
}>;
export declare const SelectionHighlight: React.FC<{
    node: Node;
}>;
export {};
