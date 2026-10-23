import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const E2E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(E2E, '..');
