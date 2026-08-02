import { DAYS, MERGED_GROUPS, lastPeriodOf } from './constants';
import { DATASET, className } from './dataset';
import {
  industriDaysOf,
  isIndustriLoad,
  isMandarinSubject,
  isManualSubject,
  isSlotAllowed,
  isSoftDiscouraged,
  validate,
} from './constraints';
import type { DayId, Load, ScheduleEntry, Violation } from './types';

interface Task {
  key: string;
  classIds: number[];
  subjectId: number;
  teacherId: number;
  jp: number;
  mergeGroupId?: string;
  representative: Load;
  /** Satu load per kelas anggota — dipakai untuk cek constraint tiap kelas. */
  members: Load[];
}

export interface GenerateResult {
  entries: ScheduleEntry[];
  violations: Violation[];
  unplacedJp: number;
  attempts: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pecah alokasi JP menjadi blok-blok berurutan (prioritas blok 3 & 2 JP). */
export function splitIntoBlocks(jp: number): number[] {
  const blocks: number[] = [];
  let rest = jp;
  while (rest > 0) {
    if (rest === 1 || rest === 2 || rest === 3) {
      blocks.push(rest);
      rest = 0;
    } else if (rest % 2 === 1) {
      blocks.push(3);
      rest -= 3;
    } else {
      blocks.push(2);
      rest -= 2;
    }
  }
  return blocks.sort((a, b) => b - a);
}

function buildTasks(loads: Load[]): Task[] {
  const tasks: Task[] = [];
  const consumed = new Set<string>();

  MERGED_GROUPS.forEach((group) => {
    const members = loads.filter(
      (l) => l.mergeGroupId === group.id && group.classNames.includes(className(l.classId)),
    );
    if (members.length === 0) return;
    members.forEach((m) => consumed.add(m.id));
    tasks.push({
      key: group.id,
      classIds: members.map((m) => m.classId),
      subjectId: members[0].subjectId,
      teacherId: members[0].teacherId,
      jp: group.jp,
      mergeGroupId: group.id,
      representative: members[0],
      members,
    });
  });

  loads.forEach((l) => {
    if (consumed.has(l.id)) return;
    tasks.push({
      key: l.id,
      classIds: [l.classId],
      subjectId: l.subjectId,
      teacherId: l.teacherId,
      jp: l.jp,
      representative: l,
      members: [l],
    });
  });

  return tasks;
}

/** Jumlah slot yang legal untuk sebuah task — dipakai untuk mengurutkan kesulitan. */
function flexibility(task: Task): number {
  let n = 0;
  DAYS.forEach((d) => {
    for (let p = 1; p <= d.lastPeriod; p++) if (isSlotAllowed(task.representative, d.id, p)) n++;
  });
  return n;
}

/** Task mapel industri untuk kelas yang punya hari blok industri. */
const isIndustriTask = (task: Task) =>
  isIndustriLoad(task.subjectId, task.teacherId) && industriDaysOf(task.classIds[0]).length > 0;

interface Occupancy {
  teacher: Set<string>;
  class: Set<string>;
  subjectDay: Set<string>;
}

const slotKey = (day: DayId, period: number) => `${day}-${period}`;

function canPlaceBlock(
  task: Task,
  day: DayId,
  start: number,
  size: number,
  occ: Occupancy,
): boolean {
  if (start + size - 1 > lastPeriodOf(day)) return false;
  for (let p = start; p < start + size; p++) {
    if (task.members.some((m) => !isSlotAllowed(m, day, p))) return false;
    if (occ.teacher.has(`${task.teacherId}|${slotKey(day, p)}`)) return false;
    for (const classId of task.classIds)
      if (occ.class.has(`${classId}|${slotKey(day, p)}`)) return false;
  }
  return true;
}

function place(task: Task, day: DayId, start: number, size: number, occ: Occupancy, out: ScheduleEntry[]) {
  for (let p = start; p < start + size; p++) {
    occ.teacher.add(`${task.teacherId}|${slotKey(day, p)}`);
    task.classIds.forEach((classId) => {
      occ.class.add(`${classId}|${slotKey(day, p)}`);
      out.push({
        id: `E${out.length + 1}-${classId}-${day}-${p}`,
        classId,
        subjectId: task.subjectId,
        teacherId: task.teacherId,
        day,
        period: p,
        pinned: false,
        mergeGroupId: task.mergeGroupId,
      });
    });
  }
  task.classIds.forEach((classId) => occ.subjectDay.add(`${classId}|${task.subjectId}|${day}`));
}

function attemptGenerate(
  loads: Load[],
  pinned: ScheduleEntry[],
  rand: () => number,
): { entries: ScheduleEntry[]; unplacedJp: number } {
  const occ: Occupancy = { teacher: new Set(), class: new Set(), subjectDay: new Set() };
  const entries: ScheduleEntry[] = pinned.map((e) => ({ ...e }));
  entries.forEach((e) => {
    occ.teacher.add(`${e.teacherId}|${slotKey(e.day, e.period)}`);
    occ.class.add(`${e.classId}|${slotKey(e.day, e.period)}`);
    occ.subjectDay.add(`${e.classId}|${e.subjectId}|${e.day}`);
  });

  const pinnedCount = new Map<string, number>();
  pinned.forEach((e) => {
    const k = `${e.classId}|${e.subjectId}|${e.teacherId}`;
    pinnedCount.set(k, (pinnedCount.get(k) ?? 0) + 1);
  });

  const tasks = buildTasks(loads)
    .map((t) => {
      const already = Math.min(
        ...t.classIds.map(
          (classId) => pinnedCount.get(`${classId}|${t.subjectId}|${t.teacherId}`) ?? 0,
        ),
      );
      return { ...t, jp: Math.max(0, t.jp - already) };
    })
    .filter((t) => t.jp > 0)
    .sort(
      (a, b) =>
        // Blok Kelas Industri dijadwalkan lebih dulu agar hari blok terisi penuh.
        Number(isIndustriTask(b)) - Number(isIndustriTask(a)) ||
        flexibility(a) / a.jp - flexibility(b) / b.jp + (rand() - 0.5) * 2,
    );

  let unplacedJp = 0;
  const unplaced: { task: Task; count: number }[] = [];

  // Kapasitas hari blok industri terbatas — bagi adil antar guru industri per kelas
  // (mis. Bu Putri vs Industri) supaya tidak ada guru yang tergeser habis.
  const industriByClass = new Map<number, Task[]>();
  tasks.filter(isIndustriTask).forEach((t) => {
    const list = industriByClass.get(t.classIds[0]) ?? [];
    list.push(t);
    industriByClass.set(t.classIds[0], list);
  });
  industriByClass.forEach((list, classId) => {
    const capacity = industriDaysOf(classId).reduce((sum, d) => sum + lastPeriodOf(d), 0);
    const total = list.reduce((sum, t) => sum + t.jp, 0);
    if (total <= capacity || list.length < 2) return;
    let left = capacity;
    list.forEach((t, i) => {
      const share = Math.min(t.jp, Math.round((capacity * t.jp) / total) || 1, left);
      const fair = i === list.length - 1 ? Math.min(t.jp, left) : share;
      const cut = t.jp - fair;
      if (cut > 0) {
        unplacedJp += cut;
        unplaced.push({ task: t, count: cut });
        t.jp = fair;
      }
      left -= fair;
    });
  });

  tasks.forEach((task) => {
    const blocks = splitIntoBlocks(task.jp);
    blocks.forEach((size) => {
      let remaining = size;
      let chunk = size;
      while (remaining > 0) {
        const candidates: { day: DayId; start: number; size: number; score: number }[] = [];
        for (const d of DAYS) {
          for (let start = 1; start <= d.lastPeriod; start++) {
            if (!canPlaceBlock(task, d.id, start, chunk, occ)) continue;
            let score = rand();
            // Hindari dua blok mapel yang sama pada hari yang sama.
            if (
              !isIndustriTask(task) &&
              task.classIds.some((c) => occ.subjectDay.has(`${c}|${task.subjectId}|${d.id}`))
            )
              score += 6;
            // Mapel industri diprioritaskan mengisi hari blok kelas industri.
            if (isIndustriTask(task) && !industriDaysOf(task.classIds[0]).includes(d.id))
              score += 50;
            // Soft constraint guru persiapan Sholat Jumat.
            for (let p = start; p < start + chunk; p++)
              if (isSoftDiscouraged(task.representative, d.id, p)) score += 20;
            // Sedikit lebih suka blok pagi supaya jadwal padat dari awal hari.
            score += start * 0.05;
            candidates.push({ day: d.id, start, size: chunk, score });
          }
        }
        if (candidates.length === 0) {
          // Blok tidak muat — pecah lebih kecil; kalau 1 JP pun tidak muat maka gagal.
          if (chunk === 1) {
            unplacedJp += remaining;
            unplaced.push({ task, count: remaining });
            remaining = 0;
          } else {
            chunk -= 1;
          }
          continue;
        }
        candidates.sort((a, b) => a.score - b.score);
        const best = candidates[0];
        place(task, best.day, best.start, best.size, occ, entries);
        remaining -= best.size;
        chunk = Math.min(chunk, remaining);
      }
    });
  });

  unplacedJp -= repair(unplaced, occ, entries, rand);

  return { entries, unplacedJp };
}

/**
 * Tahap perbaikan: isi slot kelas yang masih bolong dengan JP yang belum tertampung.
 * Bila guru sedang mengajar di kelas lain pada slot kosong itu, coba geser dulu
 * entri penghalang tersebut ke slot lain yang legal (pertukaran satu tingkat).
 */
function repair(
  unplaced: { task: Task; count: number }[],
  occ: Occupancy,
  entries: ScheduleEntry[],
  rand: () => number,
): number {
  let repaired = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (const item of unplaced) {
      const { task } = item;
      if (item.count <= 0 || task.classIds.length > 1) continue;
      const classId = task.classIds[0];
      for (const d of DAYS) {
        if (item.count <= 0) break;
        for (let p = 1; p <= d.lastPeriod && item.count > 0; p++) {
          if (task.members.some((m) => !isSlotAllowed(m, d.id, p))) continue;
          if (occ.class.has(`${classId}|${slotKey(d.id, p)}`)) {
            // Slot kelas terisi mapel lain — coba pindahkan penghuninya bila guru task bebas.
            if (occ.teacher.has(`${task.teacherId}|${slotKey(d.id, p)}`)) continue;
            const occupant = entries.find(
              (e) => e.classId === classId && e.day === d.id && e.period === p,
            );
            if (!occupant || occupant.pinned || occupant.mergeGroupId) continue;
            const newSpot = findFreeSpot(occupant, occ, rand);
            if (!newSpot) continue;
            occ.teacher.delete(`${occupant.teacherId}|${slotKey(occupant.day, occupant.period)}`);
            occ.class.delete(`${occupant.classId}|${slotKey(occupant.day, occupant.period)}`);
            occupant.day = newSpot.day;
            occupant.period = newSpot.period;
            occ.teacher.add(`${occupant.teacherId}|${slotKey(newSpot.day, newSpot.period)}`);
            occ.class.add(`${occupant.classId}|${slotKey(newSpot.day, newSpot.period)}`);
            place(task, d.id, p, 1, occ, entries);
            item.count -= 1;
            repaired += 1;
            progress = true;
            continue;
          }
          if (!occ.teacher.has(`${task.teacherId}|${slotKey(d.id, p)}`)) {
            place(task, d.id, p, 1, occ, entries);
            item.count -= 1;
            repaired += 1;
            progress = true;
            continue;
          }
          // Guru bentrok — coba relokasi entri penghalang milik kelas lain.
          const blocker = entries.find(
            (e) => e.teacherId === task.teacherId && e.day === d.id && e.period === p,
          );
          if (!blocker || blocker.pinned || blocker.mergeGroupId) continue;
          const spot = findFreeSpot(blocker, occ, rand);
          if (!spot) continue;
          occ.teacher.delete(`${blocker.teacherId}|${slotKey(blocker.day, blocker.period)}`);
          occ.class.delete(`${blocker.classId}|${slotKey(blocker.day, blocker.period)}`);
          blocker.day = spot.day;
          blocker.period = spot.period;
          occ.teacher.add(`${blocker.teacherId}|${slotKey(spot.day, spot.period)}`);
          occ.class.add(`${blocker.classId}|${slotKey(spot.day, spot.period)}`);
          place(task, d.id, p, 1, occ, entries);
          item.count -= 1;
          repaired += 1;
          progress = true;
        }
      }
    }
  }
  return repaired;
}

function findFreeSpot(
  entry: ScheduleEntry,
  occ: Occupancy,
  rand: () => number,
): { day: DayId; period: number } | null {
  const load: Load = {
    id: 'tmp',
    classId: entry.classId,
    subjectId: entry.subjectId,
    teacherId: entry.teacherId,
    jp: 1,
  };
  const spots: { day: DayId; period: number; score: number }[] = [];
  for (const d of DAYS) {
    for (let p = 1; p <= d.lastPeriod; p++) {
      if (occ.class.has(`${entry.classId}|${slotKey(d.id, p)}`)) continue;
      if (occ.teacher.has(`${entry.teacherId}|${slotKey(d.id, p)}`)) continue;
      if (!isSlotAllowed(load, d.id, p)) continue;
      const score = rand() + (isSoftDiscouraged(load, d.id, p) ? 20 : 0);
      spots.push({ day: d.id, period: p, score });
    }
  }
  if (spots.length === 0) return null;
  spots.sort((a, b) => a.score - b.score);
  return spots[0];
}

/** Auto-Randomizer: coba beberapa kali dan ambil jadwal dengan pelanggaran paling sedikit. */
export function generateSchedule(
  pinned: ScheduleEntry[] = [],
  attempts = 30,
  seed = Date.now(),
  manualLoadIds?: Set<string>,
): GenerateResult {
  const isManualLoad = (l: Load) =>
    manualLoadIds ? manualLoadIds.has(l.id) : isManualSubject(l.subjectId);
  const autoLoads = DATASET.loads.filter((l) => !isManualLoad(l));
  const mandarinTarget = autoLoads
    .filter((l) => isMandarinSubject(l.subjectId))
    .reduce((sum, l) => sum + l.jp, 0);
  const costOf = (r: { entries: ScheduleEntry[]; violations: Violation[]; unplacedJp: number }) => {
    const hard = r.violations.filter((v) => v.severity === 'hard').length;
    const soft = r.violations.filter((v) => v.severity === 'soft').length;
    // Mandarin punya jendela waktu sempit — JP-nya yang tak tertampung dihukum ekstra.
    const mandarinMissing =
      mandarinTarget - r.entries.filter((e) => isMandarinSubject(e.subjectId)).length;
    return hard * 100 + soft * 5 + r.unplacedJp * 50 + mandarinMissing * 200;
  };
  let best: GenerateResult | null = null;
  for (let i = 0; i < attempts; i++) {
    const rand = mulberry32(seed + i * 7919);
    // Beban mode Manual tidak dijadwalkan otomatis.
    const { entries, unplacedJp } = attemptGenerate(autoLoads, pinned, rand);
    const violations = validate(entries, manualLoadIds);
    const result = { entries, violations, unplacedJp, attempts: i + 1 };
    if (!best || costOf(result) < costOf(best)) best = result;
    if (costOf(best) === 0) break;
  }
  return best!;
}

/** Total JP yang dapat ditampung tiap kelas dalam seminggu (44 slot: Kamis hanya 8 jam). */
export const WEEKLY_CAPACITY = DAYS.reduce((sum, d) => sum + d.lastPeriod, 0);
