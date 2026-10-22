// @accomplice/mcp-game: the Accomplice add-on for voice assistants, as an MCP server over Streamable HTTP.

export { createMcpHandler, householdFromHeaders } from './handler.ts';
export type { McpHandlerOptions, McpHttpHandler } from './handler.ts';
export { buildServer, BOARD_URI, MCP_APP_MIME, SERVER_NAME, SERVER_VERSION } from './server.ts';
export { createFakeGameApi, NotFoundError, NoCaseError } from './fake.ts';
export type { FakeGameOptions } from './fake.ts';
export { bestMatch } from './match.ts';
export { fromRoomApi, isRoomGameApi } from './room-adapter.ts';
export type { RoomGameApi, RoomAdapterOptions } from './room-adapter.ts';
export { MemoryRecordStore, JsonFileRecordStore, DynamoRecordStore, recordStoreFromEnv, isoWeek, weekSeed, favouriteSuspect } from './records.ts';
export type { DetectiveRecord, RecordStore, LastCase } from './records.ts';
export type * from './types.ts';
