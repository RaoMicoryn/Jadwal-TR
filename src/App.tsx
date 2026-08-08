import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Button, Dropdown, Empty, Popconfirm, Popover, Select, Space, Switch, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckCircleFilled,
  ClearOutlined,
  CloseCircleFilled,
  DownloadOutlined,
  DownOutlined,
  FileExcelOutlined,
  FilterOutlined,
  PrinterOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  WarningFilled,
} from '@ant-design/icons';
import gsap from 'gsap';
import ScheduleGrid from './components/ScheduleGrid';
import ConflictLog, { CODE_LABELS } from './components/ConflictLog';
import MasterData from './components/MasterData';
import { defaultManualLoadIds, validate } from './lib/constraints';
import { PJOK_MERGE_SETTING_KEY, isEkskulSlot, isPjokMergeEnabled } from './lib/constants';
import { DATASET } from './lib/dataset';
import { generateSchedule, WEEKLY_CAPACITY } from './lib/scheduler';
import { exportCsv, exportExcel } from './lib/exporters';
import { loadLocal, loadManualLoadIds, saveLocal, saveManualLoadIds, saveRemote, loadRemote } from './lib/storage';
import type { DayId, FocusFilter, Load, ScheduleEntry } from './lib/types';

export default function App() {
  const { message } = AntApp.useApp();
  const [entries, setEntries] = useState<ScheduleEntry[]>(() => loadLocal() ?? []);
  const [generating, setGenerating] = useState(false);
  const [manualLoadIds, setManualLoadIds] = useState<Set<string>>(
    () => new Set(loadManualLoadIds() ?? defaultManualLoadIds()),
  );
  const [lockPin, setLockPin] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [focusFilter, setFocusFilter] = useState<FocusFilter>(null);

  // Kunci kelas|mapel|guru dari beban yang di-set Manual — untuk mengenali entrinya.
  const manualKeys = useMemo(
    () =>
      new Set(
        DATASET.loads
          .filter((l) => manualLoadIds.has(l.id))
          .map((l) => `${l.classId}|${l.subjectId}|${l.teacherId}`),
      ),
    [manualLoadIds],
  );
  const isManualEntry = useCallback(
    (e: ScheduleEntry) => manualKeys.has(`${e.classId}|${e.subjectId}|${e.teacherId}`),
    [manualKeys],
  );
  const headerRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const conflictLogRef = useRef<HTMLDivElement>(null);

  const scrollToConflictLog = useCallback(() => {
    conflictLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Filter View (Focus Mode): dropdown gabungan Kelas / Guru / Ruangan.
  const focusOptions = useMemo(() => {
    const rooms = [...new Set(DATASET.classes.map((c) => c.room))];
    return [
      {
        label: 'Kelas',
        title: 'Kelas',
        options: DATASET.classes.map((c) => ({
          value: `kelas:${c.id}`,
          label: `${c.className} (${c.room})`,
        })),
      },
      {
        label: 'Guru',
        title: 'Guru',
        options: DATASET.teachers.map((t) => ({ value: `guru:${t.id}`, label: t.name })),
      },
      {
        label: 'Ruangan',
        title: 'Ruangan',
        options: rooms.map((r) => ({ value: `ruangan:${r}`, label: r })),
      },
    ];
  }, []);

  const focusSelectValue = useMemo(() => {
    if (!focusFilter) return undefined;
    if (focusFilter.type === 'kelas') return `kelas:${focusFilter.classId}`;
    if (focusFilter.type === 'guru') return `guru:${focusFilter.teacherId}`;
    return `ruangan:${focusFilter.room}`;
  }, [focusFilter]);

  const focusLabel = useMemo(() => {
    if (!focusFilter) return null;
    if (focusFilter.type === 'kelas')
      return `Kelas: ${DATASET.classes.find((c) => c.id === focusFilter.classId)?.className ?? '?'}`;
    if (focusFilter.type === 'guru')
      return `Guru: ${DATASET.teachers.find((t) => t.id === focusFilter.teacherId)?.name ?? '?'}`;
    return `Ruangan: ${focusFilter.room}`;
  }, [focusFilter]);

  const handleFocusChange = useCallback((value: string | undefined) => {
    if (!value) {
      setFocusFilter(null);
      return;
    }
    const [type, raw] = value.split(':');
    if (type === 'kelas') setFocusFilter({ type: 'kelas', classId: Number(raw) });
    else if (type === 'guru') setFocusFilter({ type: 'guru', teacherId: Number(raw) });
    else if (type === 'ruangan') setFocusFilter({ type: 'ruangan', room: raw });
  }, []);

  const violations = useMemo(() => validate(entries, manualLoadIds), [entries, manualLoadIds]);
  const hardCount = violations.filter((v) => v.severity === 'hard').length;
  const softCount = violations.filter((v) => v.severity === 'soft').length;

  useEffect(() => {
    if (headerRef.current)
      gsap.fromTo(
        headerRef.current.children,
        { y: -16, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.08, duration: 0.5, ease: 'power2.out' },
      );
  }, []);

  useEffect(() => {
    saveLocal(entries);
  }, [entries]);

  useEffect(() => {
    saveManualLoadIds([...manualLoadIds]);
  }, [manualLoadIds]);
  
  useEffect(() => {
  loadRemote()
    .then((remoteEntries) => setEntries(remoteEntries))
    .catch(() => {
      // Kalau fetch ke Neon gagal, tetap pakai data localStorage yang sudah dimuat
    });
}, []);

  const animateGrid = useCallback(() => {
    if (!gridWrapRef.current) return;
    gsap.fromTo(
      gridWrapRef.current.querySelectorAll('.schedule-cell'),
      { opacity: 0, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 0.35, stagger: { each: 0.0015, from: 'random' }, ease: 'back.out(1.4)' },
    );
  }, []);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    // Beri waktu render tombol loading sebelum komputasi berat.
    setTimeout(() => {
      // Entri pinned dan beban mode Manual dipertahankan apa adanya.
      const pinned = entries.filter((e) => e.pinned || isManualEntry(e));
      const result = generateSchedule(pinned, 40, Date.now(), manualLoadIds);
      setEntries(result.entries);
      setGenerating(false);
      const hard = result.violations.filter((v) => v.severity === 'hard' && v.code !== 'JP_UNDER_ALLOCATED');
      const under = result.violations.filter((v) => v.code === 'JP_UNDER_ALLOCATED');
      if (hard.length === 0 && under.length === 0) message.success('Jadwal berhasil dibuat — Zero Conflict!');
      else if (hard.length === 0)
        message.warning(
          `Jadwal tanpa bentrok, tetapi ${under.length} beban JP tidak tertampung (total JP melebihi kapasitas ${WEEKLY_CAPACITY} slot/minggu). Lihat Conflict Log.`,
        );
      else message.error(`Masih ada ${hard.length} pelanggaran keras — cek Conflict Log.`);
      requestAnimationFrame(animateGrid);
    }, 30);
  }, [entries, message, animateGrid, isManualEntry, manualLoadIds]);

  const handleMove = useCallback(
    (entryId: string, target: { classId: number; day: DayId; period: number }) => {
      setEntries((prev) => {
        const moving = prev.find((e) => e.id === entryId);
        if (!moving) return prev;
        if (isEkskulSlot(target.day, target.period)) {
          message.warning('Kamis jam 9 (14.00-15.00) reserved untuk Kegiatan Ekskul Wajib.');
          return prev;
        }
        const occupant = prev.find(
          (e) => e.classId === target.classId && e.day === target.day && e.period === target.period,
        );
        if (occupant?.pinned) {
          message.warning('Slot tujuan terkunci (pinned). Buka kunci dulu untuk menukar.');
          return prev;
        }
        if (moving.classId !== target.classId && occupant && occupant.classId !== moving.classId) {
          // Tukar antar kelas hanya jika mapel keduanya memang milik kelas masing-masing — tolak.
          message.warning('Tidak bisa menukar antar kelas berbeda: mapel terikat ke kelasnya.');
          return prev;
        }
        if (moving.classId !== target.classId) {
          message.warning('Mapel hanya bisa dipindah di dalam kolom kelasnya sendiri.');
          return prev;
        }
        return prev.map((e) => {
          if (e.id === moving.id) return { ...e, day: target.day, period: target.period };
          if (occupant && e.id === occupant.id) return { ...e, day: moving.day, period: moving.period };
          return e;
        });
      });
    },
    [message],
  );

  const handleTogglePin = useCallback((entryId: string) => {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, pinned: !e.pinned } : e)));
  }, []);

  const handleRemove = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  const handleQuickAdd = useCallback(
    (load: Load, target: { classId: number; day: DayId; period: number }) => {
      if (isEkskulSlot(target.day, target.period)) {
        message.warning('Kamis jam 9 (14.20-15.00) reserved untuk Kegiatan Ekskul Wajib.');
        return;
      }
      setEntries((prev) => {
        if (
          prev.some((e) => e.classId === target.classId && e.day === target.day && e.period === target.period)
        ) {
          message.warning('Slot tersebut sudah terisi. Hapus/geser dulu isinya.');
          return prev;
        }
        return [
          ...prev,
          {
            id: `M${Date.now()}-${target.classId}-${target.day}-${target.period}`,
            classId: target.classId,
            subjectId: load.subjectId,
            teacherId: load.teacherId,
            day: target.day,
            period: target.period,
            pinned: lockPin,
            mergeGroupId: undefined,
          },
        ];
      });
    },
    [message, lockPin],
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Space wrap>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={generating}
              onClick={handleGenerate}
            >
              Randomizer
            </Button>
            <Popconfirm
              title="Bersihkan jadwal?"
              description="Slot yang dikunci (pin) dan yang mapel yang ditambahkan secara manual tidak akan ikut terhapus."
              okText="Bersihkan"
              onConfirm={() =>
                setEntries((prev) => prev.filter((e) => e.pinned || isManualEntry(e)))
              }
            >
              <Button danger icon={<ClearOutlined />}>
                Bersihkan
              </Button>
            </Popconfirm>
            <Popconfirm
              title="HAH MAU HAPUS SEMUA? KAMU YAKIN?"
              okText="ya, hapus total!"
              okButtonProps={{ danger: true }}
              onConfirm={() => setEntries([])}
            >
              <Button danger type="text" icon={<ClearOutlined />}>
                Hapus Total
              </Button>
            </Popconfirm>
            <Tooltip title="Jadwal tersimpan ke server (Neon), bisa diakses dari device lain">
              <Button
                icon={<SaveOutlined />}
                onClick={async () => {
                  try {
                    await saveRemote(entries);
                      saveLocal(entries);
                      message.success('Tersimpan ke server.');
                      } catch {
                      saveLocal(entries);
                      message.error('Gagal simpan ke server — hanya tersimpan di browser ini.');
                    }
              }}
              >
              Simpan
              </Button>
            </Tooltip>
            <Tooltip title="Saat menambah mapel lewat tombol + di jadwal, slot langsung dikunci (pin) supaya tidak ikut diacak ulang oleh Randomizer.">
              <span className="flex items-center gap-1 text-sm text-slate-600">
                Lock pin
                <Switch size="small" checked={lockPin} onChange={setLockPin} />
              </span>
            </Tooltip>
            <Tooltip title="Gabungkan PJOK: X AK + X RPL dan XI DKV 1 + XI DKV 2 (2 JP menjadi 3 JP, slot sejajar). Aplikasi akan direstart.">
              <span className="flex items-center gap-1 text-sm text-slate-600">
                Gabungan PJOK
                <Switch
                  size="small"
                  checked={isPjokMergeEnabled()}
                  onChange={(on) => {
                    localStorage.setItem(PJOK_MERGE_SETTING_KEY, on ? 'on' : 'off');
                    window.location.reload();
                  }}
                />
              </span>
            </Tooltip>
          </Space>
          <Space wrap>
            <Popover
              trigger={['hover', 'click']}
              placement="bottomRight"
              title={
                <span className="text-xs font-semibold text-slate-600">
                  {entries.length} JP terjadwal
                </span>
              }
              content={
                <div className="w-72">
                  {violations.length === 0 ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-green-700">
                      <CheckCircleFilled /> Zero Conflict — tidak ada bentrok.
                    </div>
                  ) : (
                    <>
                      <div className="mb-1.5 flex gap-1.5">
                        <Tag color="red">{hardCount} keras</Tag>
                        <Tag color="orange">{softCount} lunak</Tag>
                      </div>
                      <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
                        {violations.slice(0, 6).map((v) => (
                          <div key={v.id} className="flex items-start gap-1.5 text-[11px] leading-tight">
                            <WarningFilled
                              className={v.severity === 'hard' ? 'mt-0.5 text-red-500' : 'mt-0.5 text-amber-500'}
                            />
                            <div>
                              <Tag color={v.severity === 'hard' ? 'red' : 'orange'}>{CODE_LABELS[v.code]}</Tag>
                              {v.message}
                            </div>
                          </div>
                        ))}
                        {violations.length === 0 && <Empty />}
                      </div>
                      {violations.length > 6 && (
                        <div className="mt-1 text-[11px] text-slate-400">
                          +{violations.length - 6} lainnya
                        </div>
                      )}
                      <button
                        className="mt-2 cursor-pointer text-xs text-blue-600 hover:underline"
                        onClick={scrollToConflictLog}
                      >
                        Lihat semua di Conflict Log →
                      </button>
                    </>
                  )}
                </div>
              }
            >
              <button
                type="button"
                onClick={scrollToConflictLog}
                className="mr-2 flex cursor-pointer items-center gap-2 border-none bg-transparent p-0"
              >
                <span className="text-sm text-slate-600 hover:text-slate-800">
                  {entries.length} JP terjadwal
                </span>
                {(hardCount > 0 || softCount > 0) && (
                  <span className="flex items-center gap-1">
                    {hardCount > 0 && (
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                        {hardCount > 99 ? '99+' : hardCount}
                      </span>
                    )}
                    {softCount > 0 && (
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
                        {softCount > 99 ? '99+' : softCount}
                      </span>
                    )}
                  </span>
                )}
              </button>
            </Popover>
            <Dropdown
              menu={{
                items: [
                  { key: 'csv', label: 'Export CSV', icon: <DownloadOutlined /> },
                  { key: 'excel', label: 'Export Excel', icon: <FileExcelOutlined /> },
                  { key: 'cetak', label: 'Cetak', icon: <PrinterOutlined /> },
                ] as MenuProps['items'],
                onClick: ({ key }) => {
                  if (key === 'csv') exportCsv(entries);
                  else if (key === 'excel') {
                    const hide = message.loading('Menyiapkan file Excel...', 0);
                    exportExcel(entries)
                      .then(() => message.success('Excel berhasil diexport'))
                      .catch(() => message.error('Gagal export Excel, coba lagi.'))
                      .finally(hide);
                  } else if (key === 'cetak') {
                    setExportOpen(false);
                    requestAnimationFrame(() => window.print());
                  }
                },
              }}
              open={exportOpen}
              onOpenChange={setExportOpen}
            >
              <Button icon={<DownloadOutlined />}>
                Export <DownOutlined className={`transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`} />
              </Button>
            </Dropdown>
          </Space>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm print:hidden">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <FilterOutlined /> Fokus Tampilan
          </span>
          <Select
            allowClear
            showSearch
            placeholder="Tampilkan semua kelas — pilih Kelas / Guru / Ruangan untuk fokus"
            className="min-w-72 flex-1"
            value={focusSelectValue}
            onChange={handleFocusChange}
            onClear={() => setFocusFilter(null)}
            options={focusOptions}
            optionFilterProp="label"
            filterOption={(input, option) =>
              (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
            }
          />
          {focusFilter && (
            <Tag
              closable
              closeIcon={<CloseCircleFilled />}
              onClose={() => setFocusFilter(null)}
              color="blue"
              className="m-0"
            >
              {focusLabel}
            </Tag>
          )}
        </div>

        <div className="hidden print:block">
          <div className="bg-blue-900 px-3 py-2 text-center text-base font-bold text-white">
            JADWAL PELAJARAN
          </div>
          <div className="bg-slate-100 px-3 py-1 text-center text-[10px] italic text-slate-600">
            Digenerate{' '}
            {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} ·{' '}
            {DATASET.classes.length} kelas
          </div>
        </div>

        <div ref={gridWrapRef}>
          <ScheduleGrid
            entries={entries}
            violations={violations}
            onMove={handleMove}
            onTogglePin={handleTogglePin}
            onRemove={handleRemove}
            onQuickAdd={handleQuickAdd}
            focusFilter={focusFilter}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 print:hidden">
          <div ref={conflictLogRef} className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Error / Conflict Log (tidak begitu berpengaruh kepada system)</h2>
            <ConflictLog violations={violations} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Data Master (Pembagian Tugas)</h2>
            <MasterData
              manualLoadIds={manualLoadIds}
              onToggleManual={(loadId, manual) =>
                setManualLoadIds((prev) => {
                  const next = new Set(prev);
                  if (manual) next.add(loadId);
                  else next.delete(loadId);
                  return next;
                })
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}
