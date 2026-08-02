import type { ScheduleEntry } from './types';

const KEY = 'jadwal-smk-tri-ratna:v1';

export function saveLocal(entries: ScheduleEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function loadLocal(): ScheduleEntry[] | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScheduleEntry[]) : null;
  } catch {
    return null;
  }
}

export function clearLocal() {
  localStorage.removeItem(KEY);
}

const MANUAL_KEY = 'jadwal-smk-tri-ratna:manual-loads:v1';

/** Simpan daftar id beban mengajar yang di-set Manual (tidak disentuh Randomizer). */
export function saveManualLoadIds(ids: string[]) {
  localStorage.setItem(MANUAL_KEY, JSON.stringify(ids));
}

export function loadManualLoadIds(): string[] | null {
  const raw = localStorage.getItem(MANUAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/** Simpan ke MySQL lewat serverless API (opsional, aktif bila VITE_API_BASE_URL diset). */
export async function saveRemote(entries: ScheduleEntry[]) {
  const res = await fetch(`${API_BASE}/api/schedules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error(`Gagal menyimpan ke server (${res.status})`);
  return (await res.json()) as { saved: number };
}

export async function loadRemote(): Promise<ScheduleEntry[]> {
  const res = await fetch(`${API_BASE}/api/schedules`);
  if (!res.ok) throw new Error(`Gagal memuat dari server (${res.status})`);
  const data = (await res.json()) as { entries: ScheduleEntry[] };
  return data.entries;
}

export const hasRemote = () => Boolean(API_BASE);
