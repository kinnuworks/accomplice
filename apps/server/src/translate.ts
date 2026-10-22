// Optional per-player translation through Amazon Translate. Fails soft: on any error the text stays as is.
import type { Lang } from '@accomplice/protocol';
import { cfg } from './config.js';
import { log } from './log.js';

const cache = new Map<string, string>();
let client: any = null; let Cmd: any = null; let disabled = false;

export async function translate(text: string, from: Lang | 'auto', to: Lang): Promise<string> {
  if (!text || from === to || !cfg.translate || disabled) return text;
  const key = `${from}>${to}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (!client) {
      const m = await import('@aws-sdk/client-translate');
      client = new m.TranslateClient({ region: cfg.awsRegion }); Cmd = m.TranslateTextCommand;
    }
    const res = await client.send(new Cmd({ Text: text, SourceLanguageCode: from, TargetLanguageCode: to }));
    const out = res.TranslatedText ?? text;
    if (cache.size > 5000) cache.clear();
    cache.set(key, out);
    return out;
  } catch (e: any) {
    if (/Credential|UnrecognizedClient|AccessDenied/i.test(`${e?.name} ${e?.message}`)) { disabled = true; log.warn('Amazon Translate unavailable; showing English'); }
    else log.warn(`translate failed: ${e?.name ?? e}`);
    return text;
  }
}

export function cachedTranslation(text: string, from: Lang, to: Lang): string | undefined {
  return from === to ? text : cache.get(`${from}>${to}|${text}`);
}
