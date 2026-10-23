import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import type { BookRequestDownloadRow } from '../../../db/schema';
import { BOOK_FORMATS } from '@bookorbit/types';
import type { DownloadStatus } from '../download-clients/download-client-adapter';
import type { ResolvedIndexerConfig } from '../indexers/indexer-adapter';
import { IndexerConfigService } from '../indexers/indexer-config.service';
import { ShelfmarkAdapter, shelfmarkKey } from '../indexers/adapters/shelfmark.adapter';
import type { ShelfmarkRelease, ShelfmarkTask } from '../indexers/adapters/shelfmark.types';
import { BookRequestDownloadRepository } from './book-request-download.repository';
import { DirectDownloadService } from './direct-download.service';

@Injectable()
export class ShelfmarkDownloadService {
  private readonly copyingKeys = new Set<string>();
  private readonly startingKeys = new Set<string>();
  private readonly cancelledStarts = new Set<string>();
  private readonly maxCopies = 2;
  constructor(
    private readonly indexers: IndexerConfigService,
    private readonly shelfmark: ShelfmarkAdapter,
    private readonly direct: DirectDownloadService,
    private readonly downloads: BookRequestDownloadRepository,
  ) {}

  async add(indexerId: number, release: ShelfmarkRelease): Promise<void> {
    const config = await this.config(indexerId);
    const clientKey = shelfmarkKey(indexerId, release.source, release.source_id);
    await this.direct.remove(clientKey, { deleteFiles: true });
    this.copyingKeys.delete(clientKey);
    const status = await this.shelfmark.status(config);
    for (const [state, tasks] of Object.entries(status)) {
      // Shelfmark identifies jobs by source_id, even across different sources.
      const task = tasks[release.source_id];
      if (task?.source === release.source && state === 'complete') return;
      if (task && !['error', 'cancelled'].includes(state))
        throw new BadRequestException('This release is already in Shelfmark. Finish or dismiss that download before trying again.');
    }
    await this.shelfmark.queue(config, release);
  }

  async status(indexerId: number, rows: BookRequestDownloadRow[]): Promise<DownloadStatus[]> {
    const config = await this.config(indexerId);
    const local = new Map(
      (await this.direct.status([...new Set([...this.copyingKeys, ...rows.flatMap((row) => (row.clientKey ? [row.clientKey] : []))])])).map(
        (item) => [item.clientKey, item],
      ),
    );
    for (const key of this.copyingKeys) {
      const transfer = local.get(key);
      if (!this.startingKeys.has(key) && (!transfer || transfer.state === 'completed' || transfer.state === 'failed')) this.copyingKeys.delete(key);
    }
    const remote = rows.some((row) => row.clientKey && !local.has(row.clientKey)) ? await this.shelfmark.status(config) : {};
    const result: DownloadStatus[] = [];
    for (const row of rows) {
      if (!row.clientKey || !row.remoteDownload) continue;
      const staged = local.get(row.clientKey);
      if (staged) {
        result.push({ ...staged, progressPercent: staged.state === 'completed' ? 100 : 90 + Math.floor(staged.progressPercent / 10) });
        continue;
      }
      const identity = row.remoteDownload;
      if (row.clientKey !== shelfmarkKey(indexerId, identity.source, identity.sourceId))
        throw new BadRequestException('Shelfmark download identity does not match this attempt');
      for (const [state, tasks] of Object.entries(remote)) {
        const task = tasks[identity.sourceId];
        if (!task) continue;
        if (task.source !== identity.source) throw new BadRequestException('Shelfmark returned a different source for this download');
        const failed = state === 'error' || state === 'cancelled';
        if (state === 'complete') await this.startCopy(row, task, config);
        result.push({
          clientKey: row.clientKey,
          state: failed ? 'failed' : state === 'queued' || (state === 'complete' && !this.copyingKeys.has(row.clientKey)) ? 'queued' : 'downloading',
          progressPercent: state === 'complete' ? 90 : remoteProgress(task.progress),
          downloadedBytes: 0,
          totalBytes: null,
          contentPath: null,
          ...(failed
            ? { errorMessage: 'Shelfmark reported that the download failed or was cancelled. Check the source connection and try another release.' }
            : {}),
        });
        break;
      }
    }
    return result;
  }

  private async startCopy(row: BookRequestDownloadRow, task: ShelfmarkTask, config: ResolvedIndexerConfig): Promise<void> {
    if (!row.clientKey || !row.remoteDownload || this.startingKeys.has(row.clientKey) || this.copyingKeys.size >= this.maxCopies) return;
    const current = await this.downloads.findById(row.id);
    if (
      !current ||
      !['queued', 'downloading'].includes(current.status) ||
      current.clientKey !== row.clientKey ||
      this.copyingKeys.size >= this.maxCopies
    )
      return;
    this.copyingKeys.add(row.clientKey);
    this.startingKeys.add(row.clientKey);
    try {
      await this.direct.add({
        downloadId: row.id,
        clientKey: row.clientKey,
        fileUrl: this.shelfmark.fileUrl(config, row.remoteDownload.sourceId),
        fileName: stagedName(task, row.releaseFormat),
        access: {
          headers: { 'X-Api-Key': config.credential! },
          allowPrivateAddress: config.allowPrivateAddress,
          networkProfile: config.networkProfile,
        },
      });
      if (this.cancelledStarts.delete(row.clientKey)) await this.direct.remove(row.clientKey, { deleteFiles: true });
    } catch (error) {
      this.copyingKeys.delete(row.clientKey);
      throw error;
    } finally {
      this.startingKeys.delete(row.clientKey);
      this.cancelledStarts.delete(row.clientKey);
    }
  }

  async remove(download: BookRequestDownloadRow): Promise<void> {
    if (!download.clientKey) return;
    if (this.startingKeys.has(download.clientKey)) this.cancelledStarts.add(download.clientKey);
    await this.direct.remove(download.clientKey, { deleteFiles: true });
    this.copyingKeys.delete(download.clientKey);
    if (!download.remoteDownload || download.indexerId === null) return;
    const config = await this.config(download.indexerId);
    const status = await this.shelfmark.status(config);
    for (const [state, tasks] of Object.entries(status)) {
      const task = tasks[download.remoteDownload.sourceId];
      if (!task || ['complete', 'error', 'cancelled'].includes(state)) continue;
      if (task.source !== download.remoteDownload.source) throw new BadRequestException('Shelfmark returned a different source for this download');
      await this.shelfmark.cancel(config, download.remoteDownload.sourceId);
    }
  }

  private async config(indexerId: number) {
    const config = await this.indexers.resolveConfig(indexerId);
    if (config.adapterType !== 'shelfmark') throw new BadRequestException('The source for this Shelfmark download has changed');
    return config;
  }
}

function remoteProgress(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(89, Math.max(0, Math.floor(value * 90))) : 0;
}

function stagedName(task: ShelfmarkTask, releaseFormat: string | null): string {
  const format = (extname(task.download_path ?? '').slice(1) || task.format || releaseFormat || '').toLowerCase().replace(/^\./, '');
  return `download.${(BOOK_FORMATS as readonly string[]).includes(format) || ['zip', 'rar', '7z'].includes(format) ? format : 'bin'}`;
}
