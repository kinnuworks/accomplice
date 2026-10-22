// Host side of the MCP Apps bridge: renders a ui:// resource in a sandboxed iframe and talks to it
// with the official AppBridge (ui/initialize, tool-input, tool-result, proxied tools/call).

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { LoggingTransport, type TrafficLog } from './mcp.ts';

export interface AppFrameHandle {
  sendInput(args: Record<string, unknown>): void;
  sendResult(result: CallToolResult): void;
}

interface Csp { connectDomains?: string[]; resourceDomains?: string[] }

interface Props {
  html: string;
  csp?: Csp;
  log: TrafficLog;
  toolName: string;
  theme: 'dark' | 'light';
  onCallTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  onReadResource: (uri: string) => Promise<ReadResourceResult>;
}

/** Enforce the resource's declared CSP inside the sandbox. */
function withCsp(html: string, csp?: Csp): string {
  const res = (csp?.resourceDomains ?? []).join(' ');
  const con = (csp?.connectDomains ?? []).join(' ');
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `img-src data: blob: ${res}`.trim(),
    `media-src data: blob: ${res}`.trim(),
    `font-src data: ${res}`.trim(),
    `connect-src ${con || "'none'"}`,
  ].join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${meta}`) : meta + html;
}

export const AppFrame = forwardRef<AppFrameHandle, Props>(function AppFrame(props, ref) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<AppBridge | null>(null);
  const ready = useRef(false);
  const queue = useRef<Array<() => void>>([]);
  const latest = useRef(props);
  latest.current = props;

  const run = (fn: () => void) => { if (ready.current) fn(); else queue.current.push(fn); };

  useImperativeHandle(ref, () => ({
    sendInput(args) { run(() => { void bridge.current?.sendToolInput({ arguments: args }); }); },
    sendResult(result) { run(() => { void bridge.current?.sendToolResult(result); }); },
  }), []);

  useEffect(() => {
    const el = iframe.current;
    if (!el?.contentWindow) return;
    ready.current = false;
    const b = new AppBridge(
      null,
      { name: 'accomplice-echo-sim', title: 'Simulated Alexa+ (Echo Show)', version: '0.1.0' },
      { serverTools: {}, serverResources: {}, logging: {} },
      {
        hostContext: {
          theme: props.theme,
          displayMode: 'fullscreen',
          availableDisplayModes: ['fullscreen'],
          containerDimensions: { width: 1280, height: 800 },
          locale: 'en-US',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          platform: 'web',
          userAgent: 'accomplice-echo-sim/0.1.0',
          deviceCapabilities: { touch: true, hover: false },
        },
      },
    );
    b.oncalltool = async (params) => latest.current.onCallTool(params.name, (params.arguments ?? {}) as Record<string, unknown>);
    b.onreadresource = async (params) => latest.current.onReadResource(params.uri);
    b.oninitialized = () => {
      ready.current = true;
      const pending = queue.current.splice(0);
      for (const fn of pending) fn();
    };
    b.onloggingmessage = (p) => console.info('[board]', p.data);
    bridge.current = b;
    const transport = new LoggingTransport(new PostMessageTransport(el.contentWindow, el.contentWindow), props.log, 'app');
    void b.connect(transport).then(() => {
      el.srcdoc = withCsp(props.html, props.csp);
    });
    return () => {
      ready.current = false;
      void b.teardownResource({}).catch(() => {}).finally(() => { void b.close().catch(() => {}); });
      bridge.current = null;
    };
    // Rebuild only when the resource itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.html]);

  // tell the board when the display switches between dark and light
  useEffect(() => {
    run(() => { void bridge.current?.sendHostContextChange({ theme: props.theme }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.theme]);

  return (
    <iframe
      ref={iframe}
      className="app-frame"
      title="Accomplice evidence board"
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
    />
  );
});
