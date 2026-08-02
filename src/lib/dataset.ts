import { RAW_TEACHERS } from '../data/pembagianTugas';
import { CLASS_ROOMS, MERGED_GROUPS } from './constants';
import type { Load, SchoolClass, Subject, Teacher } from './types';

export interface Dataset {
  teachers: Teacher[];
  classes: SchoolClass[];
  subjects: Subject[];
  loads: Load[];
}

function buildDataset(): Dataset {
  const classes: SchoolClass[] = CLASS_ROOMS.map((c, i) => ({ id: i + 1, ...c }));
  const classByName = new Map(classes.map((c) => [c.className, c]));

  const subjects: Subject[] = [];
  const subjectByName = new Map<string, Subject>();
  const subjectJp = new Map<string, number[]>();

  const teachers: Teacher[] = [];
  const loads: Load[] = [];

  RAW_TEACHERS.forEach((raw, ti) => {
    const teacher: Teacher = { id: ti + 1, name: raw.name, status: raw.status, subjectIds: [] };
    teachers.push(teacher);

    raw.assignments.forEach((a) => {
      let subject = subjectByName.get(a.subject);
      if (!subject) {
        subject = { id: subjects.length + 1, name: a.subject, defaultJp: a.jp };
        subjects.push(subject);
        subjectByName.set(a.subject, subject);
      }
      subjectJp.set(a.subject, [...(subjectJp.get(a.subject) ?? []), a.jp]);
      if (!teacher.subjectIds.includes(subject.id)) teacher.subjectIds.push(subject.id);

      const klass = classByName.get(a.className);
      if (!klass) return;

      const merge = MERGED_GROUPS.find(
        (g) => g.subject === a.subject && g.classNames.includes(a.className),
      );
      loads.push({
        id: `L${loads.length + 1}`,
        classId: klass.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        // Kelas gabungan: alokasi 2 JP berubah menjadi 3 JP.
        jp: merge ? merge.jp : a.jp,
        mergeGroupId: merge?.id,
      });
    });
  });

  // defaultJp = alokasi JP yang paling sering muncul untuk mapel tersebut.
  subjects.forEach((s) => {
    const values = subjectJp.get(s.name) ?? [s.defaultJp];
    const counts = new Map<number, number>();
    values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    s.defaultJp = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  });

  return { teachers, classes, subjects, loads };
}

export const DATASET = buildDataset();

export const teacherById = new Map(DATASET.teachers.map((t) => [t.id, t]));
export const classById = new Map(DATASET.classes.map((c) => [c.id, c]));
export const subjectById = new Map(DATASET.subjects.map((s) => [s.id, s]));
export const loadById = new Map(DATASET.loads.map((l) => [l.id, l]));

export const teacherName = (id: number) => teacherById.get(id)?.name ?? '?';
export const className = (id: number) => classById.get(id)?.className ?? '?';
export const subjectName = (id: number) => subjectById.get(id)?.name ?? '?';

/** Nama pendek guru untuk tampilan grid (2 kata pertama). */
export const shortTeacherName = (id: number) =>
  teacherName(id).split(',')[0].split(' ').slice(0, 2).join(' ');
