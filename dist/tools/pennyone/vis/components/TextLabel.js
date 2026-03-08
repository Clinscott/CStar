import { jsx as _jsx } from "react/jsx-runtime";
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
/**
 * 🏷️ TEXT LABEL
 * Renders the filename above the node.
 */
export const TextLabel = ({ node }) => {
    const textRef = useRef(null);
    useFrame(() => {
        if (!textRef.current || !node)
            return;
        textRef.current.position.set((node.x || 0), (node.y || 0) + 25, (node.z || 0));
    });
    if (!node?.path)
        return null;
    const filename = node.path.split(/[\/\\]/).pop() || '';
    return (_jsx(Text, { ref: textRef, color: "#ffffff", fontSize: 8, maxWidth: 200, lineHeight: 1, letterSpacing: 0.02, textAlign: "center", anchorX: "center", anchorY: "middle", raycast: () => null, outlineWidth: 0.5, outlineColor: "#000000", children: filename }));
};
