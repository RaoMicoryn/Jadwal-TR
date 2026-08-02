import * as XLSX from 'xlsx';
import { DAYS, EKSKUL_DAY, EKSKUL_LABEL, EKSKUL_PERIODS, PERIODS, periodLabelFor } from './constants';
import { DATASET, shortTeacherName, subjectName } from './dataset';
import type { ScheduleEntry } from './types';

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

export function exportExcel(entries: ScheduleEntry[]) {
  const wb = XLSX.utils.book_new();
  const grid = XLSX.utils.aoa_to_sheet(buildGridRows(entries));
  grid['!cols'] = [{ wch: 8 }, { wch: 7 }, { wch: 14 }, ...DATASET.classes.map(() => ({ wch: 28 }))];
  XLSX.utils.book_append_sheet(wb, grid, 'Jadwal');

  const flat = XLSX.utils.json_to_sheet(
    entries
      .slice()
      .sort((a, b) => a.classId - b.classId || a.day - b.day || a.period - b.period)
      .map((e) => ({
        Kelas: DATASET.classes.find((c) => c.id === e.classId)?.className,
        Hari: DAYS.find((d) => d.id === e.day)?.name,
        'Jam Ke': e.period,
        Waktu: periodLabelFor(e.day, e.period),
        'Mata Pelajaran': subjectName(e.subjectId),
        Guru: DATASET.teachers.find((t) => t.id === e.teacherId)?.name,
        Dikunci: e.pinned ? 'Ya' : '',
      })),
  );
  XLSX.utils.book_append_sheet(wb, flat, 'Detail');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
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
