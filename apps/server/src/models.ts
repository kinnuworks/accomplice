// Text model providers behind one small interface. Swap with MODEL_PROVIDER=anthropic|bedrock|mock.
import { cfg } from './config.js';

export interface CompleteRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  json?: boolean;
  /** 'fast' uses the smaller model (claim extraction). */
  tier?: 'main' | 'fast';
}
export interface TextModel {
  kind: 'anthropic' | 'bedrock' | 'mock';
  complete(req: CompleteRequest): Promise<string>;
  /** Optional streaming: calls onText with each text delta, resolves with the full text. Abortable. */
  stream?(req: CompleteRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string>;
}

class AnthropicModel implements TextModel {
  kind = 'anthropic' as const;
  private client: any;
  private async c() {
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ maxRetries: 1, timeout: 20_000, logLevel: 'error' });
    }
    return this.client;
  }
  private params(req: CompleteRequest): Record<string, unknown> {
    const model = req.tier === 'fast' ? cfg.anthropicFastModel : cfg.anthropicModel;
    const params: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? 200,
      // The system prompt is the same for every question to a suspect, so cache it.
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: [...req.messages],
    };
    // Newer models think by default; keep replies snappy. Older 4.x models reject effort, so only send it to 5.x.
    if (/-(sonnet|opus|haiku|fable)-5(-\d+)?$/.test(model)) params.output_config = { effort: 'low' };
    return params;
  }
  async complete(req: CompleteRequest): Promise<string> {
    const client = await this.c();
    const res = await client.messages.create(this.params(req));
    return res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  }
  async stream(req: CompleteRequest, onText: (d: string) => void, signal: AbortSignal): Promise<string> {
    const client = await this.c();
    const stream = client.messages.stream(this.params(req));
    const abort = () => stream.abort();
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    let text = '';
    stream.on('text', (d: string) => { text += d; onText(d); });
    try { await stream.finalMessage(); } catch (e) { if (!signal.aborted) throw e; }
    finally { signal.removeEventListener('abort', abort); }
    return text;
  }
}

class BedrockModel implements TextModel {
  kind = 'bedrock' as const;
  private client: any;
  private cmd: any;
  async complete(req: CompleteRequest): Promise<string> {
    if (!this.client) {
      const m = await import('@aws-sdk/client-bedrock-runtime');
      this.client = new m.BedrockRuntimeClient({ region: cfg.awsRegion });
      this.cmd = m.ConverseCommand;
    }
    const msgs = req.messages.map((m) => ({ role: m.role, content: [{ text: m.content }] }));
    const res = await this.client.send(new this.cmd({
      modelId: req.tier === 'fast' ? cfg.bedrockFastModel : cfg.bedrockModel,
      system: [{ text: req.system }],
      messages: msgs,
      inferenceConfig: { maxTokens: req.maxTokens ?? 200 },
    }));
    const text = (res.output?.message?.content ?? []).map((b: any) => b.text ?? '').join('');
    return text;
  }
}

/** Offline model. The suspect pipeline uses its own slice-aware mock replies; this answers generic calls. */
class MockModel implements TextModel {
  kind = 'mock' as const;
  async complete(req: CompleteRequest): Promise<string> {
    if (req.json) return '{"claims":[]}';
    return 'I would rather not say, and I say that with great politeness.';
  }
}

let model: TextModel | null = null;
export function getModel(): TextModel {
  if (model) return model;
  model = cfg.modelProvider === 'anthropic' ? new AnthropicModel() : cfg.modelProvider === 'bedrock' ? new BedrockModel() : new MockModel();
  return model;
}
export function setModel(m: TextModel) { model = m; }
