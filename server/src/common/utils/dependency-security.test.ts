import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const undiciPaths = [require.resolve('undici'), createRequire(require.resolve('cheerio')).resolve('undici')];

describe('HTTP response handling', () => {
  it.each(undiciPaths)('survives excessive content encodings with %s', async (undiciPath) => {
    const { stdout } = await run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import { createServer } from 'node:http';
          import { createRequire } from 'node:module';
          import assert from 'node:assert/strict';
          const { fetch } = createRequire(import.meta.url)(${JSON.stringify(undiciPath)});
          const server = createServer((req, res) => {
            if (req.url === '/ok') { res.end('ok'); return; }
            const encoding = req.url === '/mixed'
              ? 'gzip, deflate, br, gzip, deflate, br'
              : 'gzip, gzip, gzip, gzip, gzip, gzip';
            res.writeHead(200, { 'content-encoding': encoding, 'content-length': '100' });
            res.flushHeaders();
            res.socket.end();
          });
          await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
          const base = 'http://127.0.0.1:' + server.address().port;
          try {
            for (const path of ['/gzip', '/mixed']) {
              await assert.rejects(fetch(base + path));
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.equal(await (await fetch(base + '/ok')).text(), 'ok');
            console.log('survived');
          } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
          }
        `,
      ],
      { timeout: 5000 },
    );
    expect(stdout.trim()).toBe('survived');
  });
});

describe('bounded collection validation', () => {
  it.each(['array', 'set', 'map'] as const)('rejects oversized %s before validating elements', (kind) => {
    let calls = 0;
    const element = z.string().superRefine(() => {
      calls++;
    });
    const values = Array.from({ length: 20 }, (_, index) => String(index));
    const schema = kind === 'array' ? z.array(element).max(2) : kind === 'set' ? z.set(element).max(2) : z.map(z.string(), element).max(2);
    const collection = kind === 'array' ? values : kind === 'set' ? new Set(values) : new Map(values.map((value) => [value, value]));
    expect(schema.safeParse(collection).success).toBe(false);
    expect(calls).toBe(0);
    const valid = kind === 'array' ? ['ok'] : kind === 'set' ? new Set(['ok']) : new Map([['key', 'ok']]);
    expect(schema.safeParse(valid).success).toBe(true);
    expect(calls).toBe(1);
  });
});
