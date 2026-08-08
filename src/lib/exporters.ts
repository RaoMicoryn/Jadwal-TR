import ExcelJS from 'exceljs';
import { BREAKS, DAYS, EKSKUL_DAY, EKSKUL_LABEL, EKSKUL_PERIODS, PERIODS, periodLabelFor } from './constants';
import { DATASET, shortTeacherName, subjectName } from './dataset';
import type { ScheduleEntry } from './types';

function buildGridRows(entries: ScheduleEntry[]) {
  const rows: (string | number)[][] = [];
  const classCols = DATASET.classes.map((c) => `${c.className} (${c.room})`);
  const header = ['Hari', 'Jam Ke', 'Waktu', ...classCols];
  rows.push(header);
  DAYS.forEach((d) => {
    const dayPeriods = PERIODS.filter(
      (p) => p.period <= d.lastPeriod || (d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period)),
    );
    dayPeriods.forEach((p, idx) => {
      // Sisipkan baris istirahat/jeda persis seperti di grid aplikasi.
      if (idx > 0) {
        BREAKS.filter((b) => b.afterPeriod === p.period - 1).forEach((b) => {
          rows.push(['', '', `${b.time} — ${b.label}`, ...classCols.map(() => '')]);
        });
      }
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

/** Aksen warna per hari — dipakai untuk kolom "Hari" yang digabung (merge) secara vertikal. */
const DAY_COLORS: Record<number, { fill: string; text: string }> = {
  1: { fill: 'FFDCE6FF', text: 'FF1D4ED8' }, // Senin - biru
  2: { fill: 'FFDCFCE7', text: 'FF15803D' }, // Selasa - hijau
  3: { fill: 'FFFEF3C7', text: 'FFB45309' }, // Rabu - kuning
  4: { fill: 'FFEDE9FE', text: 'FF6D28D9' }, // Kamis - ungu
  5: { fill: 'FFFFE4E6', text: 'FFBE123C' }, // Jumat - merah muda
};

const HEADER_FILL = 'FF1E293B';
const TITLE_FILL = 'FF1E3A8A';
const EKSKUL_FILL = 'FFDC2626';
const PINNED_FILL = 'FFFEF9C3';
const EMPTY_FILL = 'FFF8FAFC';
const BORDER_COLOR = 'FFE2E8F0';

function thinBorder(color = BORDER_COLOR): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

export async function exportExcel(entries: ScheduleEntry[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jadwal SMK';
  wb.created = new Date();

  // ── Sheet 1: Jadwal (grid utama, bergaya) ──────────────────────────────
  const classCols = DATASET.classes.map((c) => `${c.className} (${c.room})`);
  const totalCols = 3 + classCols.length;

  const sheet = wb.addWorksheet('Jadwal', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 3, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  // Baris judul
  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = 'JADWAL PELAJARAN';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
  sheet.getRow(1).height = 28;

  // Baris subjudul (tanggal generate)
  sheet.mergeCells(2, 1, 2, totalCols);
  const subCell = sheet.getCell(2, 1);
  const generatedAt = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  subCell.value = `Digenerate ${generatedAt} · ${DATASET.classes.length} kelas`;
  subCell.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sheet.getRow(2).height = 18;

  // Baris header
  const headerRowIndex = 3;
  const header = ['Hari', 'Jam Ke', 'Waktu', ...classCols];
  const headerRow = sheet.getRow(headerRowIndex);
  header.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = thinBorder('FF334155');
  });
  headerRow.height = 32;

  // Baris data, dikelompokkan per hari dengan kolom "Hari" digabung + diwarnai
  let r = headerRowIndex + 1;
  DAYS.forEach((d) => {
    const dayColor = DAY_COLORS[d.id];
    const periodsForDay = PERIODS.filter(
      (p) => p.period <= d.lastPeriod || (d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period)),
    );
    const startRow = r;

    periodsForDay.forEach((p, idx) => {
      // Sisipkan baris istirahat/jeda (mis. Istirahat 1, Relaksasi Total) sebelum periode ini,
      // persis seperti yang tampil di grid aplikasi.
      if (idx > 0) {
        BREAKS.filter((b) => b.afterPeriod === p.period - 1).forEach((b) => {
          sheet.mergeCells(r, 2, r, totalCols);
          const breakRow = sheet.getRow(r);
          const cell = breakRow.getCell(2);
          cell.value = `${b.time} — ${b.label}`;
          cell.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          for (let cc = 1; cc <= totalCols; cc++) {
            sheet.getCell(r, cc).border = thinBorder();
          }
          breakRow.height = 16;
          r += 1;
        });
      }

      const row = sheet.getRow(r);
      const isEkskul = d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period);

      const jamCell = row.getCell(2);
      jamCell.value = p.period;
      jamCell.alignment = { horizontal: 'center', vertical: 'middle' };
      jamCell.border = thinBorder();
      jamCell.font = { size: 10, color: { argb: 'FF475569' } };

      const waktuCell = row.getCell(3);
      waktuCell.value = periodLabelFor(d.id, p.period);
      waktuCell.alignment = { horizontal: 'center', vertical: 'middle' };
      waktuCell.border = thinBorder();
      waktuCell.font = { size: 10, color: { argb: 'FF475569' } };

      if (isEkskul) {
        sheet.mergeCells(r, 4, r, totalCols);
        const cell = row.getCell(4);
        cell.value = EKSKUL_LABEL;
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EKSKUL_FILL } };
        cell.border = thinBorder();
      } else {
        DATASET.classes.forEach((c, ci) => {
          const cell = row.getCell(4 + ci);
          const e = entries.find((x) => x.classId === c.id && x.day === d.id && x.period === p.period);
          cell.value = e ? `${subjectName(e.subjectId)}\n${shortTeacherName(e.teacherId)}` : '';
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = thinBorder();
          cell.font = {
            size: 10,
            bold: !!e,
            color: { argb: e ? 'FF0F172A' : 'FFCBD5E1' },
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: e ? (e.pinned ? PINNED_FILL : 'FFFFFFFF') : EMPTY_FILL },
          };
        });
      }
      row.height = 30;
      r += 1;
    });

    // Gabung + warnai kolom "Hari" untuk seluruh blok hari ini
    sheet.mergeCells(startRow, 1, r - 1, 1);
    const dayCell = sheet.getCell(startRow, 1);
    dayCell.value = d.name;
    dayCell.font = { bold: true, size: 12, color: { argb: dayColor.text } };
    dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dayColor.fill } };
    for (let rr = startRow; rr < r; rr++) {
      sheet.getCell(rr, 1).border = thinBorder();
    }
  });

  sheet.columns = [{ width: 10 }, { width: 8 }, { width: 15 }, ...classCols.map(() => ({ width: 24 }))];

  // ── Sheet 2: Detail (daftar flat, bisa difilter/diurutkan) ─────────────
  const detail = wb.addWorksheet('Detail', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const detailHeader = ['Kelas', 'Hari', 'Jam Ke', 'Waktu', 'Mata Pelajaran', 'Guru', 'Dikunci'];
  const detailHeaderRow = detail.addRow(detailHeader);
  detailHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder('FF334155');
  });
  detailHeaderRow.height = 22;

  const sorted = entries
    .slice()
    .sort((a, b) => a.classId - b.classId || a.day - b.day || a.period - b.period);

  sorted.forEach((e, idx) => {
    const row = detail.addRow([
      DATASET.classes.find((c) => c.id === e.classId)?.className,
      DAYS.find((d) => d.id === e.day)?.name,
      e.period,
      periodLabelFor(e.day, e.period),
      subjectName(e.subjectId),
      DATASET.teachers.find((t) => t.id === e.teacherId)?.name,
      e.pinned ? 'Ya' : '',
    ]);
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder();
      cell.alignment = { horizontal: colNumber >= 5 ? 'left' : 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : EMPTY_FILL },
      };
      if (colNumber === 7 && cell.value === 'Ya') {
        cell.font = { bold: true, color: { argb: 'FFB45309' } };
      }
    });
  });

  detail.columns = [
    { width: 14 },
    { width: 10 },
    { width: 8 },
    { width: 14 },
    { width: 30 },
    { width: 26 },
    { width: 10 },
  ];
  detail.autoFilter = { from: 'A1', to: 'G1' };

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
