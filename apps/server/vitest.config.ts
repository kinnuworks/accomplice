import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'node:path';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    pool: "forks",
    env: {
      MODEL_PROVIDER: 'mock', TTS_PROVIDER: 'none', TRANSLATE: 'off', SPEECH_WAIT: '0', ENGINE: process.env.TEST_ENGINE ?? 'stub',
      STT_PROVIDER: 'none', TUTORIAL: 'off', AUTO_ADVANCE_MS: '0', WELCOME_BATCH_MS: '5', HEARTBEAT_MS: '1000', LOG_LEVEL: 'silent', CACHE_DIR: path.join(os.tmpdir(), 'accomplice-test-cache'),
    },
  },
});
