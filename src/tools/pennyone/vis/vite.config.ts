import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    root: 'src/tools/pennyone/vis',
    server: {
        port: 3000,
        proxy: {
            '/api': 'http://localhost:4000',
            '/ws': {
                target: 'ws://localhost:4000',
                ws: true
            }
        }
    },
    build: {
        outDir: '../../../../dist/pennyone-vis',
        emptyOutDir: true
    }
});
