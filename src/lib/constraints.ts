import {
  INDUSTRI_BLOCKS,
  INDUSTRI_SUBJECTS,
  INDUSTRI_TEACHER,
  JUMAT_SHOLAT_PERIODS,
  JUMAT_SHOLAT_TEACHERS,
  MANDARIN_SUBJECT,
  MANDARIN_WINDOW,
  MANUAL_SUBJECTS,
  MERGED_GROUPS,
  MORNING_PERIODS,
  PJOK_DAYS,
  PJOK_SUBJECTS,
  dayName,
  lastPeriodOf,
  periodLabelFor,
} from './constants';
import { DATASET, className, subjectName, teacherName } from './dataset';
import type { DayId, Load, ScheduleEntry, Violation } from './types';

export const isPjokSubject = (subjectId: number) => PJOK_SUBJECTS.includes(subjectName(subjectId));
export const isMandarinSubject = (subjectId: number) => subjectName(subjectId) === MANDARIN_SUBJECT;
export const isIndustriTeacher = (teacherId: number) => teacherName(teacherId) === INDUSTRI_TEACHER;

/** Mapel yang hanya dijadwalkan manual (tidak disentuh Auto-Randomizer). */
export const isManualSubject = (subjectId: number) =>
  MANUAL_SUBJECTS.includes(subjectName(subjectId));

/** Default beban mengajar mode Manual: mapel di MANUAL_SUBJECTS (mis. PPLG). */
export const defaultManualLoadIds = () =>
  DATASET.loads.filter((l) => isManualSubject(l.subjectId)).map((l) => l.id);

/** Mapel yang boleh mengisi blok Kelas Industri (mapel industri atau guru Industri). */
export const isIndustriLoad = (subjectId: number, teacherId: number) =>
  INDUSTRI_SUBJECTS.includes(subjectName(subjectId)) || isIndustriTeacher(teacherId);

export const isSholatTeacher = (teacherId: number) => {
  const name = teacherName(teacherId);
  return JUMAT_SHOLAT_TEACHERS.some((n) => name.includes(n));
};

/** Hari yang di-blok industri untuk sebuah kelas. */
export const industriDaysOf = (classId: number): DayId[] =>
  INDUSTRI_BLOCKS[className(classId)] ?? [];

/** True jika slot boleh dipakai oleh load ini (semua hard constraint kecuali bentrok). */
export function isSlotAllowed(load: Load, day: DayId, period: number): boolean {
  if (period > lastPeriodOf(day)) return false;

  // Blok Kelas Industri: hari blok eksklusif untuk mapel industri.
  // Mapel industri sendiri boleh juga ditempatkan di luar hari blok (mis. PPLG seharian).
  const industriDays = industriDaysOf(load.classId);
  if (
    industriDays.includes(day) &&
    !isIndustriLoad(load.subjectId, load.teacherId)
  )
    return false;

  if (isPjokSubject(load.subjectId)) {
    if (!PJOK_DAYS.includes(day)) return false;
    if (!MORNING_PERIODS.includes(period)) return false;
  }

  if (isMandarinSubject(load.subjectId) && !MANDARIN_WINDOW[day].includes(period)) return false;

  return true;
}

/** Soft constraint: guru persiapan Sholat Jumat sebaiknya tidak mengajar Jumat 11.00 - 12.00. */
export function isSoftDiscouraged(load: Load, day: DayId, period: number): boolean {
  return day === 5 && JUMAT_SHOLAT_PERIODS.includes(period) && isSholatTeacher(load.teacherId);
}

const key = (day: DayId, period: number) => `${day}-${period}`;

/** Deteksi seluruh bentrok & pelanggaran constraint pada jadwal. */
export function validateSchedule(
  entries: ScheduleEntry[],
  loads: Load[],
  manualLoadIds?: Set<string>,
): Violation[] {
  const violations: Violation[] = [];

  // 1. Bentrok guru: satu guru di dua kelas pada jam yang sama.
  const byTeacherSlot = new Map<string, ScheduleEntry[]>();
  entries.forEach((e) => {
    const k = `${e.teacherId}|${key(e.day, e.period)}`;
    byTeacherSlot.set(k, [...(byTeacherSlot.get(k) ?? []), e]);
  });
  byTeacherSlot.forEach((group) => {
    if (group.length < 2) return;
    // Kelas gabungan mengajar beberapa kelas sekaligus, bukan bentrok.
    const mergeIds = new Set(group.map((e) => e.mergeGroupId ?? ''));
    if (mergeIds.size === 1 && !mergeIds.has('')) return;
    // Entri lama/manual tanpa tanda grup: tetap dianggap gabungan bila mapel sama
    // dan seluruh kelasnya anggota satu grup gabungan.
    const subjects = new Set(group.map((e) => e.subjectId));
    if (
      subjects.size === 1 &&
      MERGED_GROUPS.some(
        (g) =>
          g.subject === subjectName(group[0].subjectId) &&
          group.every((e) => g.classNames.includes(className(e.classId))),
      )
    )
      return;
    const e0 = group[0];
    violations.push({
      id: `TC-${e0.teacherId}-${key(e0.day, e0.period)}`,
      severity: 'hard',
      code: 'TEACHER_CLASH',
      message: `Bentrok guru: ${teacherName(e0.teacherId)} mengajar ${group
        .map((e) => className(e.classId))
        .join(' & ')} pada ${dayName(e0.day)} jam ${e0.period} (${periodLabelFor(e0.day, e0.period)})`,
      entryIds: group.map((e) => e.id),
      day: e0.day,
      period: e0.period,
      classIds: group.map((e) => e.classId),
    });
  });

  // 2. Kelas terisi dua mapel di jam yang sama.
  const byClassSlot = new Map<string, ScheduleEntry[]>();
  entries.forEach((e) => {
    const k = `${e.classId}|${key(e.day, e.period)}`;
    byClassSlot.set(k, [...(byClassSlot.get(k) ?? []), e]);
  });
  byClassSlot.forEach((group) => {
    if (group.length < 2) return;
    const e0 = group[0];
    violations.push({
      id: `CD-${e0.classId}-${key(e0.day, e0.period)}`,
      severity: 'hard',
      code: 'CLASS_DOUBLE_BOOKED',
      message: `Kelas ${className(e0.classId)} terisi ${group.length} mapel (${group
        .map((e) => subjectName(e.subjectId))
        .join(', ')}) pada ${dayName(e0.day)} jam ${e0.period}`,
      entryIds: group.map((e) => e.id),
      day: e0.day,
      period: e0.period,
      classIds: [e0.classId],
    });
  });

  // 3. Constraint per entry.
  entries.forEach((e) => {
    const base = {
      entryIds: [e.id],
      day: e.day,
      period: e.period,
      classIds: [e.classId],
    };
    // KBM di luar jam KBM (mis. Kamis jam 9 yang dipakai Ekskul Wajib).
    if (e.period > lastPeriodOf(e.day))
      violations.push({
        ...base,
        id: `EK-${e.id}`,
        severity: 'hard',
        code: 'EKSKUL_SLOT',
        message: `${subjectName(e.subjectId)} ${className(e.classId)} pada ${dayName(e.day)} jam ${e.period} — slot ini bukan jam KBM (Kamis jam 9 / 14.00-15.00 = Kegiatan Ekskul Wajib)`,
      });
      
    if (isPjokSubject(e.subjectId)) {
      if (!PJOK_DAYS.includes(e.day))
        violations.push({
          ...base,
          id: `PD-${e.id}`,
          severity: 'hard',
          code: 'PJOK_DAY',
          message: `${subjectName(e.subjectId)} ${className(e.classId)} dijadwalkan hari ${dayName(
            e.day,
          )} — hanya boleh Senin, Selasa, atau Rabu`,
        });
      if (!MORNING_PERIODS.includes(e.period))
        violations.push({
          ...base,
          id: `PA-${e.id}`,
          severity: 'hard',
          code: 'PJOK_AFTERNOON',
          message: `${subjectName(e.subjectId)} ${className(e.classId)} pada jam ${e.period} (${periodLabelFor(
            e.day,
            e.period,
          )}) — harus di bawah jam 12.00`,
        });
    }

    if (isMandarinSubject(e.subjectId) && !MANDARIN_WINDOW[e.day].includes(e.period))
      violations.push({
        ...base,
        id: `MW-${e.id}`,
        severity: 'hard',
        code: 'MANDARIN_WINDOW',
        message: `Bahasa Mandarin ${className(e.classId)} di luar ketersediaan guru (${dayName(
          e.day,
        )} jam ${e.period})`,
      });

    const industriDays = industriDaysOf(e.classId);
    if (industriDays.length > 0) {
      const industri = isIndustriLoad(e.subjectId, e.teacherId);
      if (industriDays.includes(e.day) && !industri)
        violations.push({
          ...base,
          id: `IB-${e.id}`,
          severity: 'hard',
          code: 'INDUSTRI_BLOCK',
          message: `${className(e.classId)} hari ${dayName(e.day)} adalah blok Kelas Industri, tetapi terisi ${subjectName(
            e.subjectId,
          )}`,
        });

    }

    if (e.day === 5 && JUMAT_SHOLAT_PERIODS.includes(e.period) && isSholatTeacher(e.teacherId))
      violations.push({
        ...base,
        id: `JS-${e.id}`,
        severity: 'soft',
        code: 'JUMAT_SHOLAT',
        message: `${teacherName(e.teacherId)} (persiapan Sholat Jumat) mengajar ${className(
          e.classId,
        )} Jumat jam ${e.period} (${periodLabelFor(e.day, e.period)})`,
      });
  });

  // 4. Kelas gabungan harus sejajar (hari & jam sama untuk semua kelas dalam grup).
  const byMerge = new Map<string, ScheduleEntry[]>();
  entries.forEach((e) => {
    if (!e.mergeGroupId) return;
    byMerge.set(e.mergeGroupId, [...(byMerge.get(e.mergeGroupId) ?? []), e]);
  });
  byMerge.forEach((group, mergeGroupId) => {
    const classIds = [...new Set(group.map((e) => e.classId))];
    const slots = new Map<string, number>();
    group.forEach((e) => slots.set(key(e.day, e.period), (slots.get(key(e.day, e.period)) ?? 0) + 1));
    const misaligned = [...slots.entries()].filter(([, n]) => n !== classIds.length);
    if (misaligned.length > 0)
      violations.push({
        id: `MA-${mergeGroupId}`,
        severity: 'hard',
        code: 'MERGED_NOT_ALIGNED',
        message: `Kelas gabungan ${classIds.map(className).join(' + ')} tidak sejajar: slot ${misaligned
          .map(([k]) => k)
          .join(', ')} tidak terisi untuk semua kelas`,
        entryIds: group.map((e) => e.id),
        classIds,
      });
  });

  // 5. Alokasi JP belum terpenuhi (dilewati saat jadwal masih kosong).
  if (entries.length === 0) return violations;
  const placed = new Map<string, number>();
  entries.forEach((e) => {
    const k = `${e.classId}|${e.subjectId}|${e.teacherId}`;
    placed.set(k, (placed.get(k) ?? 0) + 1);
  });
  loads.forEach((l) => {
    const done = placed.get(`${l.classId}|${l.subjectId}|${l.teacherId}`) ?? 0;
    if (done < l.jp)
      violations.push({
        id: `JP-${l.id}`,
        // Beban mode Manual cukup peringatan lunak — memang diisi manual.
        severity: (manualLoadIds ? manualLoadIds.has(l.id) : isManualSubject(l.subjectId))
          ? 'soft'
          : 'hard',
        code: 'JP_UNDER_ALLOCATED',
        message: `${subjectName(l.subjectId)} — ${className(l.classId)} (${teacherName(
          l.teacherId,
        )}) baru ${done} dari ${l.jp} JP`,
        entryIds: [],
        classIds: [l.classId],
      });
  });

  return violations;
}

export const validate = (entries: ScheduleEntry[], manualLoadIds?: Set<string>) =>
  validateSchedule(entries, DATASET.loads, manualLoadIds);
