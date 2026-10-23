// Developer drawer: the raw MCP traffic, so it is plain to see this is a real client talking to a real server.

import { useEffect, useRef, useState } from 'react';
import type { ConnectionInfo, TrafficEntry } from './mcp.ts';

function trim(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 240)}... (${value.length} chars)` : value;
  if (Array.isArray(value)) return value.map((v) => trim(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trim(v, depth + 1)]));
  }
  return value;
}

const LABEL: Record<string, string> = {
  initialize: 'handshake',
  'notifications/initialized': 'handshake',
  'tools/list': 'discovery',
  'resources/read': 'ui resource',
  'tools/call': 'tool call',
  'elicitation/create': 'elicitation',
  'tasks/get': 'task',
  'tasks/result': 'task',
  'notifications/tasks/status': 'task',
  'notifications/progress': 'progress',
  'host/turn': 'strands agent',
  'agent/start': 'strands agent',
  'agent/tool_call': 'strands agent',
  'agent/tool_result': 'strands agent',
  'agent/done': 'strands agent',
  'ui/initialize': 'app bridge',
  'ui/notifications/initialized': 'app bridge',
  'ui/notifications/tool-input': 'app bridge',
  'ui/notifications/tool-result': 'app bridge',
  'ui/notifications/size-changed': 'app bridge',
};

function summary(e: TrafficEntry): string {
  if (e.summary) return e.summary;
  const m = e.message as any;
  if (e.kind === 'request' && e.method === 'tools/call') return `${m.params?.name}(${JSON.stringify(m.params?.arguments ?? {})})`;
  if (e.kind === 'request' && e.method === 'elicitation/create') return m.params?.message ?? '';
  if (e.kind === 'request' && e.method === 'resources/read') return m.params?.uri ?? '';
  if (e.kind === 'response' && m.result?.structuredContent?.view) return `view: ${m.result.structuredContent.view}`;
  if (e.kind === 'response' && m.result?.task) return `task ${m.result.task.status}${m.result.task.statusMessage ? `: ${m.result.task.statusMessage}` : ''}`;
  if (e.kind === 'response' && m.result?.status) return `${m.result.status}${m.result.statusMessage ? `: ${m.result.statusMessage}` : ''}`;
  if (e.kind === 'response' && m.result?.tools) return `${m.result.tools.length} tools`;
  if (e.kind === 'response' && m.result?.protocolVersion) return `protocol ${m.result.protocolVersion}`;
  if (e.kind === 'response' && m.result?.action) return `action: ${m.result.action}`;
  if (e.kind === 'error') return m.error?.message ?? 'error';
  if (e.method === 'ui/notifications/tool-result') return `view: ${m.params?.structuredContent?.view ?? '?'}`;
  return '';
}

export function Drawer({ info, error, entries, onClose }: { info: ConnectionInfo | null; error: string | null; entries: TrafficEntry[]; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [lane, setLane] = useState<'all' | 'agent' | 'mcp' | 'app'>('all');
  const list = useRef<HTMLOListElement>(null);
  const shown = entries.filter((e) => lane === 'all' || e.lane === lane);

  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  return (
    <aside className="drawer" aria-label="Developer: MCP traffic">
      <header className="drawer-head">
        <div>
          <div className="drawer-title">MCP traffic</div>
          <div className="drawer-sub">Streamable HTTP · {info?.protocolVersion ?? '...'}</div>
        </div>
        <button className="pill small" onClick={onClose} aria-label="Close developer drawer">Close</button>
      </header>
      <dl className="facts">
        <dt>Server</dt><dd>{info ? `${info.serverTitle ?? info.serverName} (${info.serverName})` : error ? `error: ${error}` : 'connecting'}</dd>
        <dt>Session</dt><dd className="mono">{info?.sessionId ? info.sessionId.slice(0, 18) + '...' : 'none'}</dd>
        <dt>Household</dt><dd className="mono">{info?.household ?? '...'}</dd>
        <dt>Tools</dt><dd>{info?.tools.map((t) => t.name).join(', ') ?? '...'}</dd>
        <dt>Server can</dt><dd>{info ? Object.keys(info.capabilities).join(', ') : '...'}</dd>
      </dl>
      <div className="lanes" role="tablist">
        {(['all', 'agent', 'mcp', 'app'] as const).map((l) => (
          <button key={l} role="tab" aria-selected={lane === l} className={`lane ${lane === l ? 'on' : ''}`} onClick={() => setLane(l)}>
            {l === 'all' ? 'All' : l === 'agent' ? 'Strands agent' : l === 'mcp' ? 'Client ↔ server' : 'Host ↔ board'}
          </button>
        ))}
      </div>
      <ol className="traffic" ref={list}>
        {shown.map((e) => (
          <li key={e.n} className={`t ${e.kind} lane-${e.lane}`}>
            <button className="t-row" onClick={() => setOpen(open === e.n ? null : e.n)} aria-expanded={open === e.n}>
              <span className="t-dir">{e.lane === 'agent' ? (e.dir === 'out' ? '→ agent' : '← agent') : e.lane === 'mcp' ? (e.dir === 'out' ? '→ server' : '← server') : (e.dir === 'out' ? '→ board' : '← board')}</span>
              <span className="t-method">{e.method}</span>
              {LABEL[e.method] && <span className={`t-tag ${LABEL[e.method]!.replace(' ', '-')}`}>{LABEL[e.method]}</span>}
              <span className="t-kind">{e.kind}</span>
              <span className="t-sum">{summary(e)}</span>
            </button>
            {open === e.n && <pre className="t-json">{JSON.stringify(trim(e.message), null, 2)}</pre>}
          </li>
        ))}
      </ol>
    </aside>
  );
}
