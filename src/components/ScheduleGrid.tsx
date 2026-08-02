import { Fragment, useMemo, useRef, useState } from 'react';
import { Popover, Tag } from 'antd';
import { PushpinFilled, WarningFilled } from '@ant-design/icons';
import {
  BREAKS,
  DAYS,
  EKSKUL_DAY,
  EKSKUL_LABEL,
  EKSKUL_PERIODS,
  PERIODS,
  periodLabelFor,
} from '../lib/constants';
import { DATASET, shortTeacherName, subjectName, teacherName } from '../lib/dataset';
import type { DayId, ScheduleEntry, Violation } from '../lib/types';

export interface GridProps {
  entries: ScheduleEntry[];
  violations: Violation[];
  onMove: (entryId: string, target: { classId: number; day: DayId; period: number }) => void;
  onTogglePin: (entryId: string) => void;
  onRemove: (entryId: string) => void;
}

const SUBJECT_COLORS = [
  'bg-sky-100 border-sky-300',
  'bg-emerald-100 border-emerald-300',
  'bg-amber-100 border-amber-300',
  'bg-violet-100 border-violet-300',
  'bg-rose-100 border-rose-300',
  'bg-teal-100 border-teal-300',
  'bg-orange-100 border-orange-300',
  'bg-indigo-100 border-indigo-300',
  'bg-lime-100 border-lime-300',
  'bg-fuchsia-100 border-fuchsia-300',
];

const subjectColor = (subjectId: number) => SUBJECT_COLORS[subjectId % SUBJECT_COLORS.length];

export default function ScheduleGrid({ entries, violations, onMove, onTogglePin, onRemove }: GridProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const entryMap = useMemo(() => {
    const m = new Map<string, ScheduleEntry>();
    entries.forEach((e) => m.set(`${e.classId}|${e.day}|${e.period}`, e));
    return m;
  }, [entries]);

  const violationsByEntry = useMemo(() => {
    const m = new Map<string, Violation[]>();
    violations.forEach((v) =>
      v.entryIds.forEach((id) => m.set(id, [...(m.get(id) ?? []), v])),
    );
    return m;
  }, [violations]);

  const cellKey = (classId: number, day: DayId, period: number) => `${classId}|${day}|${period}`;

  const handleDrop = (classId: number, day: DayId, period: number) => {
    if (dragId) onMove(dragId, { classId, day, period });
    setDragId(null);
    setHover(null);
    dragCounter.current = 0;
  };

  return (
    <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm print-grid">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="sticky left-0 z-10 bg-slate-800 px-2 py-2 text-left" colSpan={2}>
              Hari / Jam
            </th>
            {DATASET.classes.map((c) => (
              <th key={c.id} className="min-w-[110px] border-l border-slate-600 px-1 py-2">
                <div>{c.className}</div>
                <div className="text-[10px] font-normal text-slate-300">{c.room}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((d) => {
            const dayPeriods = PERIODS.filter(
              (p) =>
                p.period <= d.lastPeriod ||
                (d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period)),
            );
            return dayPeriods.map((p, idx) => {
              const bands = BREAKS.filter((b) => b.afterPeriod === p.period - 1 && idx > 0);
              const isEkskul = d.id === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period);
              return (
                <Fragment key={`${d.id}-${p.period}`}>
                  {bands.map((b) => (
                    <tr key={`${d.id}-band-${b.label}`} className="bg-slate-100">
                      <td
                        colSpan={1 + DATASET.classes.length}
                        className="border-t border-slate-200 px-2 py-0.5 text-center text-[10px] italic text-slate-500"
                      >
                        {b.time} — {b.label}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200">
                    {idx === 0 && (
                      <td
                        rowSpan={dayPeriods.length + dayPeriods.slice(1).reduce((n, pp) => n + BREAKS.filter((b) => b.afterPeriod === pp.period - 1).length, 0)}
                        className="sticky left-0 z-10 w-14 border-r border-slate-200 bg-slate-700 px-2 text-center font-bold text-white"
                      >
                        <div className="[writing-mode:vertical-rl] rotate-180 mx-auto">{d.name}</div>
                      </td>
                    )}
                    <td className="w-24 whitespace-nowrap border-r border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                      <span className="font-semibold">J{p.period}</span> {periodLabelFor(d.id, p.period)}
                    </td>
                    {DATASET.classes.map((c) => {
                      if (isEkskul)
                        return (
                          <td
                            key={c.id}
                            className="border-l border-slate-100 bg-yellow-50 px-1 py-1 text-center text-[10px] font-semibold text-yellow-700"
                          >
                            {EKSKUL_LABEL}
                          </td>
                        );
                      const key = cellKey(c.id, d.id, p.period);
                      const e = entryMap.get(key);
                      const vs = e ? (violationsByEntry.get(e.id) ?? []) : [];
                      const hard = vs.some((v) => v.severity === 'hard');
                      const soft = vs.some((v) => v.severity === 'soft');
                      return (
                        <td
                          key={c.id}
                          data-slot={key}
                          onDragOver={(ev) => ev.preventDefault()}
                          onDragEnter={() => setHover(key)}
                          onDrop={() => handleDrop(c.id, d.id, p.period)}
                          className={`h-11 border-l border-slate-100 p-0.5 align-top transition-colors ${
                            hover === key && dragId ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''
                          }`}
                        >
                          {e && (
                            <Popover
                              content={
                                <div className="max-w-72 text-xs">
                                  <div className="font-semibold">{subjectName(e.subjectId)}</div>
                                  <div>{teacherName(e.teacherId)}</div>
                                  {e.mergeGroupId && <Tag color="purple">Kelas Gabungan</Tag>}
                                  {vs.map((v) => (
                                    <div key={v.id} className={v.severity === 'hard' ? 'mt-1 text-red-600' : 'mt-1 text-amber-600'}>
                                      <WarningFilled /> {v.message}
                                    </div>
                                  ))}
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      className="cursor-pointer text-blue-600 hover:underline"
                                      onClick={() => onTogglePin(e.id)}
                                    >
                                      {e.pinned ? 'Buka kunci' : 'Kunci (pin)'}
                                    </button>
                                    <button
                                      className="cursor-pointer text-red-600 hover:underline"
                                      onClick={() => onRemove(e.id)}
                                    >
                                      Hapus
                                    </button>
                                  </div>
                                </div>
                              }
                            >
                              <div
                                draggable={!e.pinned}
                                onDragStart={() => setDragId(e.id)}
                                onDragEnd={() => {
                                  setDragId(null);
                                  setHover(null);
                                }}
                                className={`schedule-cell relative h-full cursor-grab rounded border px-1 py-0.5 leading-tight active:cursor-grabbing ${
                                  hard
                                    ? 'border-red-500 bg-red-100 ring-1 ring-red-400'
                                    : soft
                                      ? 'border-amber-400 bg-amber-50'
                                      : subjectColor(e.subjectId)
                                } ${e.pinned ? 'cursor-default opacity-95' : ''}`}
                              >
                                <div className="truncate font-semibold text-slate-800">
                                  {subjectName(e.subjectId)}
                                </div>
                                <div className="truncate text-[10px] text-slate-600">
                                  {shortTeacherName(e.teacherId)}
                                </div>
                                <div className="absolute right-0.5 top-0.5 flex gap-0.5">
                                  {(hard || soft) && (
                                    <WarningFilled className={hard ? 'text-red-500' : 'text-amber-500'} />
                                  )}
                                  {e.pinned && <PushpinFilled className="text-slate-500" />}
                                </div>
                              </div>
                            </Popover>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
