import { buildServer, lanAddress } from './server.js';
import { cfg } from './config.js';
import { log } from './log.js';

const { app, hub, mcp } = await buildServer();
await app.listen({ port: cfg.port, host: cfg.host });
const lan = lanAddress();
log.info(`listening on http://localhost:${cfg.port}${lan ? ` and http://${lan}:${cfg.port}` : ''}`);
log.info(`engine=${hub.engine.source} model=${cfg.modelProvider} tts=${cfg.ttsProvider} stt=${cfg.sttProvider} region=${cfg.awsRegion} mcp=${mcp}`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void app.close().then(() => process.exit(0)); });
