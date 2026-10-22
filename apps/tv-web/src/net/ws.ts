import type { ClientToServer, ServerToClient } from '@accomplice/protocol';
import { receive, setState, type Link } from './store';

/** Live connection to the game server with automatic reconnect. */
export function connectServer(): Link {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let pingTimer = 0;
  const outbox: ClientToServer[] = [];

  const url = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let code = '';
    try { code = sessionStorage.getItem('accomplice.room') ?? ''; } catch { /* storage may be blocked */ }
    return `${proto}://${location.host}/ws?role=tv${code ? `&room=${encodeURIComponent(code)}` : ''}`;
  };

  const open = () => {
    if (closed) return;
    ws = new WebSocket(url());
    ws.onopen = () => {
      retry = 0;
      setState({ connected: true, everConnected: true, error: null });
      while (outbox.length) ws?.send(JSON.stringify(outbox.shift()));
      clearInterval(pingTimer);
      pingTimer = window.setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ t: 'ping' })), 15000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerToClient;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.t === 'room:created' || msg.t === 'room:state') {
        const code = msg.t === 'room:created' ? msg.code : msg.state.code;
        try { sessionStorage.setItem('accomplice.room', code); } catch { /* ignore */ }
      }
      receive(msg);
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      setState({ connected: false });
      if (closed) return;
      const wait = Math.min(8000, 500 * 2 ** retry++);
      setTimeout(open, wait);
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return {
    send(msg) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
      else outbox.push(msg);
    },
    close() {
      closed = true;
      clearInterval(pingTimer);
      try { sessionStorage.removeItem('accomplice.room'); } catch { /* ignore */ }
      ws?.close();
    },
  };
}
