import type { ClientToServer, ServerToClient } from '@accomplice/protocol';

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Transport {
  send(msg: ClientToServer | { t: string; [k: string]: unknown }): void;
  close(): void;
  readonly demo: boolean;
}

export interface TransportHandlers {
  onMessage(msg: ServerToClient): void;
  onStatus(s: ConnStatus): void;
  /** Called every time the socket (re)opens, so the app can re-send phone:join. */
  onOpen(): void;
}

export function connectSocket(room: string, pid: string | undefined, h: TransportHandlers): Transport {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let ping: number | undefined;
  let retry: number | undefined;
  const queue: string[] = [];
  let currentPid = pid;

  const url = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = new URLSearchParams({ role: 'phone', room });
    if (currentPid) q.set('pid', currentPid);
    return `${proto}://${location.host}/ws?${q}`;
  };

  const open = () => {
    if (closed) return;
    h.onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
    const sock = new WebSocket(url());
    ws = sock;
    sock.onopen = () => {
      attempt = 0;
      h.onStatus('open');
      h.onOpen();
      while (queue.length) sock.send(queue.shift()!);
      window.clearInterval(ping);
      ping = window.setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('{"t":"ping"}'), 20000);
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data) as ServerToClient;
        if (msg.t === 'you:state') currentPid = msg.you.playerId;
        h.onMessage(msg);
      } catch {
        /* ignore malformed */
      }
    };
    sock.onclose = () => {
      window.clearInterval(ping);
      if (closed) return;
      attempt++;
      h.onStatus('reconnecting');
      const wait = Math.min(8000, 400 * 2 ** Math.min(attempt, 5));
      retry = window.setTimeout(open, wait);
    };
  };

  // Phones sleep and wake. Reconnect straight away when the page comes back.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && ws && ws.readyState === WebSocket.CLOSED) {
      window.clearTimeout(retry);
      attempt = 1;
      open();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  open();

  return {
    demo: false,
    send(msg) {
      const s = JSON.stringify(msg);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(s);
      else if (msg.t !== 'ping') queue.push(s);
    },
    close() {
      closed = true;
      window.clearInterval(ping);
      window.clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisible);
      ws?.close();
      h.onStatus('closed');
    },
  };
}
