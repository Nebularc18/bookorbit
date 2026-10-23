import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { IndexerTestResult } from '@bookorbit/types';
import { readBoundedText } from '../../../../common/utils/bounded-response';
import { safeFetch } from '../../../../common/utils/safe-fetch';
import { ensureSafeUrl } from '../../../../common/utils/ssrf.utils';
import { sanitizeLogValue } from '../../../../common/utils/log-sanitize.utils';
import { endpointUrl } from '../../download-clients/adapters/client-http.utils';
import {
  IndexerSearchException,
  type IndexerAdapter,
  type ReleaseCandidate,
  type ReleaseQuery,
  type ResolvedIndexerConfig,
} from '../indexer-adapter';
import type { ShelfmarkRelease, ShelfmarkStatus } from './shelfmark.types';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_RELEASES = 100;
const API_TIMEOUT_MS = 30_000;

@Injectable()
export class ShelfmarkAdapter implements IndexerAdapter {
  readonly type = 'shelfmark' as const;
  readonly label = 'Shelfmark';
  readonly mediaKinds = ['ebook', 'audiobook'] as const;
  readonly supportsIsbnSearch = false;
  readonly requiresCredential = true;
  private readonly logger = new Logger(ShelfmarkAdapter.name);

  async search(query: ReleaseQuery, config: ResolvedIndexerConfig, signal: AbortSignal): Promise<ReleaseCandidate[]> {
    const params = new URLSearchParams({ provider: 'manual', book_id: 'bookorbit', title: query.title, content_type: query.mediaKind });
    if (query.author) params.set('author', query.author);
    if (query.language) params.set('languages', query.language);
    const result = await this.call<{ releases?: unknown[] }>(config, `/api/releases?${params}`, {}, signal);
    if (!Array.isArray(result.releases)) throw new IndexerSearchException('error', 'Shelfmark returned an invalid release list');
    return result.releases.slice(0, Math.min(query.limit, MAX_RELEASES)).flatMap((value) => {
      const release = parseShelfmarkRelease(value, query.mediaKind);
      if (!release) return [];
      return [
        {
          indexerId: config.id,
          guid: shelfmarkKey(config.id, release.source, release.source_id),
          title: release.title,
          sizeBytes: release.size_bytes ?? null,
          seeders: null,
          leechers: null,
          format: release.format,
          language: release.language,
          author: release.author,
          infoUrl: release.info_url,
          shelfmark: release,
        },
      ];
    });
  }

  async test(config: ResolvedIndexerConfig): Promise<IndexerTestResult> {
    try {
      await this.status(config);
      return { success: true, indexerName: 'Shelfmark' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not connect to Shelfmark' };
    }
  }

  async status(config: ResolvedIndexerConfig): Promise<ShelfmarkStatus> {
    const status = await this.call<ShelfmarkStatus>(config, '/api/status');
    if (!status.queued || !status.complete || Object.values(status).some((tasks) => !tasks || typeof tasks !== 'object' || Array.isArray(tasks)))
      throw new IndexerSearchException('error', 'Shelfmark returned an invalid queue status');
    return status;
  }

  async queue(config: ResolvedIndexerConfig, release: ShelfmarkRelease): Promise<void> {
    const result = await this.call<{ status?: string }>(config, '/api/releases/download', { method: 'POST', body: JSON.stringify(release) });
    if (result.status !== 'queued') throw new IndexerSearchException('error', 'Shelfmark did not accept the download');
  }

  async cancel(config: ResolvedIndexerConfig, sourceId: string): Promise<void> {
    await this.call(config, `/api/download/${encodeURIComponent(sourceId)}/cancel`, { method: 'DELETE' });
  }

  fileUrl(config: ResolvedIndexerConfig, sourceId: string): string {
    return endpointUrl(new URL(config.baseUrl), `/api/localdownload?${new URLSearchParams({ id: sourceId })}`).href;
  }

  private async call<T>(config: ResolvedIndexerConfig, path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const startedAt = Date.now();
    const operation = init.method ?? 'GET';
    if (path !== '/api/status') this.logger.log(`[shelfmark.api] [start] indexerId=${config.id} method=${operation} - Shelfmark API call started`);
    try {
      if (!config.credential) throw new IndexerSearchException('unauthorized', 'Set the Shelfmark API key in this source');
      const url = await ensureSafeUrl(endpointUrl(new URL(config.baseUrl), path).href, { allowPrivate: config.allowPrivateAddress });
      const response = await safeFetch(
        url.href,
        {
          ...init,
          redirect: 'manual',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)]) : AbortSignal.timeout(API_TIMEOUT_MS),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Api-Key': config.credential },
        },
        { allowPrivate: config.allowPrivateAddress, profile: config.networkProfile, pinResolvedAddress: true },
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const failure =
          response.status === 401 || response.status === 403
            ? 'unauthorized'
            : response.status === 429
              ? 'throttled'
              : response.status >= 500
                ? 'unreachable'
                : 'error';
        throw new IndexerSearchException(failure, `Shelfmark answered HTTP ${response.status}. Check its address, API key and configured sources.`);
      }
      const body = await readBoundedText(response, MAX_RESPONSE_BYTES);
      const value = JSON.parse(body) as T;
      if (!value || typeof value !== 'object') throw new IndexerSearchException('error', 'Shelfmark returned an invalid response');
      if (path !== '/api/status')
        this.logger.log(
          `[shelfmark.api] [end] indexerId=${config.id} method=${operation} durationMs=${Date.now() - startedAt} - Shelfmark API call completed`,
        );
      return value;
    } catch (error) {
      // Network exceptions can contain a credentialed proxy URL, so expose only our own errors.
      const failure =
        error instanceof IndexerSearchException
          ? error
          : new IndexerSearchException(signal?.aborted ? 'timeout' : 'unreachable', 'Could not read the Shelfmark API response');
      this.logger.warn(
        `[shelfmark.api] [fail] indexerId=${config.id} method=${operation} durationMs=${Date.now() - startedAt} errorClass=${failure.name} error="${sanitizeLogValue(failure.message)}" - Shelfmark API call failed`,
      );
      throw failure;
    }
  }
}

export function shelfmarkKey(indexerId: number, source: string, sourceId: string): string {
  return createHash('sha256')
    .update(JSON.stringify(['shelfmark', indexerId, source, sourceId]))
    .digest('hex');
}

function parseShelfmarkRelease(value: unknown, mediaKind: string): ShelfmarkRelease | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const text = (key: string, max = 500): string | undefined => (typeof row[key] === 'string' ? row[key].slice(0, max) : undefined);
  const source = text('source', 100);
  const sourceId = text('source_id', 4096);
  const title = text('title');
  if (!source || !sourceId || !title || (typeof row.source_id === 'string' && row.source_id.length > 4096)) return null;
  const extra = row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra) ? (row.extra as Record<string, unknown>) : undefined;
  if (extra && JSON.stringify(extra).length > 16384) return null;
  return {
    source,
    source_id: sourceId,
    title,
    format: text('format', 20)?.toLowerCase(),
    language: text('language', 20),
    author: text('author') ?? (typeof extra?.author === 'string' ? extra.author.slice(0, 500) : undefined),
    content_type: mediaKind,
    size_bytes: typeof row.size_bytes === 'number' && Number.isSafeInteger(row.size_bytes) && row.size_bytes >= 0 ? row.size_bytes : undefined,
    download_url: text('download_url', 8192),
    info_url: text('info_url', 4096),
    protocol: text('protocol', 20),
    extra,
  };
}
