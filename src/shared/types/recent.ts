/** Recent types — entry + list data. */
export type RecentKind = "project" | "image";

export interface RecentEntry {
  kind: RecentKind;
  path: string;
  name: string;
  ts: number;
}

export interface RecentsData {
  projects: RecentEntry[];
  images: RecentEntry[];
}
