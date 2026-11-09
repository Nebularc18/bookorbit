export interface WorkEdition {
  libraryId?: number;
  libraryName?: string;
  bookId: number;
  title: string | null;
  language: string | null;
  narrators: string[];
  files: { id: number; format: string }[];
  savedWorkId?: number | null;
}
export interface WorkCatalogItem {
  key: string;
  workId: number | null;
  title: string;
  editions: WorkEdition[];
  automaticallyGrouped?: boolean;
  hasMoreEditions?: boolean;
}
export interface WorkCatalogPage {
  items: WorkCatalogItem[];
  hasMore: boolean;
}

export interface LinkedUnreadEditions {
  bookIds: number[];
  automaticReadSync?: boolean;
}

export interface EditionLinkItem {
  bookId: number;
  title: string | null;
  libraryId: number;
  libraryName: string;
  language: string | null;
  formats: string[];
  workId: number | null;
}

export interface EditionLinkPage {
  items: EditionLinkItem[];
  hasMore: boolean;
}
