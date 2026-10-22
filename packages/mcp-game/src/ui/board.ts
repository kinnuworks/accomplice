// The evidence board UI is authored as plain HTML next to this file and served as an MCP Apps resource.
import { readFileSync } from 'node:fs';

export const BOARD_HTML: string = readFileSync(new URL('./board.html', import.meta.url), 'utf8');
