import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..', '..');
loadEnv({ path: path.join(SERVER_ROOT, '.env'), quiet: true } as never);

const env = process.env;
const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const cfg = {
  port: num(env.PORT, 8787),
  host: env.HOST ?? '0.0.0.0',
  publicUrl: env.PUBLIC_URL ?? '',
  cacheDir: path.resolve(env.CACHE_DIR ?? path.join(SERVER_ROOT, '.cache')),
  get audioDir() { return path.join(this.cacheDir, 'audio'); },
  get auditFile() { return path.join(this.cacheDir, 'audit.jsonl'); },
  modelProvider: (env.MODEL_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock')) as 'anthropic' | 'bedrock' | 'mock',
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  anthropicFastModel: env.ANTHROPIC_FAST_MODEL ?? 'claude-haiku-5-5',
  bedrockModel: env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  bedrockFastModel: env.BEDROCK_FAST_MODEL_ID ?? env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  awsRegion: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'us-east-1',
  /** Re-check every finished reply with a model-based claim extractor in the background (logged, never blocks). */
  secondPassAudit: (env.SECOND_PASS_AUDIT ?? 'on') !== 'off',
  ttsProvider: (env.TTS_PROVIDER ?? 'polly') as 'polly' | 'none',
  /** polly | elevenlabs. ElevenLabs reads ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID; every line is cached on disk. */
  narratorProvider: (env.NARRATOR_PROVIDER ?? 'polly') as 'polly' | 'elevenlabs',
  narratorVoice: env.NARRATOR_VOICE ?? 'Brian',
  sttProvider: (env.STT_PROVIDER ?? 'transcribe') as 'transcribe' | 'none',
  translate: (env.TRANSLATE ?? 'on') !== 'off',
  engine: (env.ENGINE ?? 'auto') as 'auto' | 'stub' | 'fairplay',
  minPlayers: num(env.MIN_PLAYERS, 1),
  maxPlayers: num(env.MAX_PLAYERS, 6),
  questionsPerRound: num(env.QUESTIONS_PER_ROUND, 2),
  /** Multiplier on the estimated audio length the queue waits for before the next answer (0 = do not wait). */
  speechWait: num(env.SPEECH_WAIT, 1),
  /** Soft timer shown on screens; it never ends a phase by itself. 0 = no timer. */
  roundSeconds: num(env.ROUND_SECONDS, 240),
  /** After everyone has used their questions and the room is quiet, wait this long then move on. 0 = off. */
  autoAdvanceMs: num(env.AUTO_ADVANCE_MS, 8000),
  moreTimeSeconds: num(env.MORE_TIME_SECONDS, 60),
  /** Cold open with a free practice question before round one. */
  tutorial: (env.TUTORIAL ?? 'on') !== 'off',
  difficulty: num(env.DIFFICULTY, 2) as 1 | 2 | 3,
};

/** True when the given env var is set (never returns the value). */
export const hasEnv = (k: string) => !!env[k];
