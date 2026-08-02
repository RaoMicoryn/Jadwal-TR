import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Badge, Button, Popconfirm, Space, Switch, Tooltip } from 'antd';
import {
  ClearOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  PrinterOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import gsap from 'gsap';
import ScheduleGrid from './components/ScheduleGrid';
import ConflictLog from './components/ConflictLog';
import ManualForm, { type ManualValue } from './components/ManualForm';
import MasterData from './components/MasterData';
import { defaultManualLoadIds, validate } from './lib/constraints';
import { PJOK_MERGE_SETTING_KEY, isEkskulSlot, isPjokMergeEnabled } from './lib/constants';
import { DATASET } from './lib/dataset';
import { generateSchedule, WEEKLY_CAPACITY } from './lib/scheduler';
import { exportCsv, exportExcel } from './lib/exporters';
import { loadLocal, loadManualLoadIds, saveLocal, saveManualLoadIds } from './lib/storage';
import type { DayId, ScheduleEntry } from './lib/types';

export default function App() {
  const { message } = AntApp.useApp();
  const [entries, setEntries] = useState<ScheduleEntry[]>(() => loadLocal() ?? []);
  const [generating, setGenerating] = useState(false);
  const [manualLoadIds, setManualLoadIds] = useState<Set<string>>(
    () => new Set(loadManualLoadIds() ?? defaultManualLoadIds()),
  );

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

  const handleManualAdd = useCallback(
    (v: ManualValue) => {
      if (isEkskulSlot(v.day, v.period)) {
        message.warning('Kamis jam 9 (14.20-15.00) reserved untuk Kegiatan Ekskul Wajib.');
        return;
      }
      setEntries((prev) => {
        if (prev.some((e) => e.classId === v.classId && e.day === v.day && e.period === v.period)) {
          message.warning('Slot tersebut sudah terisi. Hapus/geser dulu isinya.');
          return prev;
        }
        return [
          ...prev,
          { ...v, id: `M${Date.now()}-${v.classId}-${v.day}-${v.period}`, mergeGroupId: undefined },
        ];
      });
    },
    [message],
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
            <Tooltip title="Jadwal otomatis tersimpan di browser">
              <Button icon={<SaveOutlined />} onClick={() => { saveLocal(entries); message.success('Tersimpan.'); }}>
                Simpan
              </Button>
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
            <Badge count={hardCount} color="red" offset={[-4, 0]}>
              <Badge count={softCount} color="orange" offset={[-4, 30]}>
                <span className="pr-3 text-sm text-slate-600">{entries.length} JP terjadwal</span>
              </Badge>
            </Badge>
            <Button icon={<DownloadOutlined />} onClick={() => exportCsv(entries)}>
              CSV
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={() => exportExcel(entries)}>
              Excel
            </Button>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
              Cetak
            </Button>
          </Space>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm print:hidden">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Mode Manual tambah / kunci mapel</h2>
          <ManualForm onAdd={handleManualAdd} />
        </div>

        <div ref={gridWrapRef}>
          <ScheduleGrid
            entries={entries}
            violations={violations}
            onMove={handleMove}
            onTogglePin={handleTogglePin}
            onRemove={handleRemove}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 print:hidden">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
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
