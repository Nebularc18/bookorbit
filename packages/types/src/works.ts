export interface WorkEdition {
  bookId: number;
  title: string | null;
  language: string | null;
  narrators: string[];
  files: { id: number; format: string }[];
}
export interface WorkCatalogItem {
  key: string;
  workId: number | null;
  title: string;
  editions: WorkEdition[];
}
export interface WorkCatalogPage {
  items: WorkCatalogItem[];
  hasMore: boolean;
}
