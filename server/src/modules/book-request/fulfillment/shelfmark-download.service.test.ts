import { Test } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storageConfig } from '../../../config/config';
import type { BookRequestDownloadRow } from '../../../db/schema';
import { IndexerConfigService } from '../indexers/indexer-config.service';
import { ShelfmarkAdapter, shelfmarkKey } from '../indexers/adapters/shelfmark.adapter';
import type { ResolvedIndexerConfig } from '../indexers/indexer-adapter';
import type { ShelfmarkRelease, ShelfmarkStatus } from '../indexers/adapters/shelfmark.types';
import { BookRequestDownloadRepository } from './book-request-download.repository';
import { DirectDownloadService } from './direct-download.service';
import { ShelfmarkDownloadService } from './shelfmark-download.service';

const release: ShelfmarkRelease = { source: 'direct_download', source_id: 'remote-id', title: 'A Book', format: 'epub', language: 'sv' };
const key = shelfmarkKey(3, release.source, release.source_id);
const row = {
  id: 11,
  indexerId: 3,
  source: 'shelfmark',
  clientKey: key,
  releaseSizeBytes: 4,
  releaseFormat: 'epub',
  remoteDownload: { source: release.source, sourceId: release.source_id },
} as BookRequestDownloadRow;

describe('Shelfmark API and download integration', () => {
  let server: Server;
  let directory: string;
  let config: ResolvedIndexerConfig;
  let service: ShelfmarkDownloadService;
  let adapter: ShelfmarkAdapter;
  let direct: DirectDownloadService;
  let remote: ShelfmarkStatus;
  let received: Array<{ method: string; url: string; body: string }>;
  let contentType: string;
  let statusCode: number;
  let redirectFile: boolean;
  let findDownload: ReturnType<typeof vi.fn<(id: number) => Promise<BookRequestDownloadRow | undefined>>>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'bookorbit-shelfmark-'));
    remote = { queued: {}, downloading: {}, complete: {}, error: {}, cancelled: {} };
    received = [];
    contentType = 'application/epub+zip';
    statusCode = 200;
    redirectFile = false;
    findDownload = vi.fn<(id: number) => Promise<BookRequestDownloadRow | undefined>>().mockResolvedValue({ ...row, status: 'downloading' });
    server = createServer((request, response) => {
      void (async () => {
        let body = '';
        for await (const chunk of request) body += String(chunk);
        received.push({ method: request.method!, url: request.url!, body });
        if (request.headers['x-api-key'] !== 'test-api-key') {
          response.writeHead(401).end();
          return;
        }
        if (statusCode !== 200) {
          response.writeHead(statusCode).end();
          return;
        }
        response.setHeader('content-type', 'application/json');
        if (request.url === '/shelfmark/api/status') response.end(JSON.stringify(remote));
        else if (request.url?.startsWith('/shelfmark/api/releases?')) response.end(JSON.stringify({ releases: [release] }));
        else if (request.url === '/shelfmark/api/releases/download') {
          remote.queued[release.source_id] = { id: release.source_id, source: release.source, progress: 0 };
          response.end(JSON.stringify({ status: 'queued' }));
        } else if (request.url?.startsWith('/shelfmark/api/localdownload?')) {
          if (redirectFile) {
            response.writeHead(302, { Location: '/shelfmark/leak' }).end();
            return;
          }
          response.setHeader('content-type', contentType);
          response.end('book');
        } else if (request.url?.endsWith('/cancel')) {
          response.end(JSON.stringify({ status: 'cancelled' }));
        } else response.writeHead(404).end();
      })().catch(() => response.writeHead(500).end());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start');
    config = {
      id: 3,
      managerId: null,
      managerPriority: null,
      name: 'Shelfmark',
      color: null,
      adapterType: 'shelfmark',
      baseUrl: `http://127.0.0.1:${address.port}/shelfmark`,
      credential: 'test-api-key',
      credentialError: null,
      allowPrivateAddress: true,
      applyTrackerSeedGoals: false,
      seedRatioGoal: null,
      seedTimeMinutes: null,
      categories: { ebook: [], audiobook: [] },
      disabledMediaKinds: [],
      isbnSearchDisabled: false,
      settings: null,
      networkProfile: null,
      perIndexerTimeoutSeconds: 30,
      overallSearchBudgetSeconds: null,
      autoExpandCategories: false,
    };
    const module = await Test.createTestingModule({
      providers: [
        ShelfmarkDownloadService,
        ShelfmarkAdapter,
        DirectDownloadService,
        { provide: IndexerConfigService, useValue: { resolveConfig: vi.fn(() => Promise.resolve(config)) } },
        {
          provide: BookRequestDownloadRepository,
          useValue: { update: vi.fn().mockResolvedValue(undefined), findById: findDownload },
        },
        { provide: storageConfig.KEY, useValue: { appDataPath: directory } },
      ],
    }).compile();
    service = module.get(ShelfmarkDownloadService);
    adapter = module.get(ShelfmarkAdapter);
    direct = module.get(DirectDownloadService);
  });

  afterEach(async () => {
    await direct?.remove(key, { deleteFiles: true });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });

  it('searches with title, author and language under the configured subpath', async () => {
    const candidates = await adapter.search(
      { title: 'A Book', author: 'An Author', mediaKind: 'ebook', language: 'sv', isbn13: null, isbn13s: [], limit: 50 },
      config,
      AbortSignal.timeout(5000),
    );
    expect(candidates).toMatchObject([{ indexerId: 3, guid: key, language: 'sv', shelfmark: release }]);
    const url = new URL(received[0]!.url, config.baseUrl);
    expect(url.searchParams.get('provider')).toBe('manual');
    expect(url.searchParams.get('title')).toBe('A Book');
    expect(url.searchParams.get('author')).toBe('An Author');
    expect(url.searchParams.get('languages')).toBe('sv');
  });

  it('queues once, maps remote progress, then streams the finished file into BookOrbit', async () => {
    await service.add(3, release);
    expect(received.find((item) => item.method === 'POST')?.body).toBe(JSON.stringify(release));
    expect((await service.status(3, [row]))[0]?.state).toBe('queued');
    remote.queued = {};
    remote.downloading[release.source_id] = { id: release.source_id, source: release.source, progress: 0.5 };
    expect((await service.status(3, [row]))[0]?.progressPercent).toBe(45);
    remote.downloading = {};
    remote.complete[release.source_id] = {
      id: release.source_id,
      source: release.source,
      format: 'azw3',
      download_path: '/books/converted.epub',
      progress: 1,
    };
    const [copying] = await service.status(3, [row]);
    expect(copying?.state).toBe('downloading');
    expect(copying?.contentPath).toBeNull();
    const completed = await vi.waitFor(async () => {
      const [item] = await service.status(3, [row]);
      expect(item?.state).toBe('completed');
      return item!;
    });
    expect(completed.contentPath).toBe(join(directory, 'request-downloads', key, 'download.epub'));
    expect(await readFile(completed.contentPath!, 'utf8')).toBe('book');
    expect(received.filter((item) => item.url.startsWith('/shelfmark/api/localdownload?'))).toHaveLength(1);
  });

  it('retains the ZIP extension when Shelfmark bundles audiobook chapters', async () => {
    contentType = 'application/zip';
    remote.complete[release.source_id] = { id: release.source_id, source: release.source, format: 'mp3', progress: 1 };
    await service.status(3, [row]);
    await vi.waitFor(async () => {
      const [item] = await service.status(3, [row]);
      expect(item?.state).toBe('completed');
      expect(item?.contentPath).toMatch(/\.zip$/);
    });
  });

  it('does not start copying a stale attempt that was cancelled during the remote poll', async () => {
    remote.complete[release.source_id] = { id: release.source_id, source: release.source, format: 'epub' };
    findDownload.mockResolvedValue({ ...row, status: 'failed' });
    expect(await service.status(3, [row])).toHaveLength(1);
    expect(received.some((item) => item.url.includes('localdownload'))).toBe(false);
  });

  it('never forwards the API key through a completed-file redirect', async () => {
    redirectFile = true;
    remote.complete[release.source_id] = { id: release.source_id, source: release.source, format: 'epub' };
    await service.status(3, [row]);
    await vi.waitFor(async () => {
      const [item] = await service.status(3, [row]);
      expect(item?.state).toBe('failed');
    });
    expect(received.some((item) => item.url.includes('/leak'))).toBe(false);
  });

  it('refuses a task from another source with the same remote ID', async () => {
    remote.complete[release.source_id] = { id: release.source_id, source: 'another-source', format: 'epub' };
    await expect(service.status(3, [row])).rejects.toThrow('different source');
    expect(received.some((item) => item.url.includes('localdownload'))).toBe(false);
  });

  it('refuses an existing active job, and reuses an already completed file without requeueing', async () => {
    remote.queued[release.source_id] = { id: release.source_id, source: release.source };
    await expect(service.add(3, release)).rejects.toThrow('already in Shelfmark');
    remote.queued = {};
    remote.complete[release.source_id] = { id: release.source_id, source: release.source };
    await service.add(3, release);
    expect(received.some((item) => item.method === 'POST')).toBe(false);
  });

  it('cancels only the matching active task', async () => {
    remote.queued[release.source_id] = { id: release.source_id, source: release.source };
    await service.remove(row);
    expect(received.some((item) => item.method === 'DELETE' && item.url === '/shelfmark/api/download/remote-id/cancel')).toBe(true);
  });

  it('reports authentication failures without exposing the API key', async () => {
    statusCode = 401;
    const result = await adapter.test(config);
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 401');
    expect(JSON.stringify(result)).not.toContain(config.credential);
  });

  it('keeps the private network opt-in on both searches and file transfers', async () => {
    config.allowPrivateAddress = false;
    const result = await adapter.test(config);
    expect(result.success).toBe(false);
    expect(received).toHaveLength(0);
  });
});
