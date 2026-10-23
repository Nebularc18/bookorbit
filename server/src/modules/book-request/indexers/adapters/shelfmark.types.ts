export interface ShelfmarkRelease {
  source: string;
  source_id: string;
  title: string;
  format?: string;
  language?: string;
  author?: string;
  content_type?: string;
  size_bytes?: number;
  download_url?: string;
  info_url?: string;
  protocol?: string;
  extra?: Record<string, unknown>;
}

export interface ShelfmarkTask {
  id: string;
  source: string;
  progress?: number;
  format?: string;
  download_path?: string;
  status_message?: string;
}

export type ShelfmarkStatus = Record<string, Record<string, ShelfmarkTask>>;
