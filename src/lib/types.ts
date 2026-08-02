export type DayId = 1 | 2 | 3 | 4 | 5;

export interface RawAssignment {
  subject: string;
  className: string;
  jp: number;
}

export interface RawTeacher {
  name: string;
  status: string;
  assignments: RawAssignment[];
}

export interface Teacher {
  id: number;
  name: string;
  status: string;
  subjectIds: number[];
}

export interface SchoolClass {
  id: number;
  className: string;
  room: string;
}

export interface Subject {
  id: number;
  name: string;
  defaultJp: number;
}

/** One teaching load: a subject taught by a teacher to a class for `jp` periods per week. */
export interface Load {
  id: string;
  classId: number;
  subjectId: number;
  teacherId: number;
  jp: number;
  /** Set when the load belongs to a merged (combined) class group. */
  mergeGroupId?: string;
}

export interface Slot {
  day: DayId;
  period: number;
}

export interface ScheduleEntry {
  id: string;
  classId: number;
  subjectId: number;
  teacherId: number;
  day: DayId;
  period: number;
  pinned: boolean;
  mergeGroupId?: string;
}

export type ViolationSeverity = 'hard' | 'soft';

export interface Violation {
  id: string;
  severity: ViolationSeverity;
  code:
    | 'TEACHER_CLASH'
    | 'CLASS_DOUBLE_BOOKED'
    | 'PJOK_DAY'
    | 'PJOK_AFTERNOON'
    | 'MANDARIN_WINDOW'
    | 'INDUSTRI_BLOCK'
    | 'MERGED_NOT_ALIGNED'
    | 'EKSKUL_SLOT'
    | 'JUMAT_SHOLAT'
    | 'JP_UNDER_ALLOCATED';
  message: string;
  entryIds: string[];
  day?: DayId;
  period?: number;
  classIds: number[];
}
