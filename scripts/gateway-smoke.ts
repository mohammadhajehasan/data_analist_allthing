/**
 * Focused integration check for the Respan Gateway wiring.
 *
 * It starts a local OpenAI-compatible fixture provider (no provider key, no
 * outbound network), points the gateway at it with a throwaway config, then runs
 * the exact function the app's AI routes use — tryGatewayChat() from
 * server/respanGateway.ts — so the request really travels
 * app code → gateway → provider → back through the gateway.
 *
 * Run: npm run gateway:smoke
 */
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getGatewayStatus, stopGateway, tryGatewayChat } from '../server/respanGateway';

interface RecordedRequest {
  method: string;
  path: string;
  authorization: string;
  body: any;
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) resolve(address.port);
      else reject(new Error('fixture provider did not report a port'));
    });
  });
}

/** A minimal OpenAI-compatible provider that echoes the prompt back. */
function createFixtureProvider() {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ method: req.method || 'GET', path: req.url || '', authorization: req.headers.authorization || '', body });

      if ((req.method || 'GET') === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'fixture-chat', object: 'model', owned_by: 'fixture' }] }));
        return;
      }

      const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
      const lastUser = [...messages].reverse().find((m) => m?.role === 'user')?.content ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: String(body.model || 'fixture-chat'),
        choices: [{ index: 0, message: { role: 'assistant', content: `fixture-echo: ${lastUser}` }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }));
    });
  });
  return { server, requests };
}

async function main() {
  const failures: string[] = [];
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures.push(label);
  };

  const fixture = createFixtureProvider();
  const fixturePort = await listen(fixture.server);
  const configDir = mkdtempSync(path.join(os.tmpdir(), 'respan-gateway-smoke-'));
  const configPath = path.join(configDir, 'gateway.toml');
  writeFileSync(configPath, [
    '# throwaway config for scripts/gateway-smoke.ts',
    'ui = false',
    'log = "off"',
    '',
    '[providers.local]',
    'formats = ["openai-chat"]',
    `base_url = "http://127.0.0.1:${fixturePort}/v1"`,
    '',
  ].join('\n'), 'utf8');
  console.log(`fixture provider: http://127.0.0.1:${fixturePort}/v1`);

  // Force the local sidecar and ignore any external gateway configured in the shell.
  process.env.RESPAN_GATEWAY_ENABLED = 'true';
  process.env.RESPAN_GATEWAY_CONFIG = configPath;
  delete process.env.RESPAN_GATEWAY_URL;
  delete process.env.RESPAN_GATEWAY_PORT;

  try {
    const result = await tryGatewayChat({
      model: 'local/fixture-chat',
      prompt: 'hello through the gateway',
      systemInstruction: 'You are the smoke-test fixture.',
      maxTokens: 64,
      timeoutMs: 60_000,
    });

    const status = getGatewayStatus();
    check(Boolean(status.url), `gateway started on loopback (${status.url || 'no url'})`);
    check(Boolean(result), 'gateway returned a completion through the app code path');
    check(result?.text === 'fixture-echo: hello through the gateway', `completion text round-tripped (${JSON.stringify(result?.text)})`);
    check(Boolean(result?.modelUsed?.startsWith('respan-gateway:')), `model used is reported as routed (${result?.modelUsed})`);
    // The gateway probes the provider's model list at start; only chat calls count.
    const chatCalls = fixture.requests.filter((r) => r.method === 'POST' && r.path === '/v1/chat/completions');
    check(chatCalls.length === 1, `provider saw exactly one chat completion (saw ${chatCalls.length} of ${fixture.requests.length} requests)`);

    const forwarded = chatCalls[0];
    check(Boolean(forwarded?.body?.model), `model reached the provider (${forwarded?.body?.model})`);
    check(forwarded?.body?.messages?.[0]?.role === 'system' && forwarded?.body?.messages?.[1]?.content === 'hello through the gateway',
      'system instruction and prompt were forwarded in order');
  } finally {
    stopGateway();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
    rmSync(configDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll gateway checks passed.');
}

main().catch((err) => {
  stopGateway();
  console.error(`gateway smoke test error: ${err?.stack || err}`);
  process.exit(1);
});
