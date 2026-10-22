// Public surface of @accomplice/server for other packages (the MCP server, tests, scripts).
export { buildServer } from './server.js';
export { createGameApi, type GameApi, type SuspectInfo, type BoardView, type AccuseResult } from './game-api.js';
export { Hub } from './hub.js';
export { Room, GameError } from './room.js';
export { loadEngine, type Engine } from './engine.js';
export { getModel, setModel, type TextModel, type CompleteRequest } from './models.js';
export { speak } from './tts.js';
