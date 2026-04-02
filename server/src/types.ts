export interface Pause {
  start: string;       // ISO 8601
  end?: string;        // ISO 8601, absent while pause is open
  comment?: string;
}

export interface SessionRow {
  id: number;
  date: string;        // YYYY-MM-DD
  clock_in: string;    // ISO 8601
  clock_out: string | null;
  duration_secs: number;
  pauses: string;      // raw JSON string from SQLite
  created_at: string;
}
