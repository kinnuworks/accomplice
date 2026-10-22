// @accomplice/host-agent: the house host, a Strands agent that runs Accomplice through its MCP server.
export { HostAgents, DEFAULT_HOST_MODEL, speakable } from './host.ts';
export type { HostEvent, HostAgentOptions, PublicOrigin } from './host.ts';
export { createHostHandler } from './http.ts';
export type { HostHandlerOptions, HostHttpHandler } from './http.ts';
export { SYSTEM_PROMPT, HOST_PERSONA } from './prompt.ts';
export { CapturingTransport } from './capture.ts';
