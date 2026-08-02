// Menghasilkan db/seed.sql dari data 'Pembagian Tugas' (src/data/pembagianTugas.ts).
// Jalankan: npx tsx scripts/generateSeed.ts
import { writeFileSync } from 'node:fs';
import { DATASET } from '../src/lib/dataset';

const esc = (s: string) => s.replaceAll("'", "''");

const lines: string[] = [
  '-- Seed data dari sheet "Pembagian Tugas" — Jadwal SMK TR.xlsx (TP 2026-2027).',
  '-- File ini dihasilkan otomatis oleh scripts/generateSeed.ts. Jangan diedit manual.',
  '',
  'TRUNCATE TABLE schedules, teaching_loads, teachers, classes, subjects CASCADE;',
  '',
];

lines.push('INSERT INTO classes (id, class_name, room) VALUES');
lines.push(
  DATASET.classes.map((c) => `  (${c.id}, '${esc(c.className)}', '${esc(c.room)}')`).join(',\n') + ';',
  '',
);

lines.push('INSERT INTO subjects (id, name, default_jp) VALUES');
lines.push(
  DATASET.subjects.map((s) => `  (${s.id}, '${esc(s.name)}', ${s.defaultJp})`).join(',\n') + ';',
  '',
);

lines.push('INSERT INTO teachers (id, name, status, subject_ids) VALUES');
lines.push(
  DATASET.teachers
    .map((t) => `  (${t.id}, '${esc(t.name)}', '${esc(t.status)}', '${JSON.stringify(t.subjectIds)}')`)
    .join(',\n') + ';',
  '',
);

lines.push('INSERT INTO teaching_loads (class_id, subject_id, teacher_id, jp, merge_group_id) VALUES');
lines.push(
  DATASET.loads
    .map(
      (l) =>
        `  (${l.classId}, ${l.subjectId}, ${l.teacherId}, ${l.jp}, ${
          l.mergeGroupId ? `'${l.mergeGroupId}'` : 'NULL'
        })`,
    )
    .join(',\n') + ';',
  '',
);

writeFileSync(new URL('../db/seed.sql', import.meta.url), lines.join('\n'));
console.log('db/seed.sql ditulis:', DATASET.teachers.length, 'guru,', DATASET.subjects.length, 'mapel,', DATASET.loads.length, 'beban mengajar.');
