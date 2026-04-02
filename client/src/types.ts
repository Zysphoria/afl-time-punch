export interface Pause {
  start: string;      // ISO 8601
  end?: string;       // ISO 8601, absent for open pause
  comment?: string;
}

export interface Session {
  id: number;
  date: string;       // YYYY-MM-DD
  clock_in: string;   // ISO 8601
  clock_out: string | null;
  duration_secs: number;
  pauses: Pause[];
  created_at: string;
}

export interface Settings {
  hourly_rate: string;
}
