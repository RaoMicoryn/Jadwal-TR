import ExcelJS from 'exceljs';
import {
  BREAKS,
  DAYS,
  EKSKUL_DAY,
  EKSKUL_LABEL,
  EKSKUL_PERIODS,
  PERIODS,
  periodLabelFor,
} from './constants';
import { DATASET, shortTeacherName, subjectName } from './dataset';
import type { DayId, ScheduleEntry } from './types';

function buildGridRows(entries: ScheduleEntry[]) {
  const rows: (string | number)[][] = [];
  const header = ['Hari', 'Jam Ke', 'Waktu', ...DATASET.classes.map((c) => `${c.className} (${c.room})`)];
  rows.push(header);
  DAYS.forEach((d) => {
    PERIODS.forEach((p) => {
      if (p.period > d.lastPeriod && !(d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period)))
        return;
      const row: (string | number)[] = [d.name, p.period, periodLabelFor(d.id, p.period)];
      DATASET.classes.forEach((c) => {
        if (d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period)) {
          row.push(EKSKUL_LABEL);
          return;
        }
        const e = entries.find((x) => x.classId === c.id && x.day === d.id && x.period === p.period);
        row.push(e ? `${subjectName(e.subjectId)} — ${shortTeacherName(e.teacherId)}` : '');
      });
      rows.push(row);
    });
  });
  return rows;
}

export function exportCsv(entries: ScheduleEntry[]) {
  const rows = buildGridRows(entries);
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, 'jadwal.csv');
}

/** Baris untuk sheet "Jadwal" — mengikuti struktur grid tampilan (termasuk band istirahat). */
type CellInfo = { text: string; subjectId?: number; isEkskul?: boolean };
type ExcelRow =
  | { kind: 'break'; label: string; time: string }
  | {
      kind: 'data';
      day: DayId;
      period: number;
      waktu: string;
      isFirstOfDay: boolean;
      cells: (CellInfo | null)[];
    };

function buildScheduleRows(entries: ScheduleEntry[]): ExcelRow[] {
  const rows: ExcelRow[] = [];
  DAYS.forEach((d) => {
    const dayPeriods = PERIODS.filter(
      (p) => p.period <= d.lastPeriod || (d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period)),
    );
    dayPeriods.forEach((p, idx) => {
      const bands = BREAKS.filter((b) => b.afterPeriod === p.period - 1 && idx > 0);
      bands.forEach((b) => rows.push({ kind: 'break', label: b.label, time: b.time }));

      const isEkskul = d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period);
      const cells: (CellInfo | null)[] = DATASET.classes.map((c) => {
        if (isEkskul) return { text: EKSKUL_LABEL, isEkskul: true };
        const e = entries.find((x) => x.classId === c.id && x.day === d.id && x.period === p.period);
        return e
          ? { text: `${subjectName(e.subjectId)}\n${shortTeacherName(e.teacherId)}`, subjectId: e.subjectId }
          : null;
      });
      rows.push({
        kind: 'data',
        day: d.id,
        period: p.period,
        waktu: periodLabelFor(d.id, p.period),
        isFirstOfDay: idx === 0,
        cells,
      });
    });
  });
  return rows;
}

const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
};

// Palet warna per mapel — mengikuti SUBJECT_COLORS di ScheduleGrid.tsx (sky, emerald,
// amber, violet, rose, teal, orange, indigo, lime, fuchsia) supaya warna di Excel
// SAMA dan sevariatif tampilan grid di aplikasi, bukan cuma putih polos.
const SUBJECT_FILLS = [
  'FFE0F2FE', // sky-100
  'FFD1FAE5', // emerald-100
  'FFFEF3C7', // amber-100
  'FFEDE9FE', // violet-100
  'FFFFE4E6', // rose-100
  'FFCCFBF1', // teal-100
  'FFFFEDD5', // orange-100
  'FFE0E7FF', // indigo-100
  'FFECFCCB', // lime-100
  'FFFAE8FF', // fuchsia-100
];
const EKSKUL_FILL = 'FFFFFBEB'; // yellow-50, senada dengan sel Ekskul Wajib di grid

const subjectFill = (subjectId: number) => SUBJECT_FILLS[subjectId % SUBJECT_FILLS.length];

// Rata-rata jumlah karakter yang muat dalam satu baris untuk lebar kolom kelas (26 wch).
// Dipakai untuk MENGHITUNG tinggi baris secara eksplisit — wrapText tanpa row height
// yang cukup adalah penyebab teks mapel (mis. "Pengembangan Perangkat Lunak dan Gim")
// terlihat terpotong di Excel.
const CHARS_PER_LINE = 22;
const LINE_HEIGHT_PT = 13;
const ROW_PADDING_PT = 8;
const MIN_ROW_HEIGHT_PT = 26;
const MAX_ROW_HEIGHT_PT = 80;

function estimateWrappedLines(text: string) {
  return text
    .split('\n')
    .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / CHARS_PER_LINE)), 0);
}

export async function exportExcel(entries: ScheduleEntry[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jadwal SMK';
  wb.created = new Date();

  const classCols = DATASET.classes.length;
  const totalCols = 3 + classCols;

  const sheet = wb.addWorksheet('Jadwal', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  sheet.columns = [
    { width: 8 },
    { width: 7 },
    { width: 14 },
    ...DATASET.classes.map(() => ({ width: 26 })),
  ];

  // Judul
  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = 'JADWAL PELAJARAN';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  sheet.getRow(1).height = 26;

  // Subjudul
  sheet.mergeCells(2, 1, 2, totalCols);
  const subtitleCell = sheet.getCell(2, 1);
  const dateStr = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  subtitleCell.value = `Digenerate ${dateStr} · ${DATASET.classes.length} kelas`;
  subtitleCell.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
  subtitleCell.alignment = { horizontal: 'center' };
  sheet.getRow(2).height = 14;

  // Header
  const HEADER_ROW = 3;
  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.getCell(1).value = 'Hari';
  headerRow.getCell(2).value = 'Jam Ke';
  headerRow.getCell(3).value = 'Waktu';
  DATASET.classes.forEach((c, i) => {
    headerRow.getCell(4 + i).value = `${c.className} (${c.room})`;
  });
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 28;

  const rowsModel = buildScheduleRows(entries);
  let excelRow = HEADER_ROW;
  let dayMergeStart: number | null = null;

  const flushDayMerge = (endRow: number) => {
    if (dayMergeStart !== null && endRow > dayMergeStart) {
      sheet.mergeCells(dayMergeStart, 1, endRow, 1);
      const cell = sheet.getCell(dayMergeStart, 1);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    }
  };

  rowsModel.forEach((r) => {
    excelRow += 1;
    const row = sheet.getRow(excelRow);

    if (r.kind === 'break') {
      sheet.mergeCells(excelRow, 2, excelRow, totalCols);
      const cell = row.getCell(2);
      cell.value = `${r.time} — ${r.label}`;
      cell.font = { italic: true, size: 8.5, color: { argb: 'FF64748B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      row.height = 15;
      return;
    }

    if (r.isFirstOfDay) {
      flushDayMerge(excelRow - 1);
      dayMergeStart = excelRow;
    }

    row.getCell(1).value = DAYS.find((d) => d.id === r.day)!.name;
    row.getCell(2).value = r.period;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).value = r.waktu;
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(1).border = THIN_BORDER;
    row.getCell(2).border = THIN_BORDER;
    row.getCell(3).border = THIN_BORDER;

    let maxLines = 1;
    r.cells.forEach((info, i) => {
      const cell = row.getCell(4 + i);
      cell.border = THIN_BORDER;
      if (info) {
        cell.value = info.text;
        cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
        maxLines = Math.max(maxLines, estimateWrappedLines(info.text));
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: info.isEkskul ? EKSKUL_FILL : subjectFill(info.subjectId ?? 0) },
        };
        if (info.isEkskul) cell.font = { bold: true, size: 8.5, color: { argb: 'FFA16207' } };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    // Tinggi baris DIHITUNG dari jumlah baris teks terpanjang di baris ini — ini yang
    // memastikan teks yang di-wrap (mis. "Pengembangan Perangkat Lunak dan Gim
    // Industri") tidak lagi kepotong di bagian bawah.
    row.height = Math.min(
      MAX_ROW_HEIGHT_PT,
      Math.max(MIN_ROW_HEIGHT_PT, maxLines * LINE_HEIGHT_PT + ROW_PADDING_PT),
    );
  });
  flushDayMerge(excelRow);

  // Sheet "Detail" — daftar datar, satu baris per entri jadwal.
  const detail = wb.addWorksheet('Detail');
  detail.columns = [
    { header: 'Kelas', key: 'kelas', width: 12 },
    { header: 'Hari', key: 'hari', width: 10 },
    { header: 'Jam Ke', key: 'jamKe', width: 8 },
    { header: 'Waktu', key: 'waktu', width: 14 },
    { header: 'Mata Pelajaran', key: 'mapel', width: 34 },
    { header: 'Guru', key: 'guru', width: 22 },
    { header: 'Dikunci', key: 'pin', width: 9 },
  ];
  detail.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle' };
  });
  entries
    .slice()
    .sort((a, b) => a.classId - b.classId || a.day - b.day || a.period - b.period)
    .forEach((e) => {
      detail.addRow({
        kelas: DATASET.classes.find((c) => c.id === e.classId)?.className,
        hari: DAYS.find((d) => d.id === e.day)?.name,
        jamKe: e.period,
        waktu: periodLabelFor(e.day, e.period),
        mapel: subjectName(e.subjectId),
        guru: DATASET.teachers.find((t) => t.id === e.teacherId)?.name,
        pin: e.pinned ? 'Ya' : '',
      });
    });
  detail.eachRow((row) => row.eachCell((cell) => (cell.border = THIN_BORDER)));

  const out = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'jadwal.xlsx',
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
