import { Fragment, useMemo, useRef, useState } from 'react';
import { Empty, Input, Popover, Tag } from 'antd';
import {
  CodeOutlined,
  PlusOutlined,
  PushpinFilled,
  ReadOutlined,
  SearchOutlined,
  TranslationOutlined,
  TrophyOutlined,
  WarningFilled,
} from '@ant-design/icons';
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
import type { DayId, FocusFilter, Load, ScheduleEntry, Violation } from '../lib/types';

export interface GridProps {
  entries: ScheduleEntry[];
  violations: Violation[];
  onMove: (entryId: string, target: { classId: number; day: DayId; period: number }) => void;
  onTogglePin: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  onQuickAdd: (load: Load, target: { classId: number; day: DayId; period: number }) => void;
  focusFilter?: FocusFilter;
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

/** Tema kartu untuk popup "Pilih Mapel" — ikon + warna khas per mapel. */
function subjectTheme(name: string, subjectId: number) {
  const n = name.toLowerCase();
  if (n.includes('pjok') || n.includes('olahraga'))
    return {
      icon: <TrophyOutlined />,
      card: 'bg-sky-50 border-sky-300 hover:border-sky-500 hover:bg-sky-100',
      iconBox: 'bg-sky-500 text-white',
      label: 'text-sky-700',
    };
  if (n.includes('mandarin'))
    return {
      icon: <TranslationOutlined />,
      card: 'bg-pink-50 border-pink-300 hover:border-pink-500 hover:bg-pink-100',
      iconBox: 'bg-pink-500 text-white',
      label: 'text-pink-700',
    };
  if (n.includes('perangkat lunak') || n.includes('rpl') || n.includes('pemrograman') || n.includes('ppl'))
    return {
      icon: <CodeOutlined />,
      card: 'bg-emerald-50 border-emerald-300 hover:border-emerald-500 hover:bg-emerald-100',
      iconBox: 'bg-emerald-500 text-white',
      label: 'text-emerald-700',
    };
  const fallback = subjectColor(subjectId);
  return {
    icon: <ReadOutlined />,
    card: `${fallback} hover:brightness-95`,
    iconBox: 'bg-slate-500 text-white',
    label: 'text-slate-700',
  };
}

function SubjectPicker({
  classId,
  onPick,
}: {
  classId: number;
  onPick: (load: Load) => void;
}) {
  const [query, setQuery] = useState('');
  const loads = useMemo(() => DATASET.loads.filter((l) => l.classId === classId), [classId]);
  const filteredLoads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return loads;
    return loads.filter(
      (l) =>
        subjectName(l.subjectId).toLowerCase().includes(q) ||
        shortTeacherName(l.teacherId).toLowerCase().includes(q),
    );
  }, [loads, query]);

  return (
    <div className="w-64">
      <div className="mb-2 text-sm font-semibold text-slate-700">Pilih Mapel</div>
      {loads.length === 0 && (
        <div className="text-xs text-slate-400">Belum ada beban mapel untuk kelas ini.</div>
      )}
      {loads.length > 0 && (
        <Input
          size="small"
          allowClear
          autoFocus
          prefix={<SearchOutlined className="text-slate-300" />}
          placeholder="Cari mapel atau guru..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2"
        />
      )}
      <div className="max-h-[350px] space-y-1.5 overflow-y-auto pr-0.5">
        {loads.length > 0 && filteredLoads.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-xs text-slate-400">Tidak ditemukan</span>}
            className="py-2"
          />
        )}
        {filteredLoads.map((l) => {
          const theme = subjectTheme(subjectName(l.subjectId), l.subjectId);
          return (
            <button
              key={l.id}
              onClick={() => onPick(l)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${theme.card}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm ${theme.iconBox}`}>
                {theme.icon}
              </span>
              <span className="min-w-0 flex-1">
                <div className={`truncate text-xs font-semibold ${theme.label}`}>{subjectName(l.subjectId)}</div>
                <div className="truncate text-[10px] text-slate-500">
                  {shortTeacherName(l.teacherId)} · {l.jp} JP
                </div>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ScheduleGrid({
  entries,
  violations,
  onMove,
  onTogglePin,
  onRemove,
  onQuickAdd,
  focusFilter,
}: GridProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const dragCounter = useRef(0);

  // Filter View (Focus Mode): kelas & ruangan menyembunyikan kolom lain; guru tetap
  // menampilkan semua kolom tapi meredupkan entri yang bukan milik guru tersebut.
  const visibleClasses = useMemo(() => {
    if (!focusFilter) return DATASET.classes;
    if (focusFilter.type === 'kelas') return DATASET.classes.filter((c) => c.id === focusFilter.classId);
    if (focusFilter.type === 'ruangan') return DATASET.classes.filter((c) => c.room === focusFilter.room);
    return DATASET.classes;
  }, [focusFilter]);

  const isDimmed = (e: ScheduleEntry) =>
    !!focusFilter && focusFilter.type === 'guru' && e.teacherId !== focusFilter.teacherId;
  const isFocused = (e: ScheduleEntry) =>
    !!focusFilter && focusFilter.type === 'guru' && e.teacherId === focusFilter.teacherId;

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
            {visibleClasses.map((c) => (
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
                        colSpan={1 + visibleClasses.length}
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
                    {visibleClasses.map((c) => {
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
                      const dimmed = e ? isDimmed(e) : false;
                      const focused = e ? isFocused(e) : false;
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
                          {e ? (
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
                                className={`schedule-cell relative h-full cursor-grab rounded border px-1 py-0.5 leading-tight transition-opacity active:cursor-grabbing ${
                                  hard
                                    ? 'border-red-500 bg-red-100 ring-1 ring-red-400'
                                    : soft
                                      ? 'border-amber-400 bg-amber-50'
                                      : subjectColor(e.subjectId)
                                } ${e.pinned ? 'cursor-default opacity-95' : ''} ${
                                  dimmed ? 'opacity-25 saturate-0' : ''
                                } ${focused ? 'ring-2 ring-blue-500' : ''}`}
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
                          ) : (
                            <Popover
                              trigger="click"
                              open={openPicker === key}
                              onOpenChange={(next) => setOpenPicker(next ? key : null)}
                              content={
                                <SubjectPicker
                                  classId={c.id}
                                  onPick={(load) => {
                                    onQuickAdd(load, { classId: c.id, day: d.id, period: p.period });
                                    setOpenPicker(null);
                                  }}
                                />
                              }
                            >
                              <button
                                type="button"
                                aria-label="Tambah mapel"
                                className="flex h-full w-full cursor-pointer items-center justify-center rounded border border-dashed border-slate-200 text-slate-300 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500"
                              >
                                <PlusOutlined />
                              </button>
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
