import type { DayId } from './types';

export const DAYS: { id: DayId; name: string; lastPeriod: number }[] = [
  { id: 1, name: 'Senin', lastPeriod: 9 },
  { id: 2, name: 'Selasa', lastPeriod: 9 },
  { id: 3, name: 'Rabu', lastPeriod: 9 },
  // Kamis: KBM sampai jam ke-8 (14.00); jam 9 (14.00-15.00) diisi Ekskul Wajib.
  { id: 4, name: 'Kamis', lastPeriod: 8 },
  { id: 5, name: 'Jumat', lastPeriod: 9 },
];

export const dayName = (day: DayId) => DAYS.find((d) => d.id === day)!.name;
export const lastPeriodOf = (day: DayId) => DAYS.find((d) => d.id === day)!.lastPeriod;

export interface PeriodDef {
  period: number;
  start: string;
  end: string;
}

export const PERIODS: PeriodDef[] = [
  { period: 1, start: '07.15', end: '08.00' },
  { period: 2, start: '08.00', end: '08.45' },
  { period: 3, start: '08.45', end: '09.30' },
  { period: 4, start: '09.50', end: '10.35' },
  { period: 5, start: '10.35', end: '11.20' },
  { period: 6, start: '11.20', end: '12.00' },
  { period: 7, start: '12.50', end: '13.35' },
  { period: 8, start: '13.35', end: '14.20' },
  { period: 9, start: '14.20', end: '15.00' },
];

export const periodLabel = (period: number) => {
  const p = PERIODS.find((x) => x.period === period)!;
  return `${p.start} - ${p.end}`;
};

/** Kamis: jam 7-9 digeser agar Ekskul Wajib mulai tepat 14.20. */
export const THURSDAY_PERIOD_TIMES: Record<number, { start: string; end: string }> = {
  7: { start: '12.50', end: '13.25' },
  8: { start: '13.25', end: '14.00' },
  9: { start: '14.20', end: '15.00' },
};
 
export const periodLabelFor = (day: DayId, period: number) => {
  const t = day === 4 ? THURSDAY_PERIOD_TIMES[period] : undefined;
  return t ? `${t.start} - ${t.end}` : periodLabel(period);
};

/** Non-teaching bands rendered inside the grid for print-ready output. */
export const BREAKS: { afterPeriod: number; label: string; time: string }[] = [
  { afterPeriod: 0, label: 'Mindful Morning / Upacara / Keagamaan', time: '07.00 - 07.15' },
  { afterPeriod: 3, label: 'Istirahat 1', time: '09.30 - 09.50' },
  { afterPeriod: 6, label: 'Relaksasi Total', time: '12.00 - 12.25' },
  { afterPeriod: 6, label: 'Istirahat 2', time: '12.25 - 12.50' },
];

/** Periods that finish before 12.00 (dipakai aturan PJOK). */
export const MORNING_PERIODS = [1, 2, 3, 4, 5, 6];

/** Hari yang diizinkan untuk PJOK: Senin, Selasa, Rabu. */
export const PJOK_DAYS: DayId[] = [1, 2, 3];

/** Ketersediaan guru Bahasa Mandarin (manual fixed window). */
export const MANDARIN_WINDOW: Record<DayId, number[]> = {
  1: [6, 7, 8, 9],
  2: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  3: [6, 7, 8, 9],
  4: [6, 7, 8],
  5: [4, 5, 6, 7, 8, 9],
};

/** Blok kelas industri (jurusan RPL): kelas -> hari penuh industri. */
export const INDUSTRI_BLOCKS: Record<string, DayId[]> = {
  'X RPL': [1, 2],
  'XI RPL': [3, 4],
  'XII RPL': [5],
};

/** Guru persiapan Sholat Jumat: hindari mengajar Jumat 11.00 - 12.00 (jam ke-5 & 6). */
export const JUMAT_SHOLAT_TEACHERS = ['Sultan', 'Deny', 'Dicky'];
export const JUMAT_SHOLAT_PERIODS = [5, 6];

export const MANDARIN_SUBJECT = 'Bahasa Mandarin';
export const PJOK_SUBJECTS = ['PJOK', 'OR', 'Olahraga'];
export const INDUSTRI_TEACHER = 'Industri';
/** Mapel yang mengisi blok Kelas Industri. */
export const INDUSTRI_SUBJECTS = ['Pengembangan Perangkat Lunak dan Gim', 'PPLG'];
/** Mapel yang hanya dijadwalkan manual — Auto-Randomizer tidak menyentuhnya. */
export const MANUAL_SUBJECTS = ['PPLG'];

/** Kelas gabungan PJOK yang tersedia (alokasi 2 JP menjadi 3 JP, slot sejajar). */
export const PJOK_MERGE_GROUPS: { id: string; subject: string; classNames: string[]; jp: number }[] = [
  // PJOK gabungan hanya bisa Senin-Rabu jam 1-6; X AK + X RPL otomatis jatuh di
  // Rabu karena Senin-Selasa adalah blok industri X RPL.
  { id: 'MERGE-PJOK-10', subject: 'PJOK', classNames: ['X AK', 'X RPL'], jp: 3 },
  { id: 'MERGE-PJOK-11DKV', subject: 'PJOK', classNames: ['XI DKV 1', 'XI DKV 2'], jp: 3 },
];

export const PJOK_MERGE_SETTING_KEY = 'jadwal-smk-tri-ratna:pjok-merge:v1';

/** Saklar Gabungan PJOK — dibaca sekali saat aplikasi dimuat (default: mati). */
export const isPjokMergeEnabled = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem(PJOK_MERGE_SETTING_KEY) === 'on';

/** Kelas gabungan aktif. */
export const MERGED_GROUPS: { id: string; subject: string; classNames: string[]; jp: number }[] =
  isPjokMergeEnabled() ? PJOK_MERGE_GROUPS : [];

/** Kamis jam 14.00-15.00: Kegiatan Ekskul Wajib untuk seluruh kelas (jam ke-9). */
export const EKSKUL_DAY: DayId = 4;
export const EKSKUL_PERIODS = [9];
export const EKSKUL_LABEL = 'KEGIATAN EKSKUL WAJIB';

export const isEkskulSlot = (day: DayId, period: number) =>
  day === EKSKUL_DAY && EKSKUL_PERIODS.includes(period);

export const CLASS_ROOMS: { className: string; room: string }[] = [
  { className: 'X AK', room: 'Ruang 2' },
  { className: 'XI AK', room: 'Lab Akuntansi' },
  { className: 'XII AK', room: 'Ruang 3' },
  { className: 'X DKV', room: 'Ruang 1' },
  { className: 'XI DKV 1', room: 'Ruang 4' },
  { className: 'XI DKV 2', room: 'Ruang 5' },
  { className: 'XII DKV', room: 'Ruang 6' },
  { className: 'X RPL', room: 'Ruko L2' },
  { className: 'XI RPL', room: 'Ruko L3' },
  { className: 'XII RPL', room: 'Ruko L1' },
];
