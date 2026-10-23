export interface WorkEdition {
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
}
