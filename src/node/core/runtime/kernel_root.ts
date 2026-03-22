import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const RUNTIME_KERNEL_ROOT = path.resolve(__dirname, '../../../../');
