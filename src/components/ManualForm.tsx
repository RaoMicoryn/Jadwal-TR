import { useMemo, useState } from 'react';
import { Button, Form, Select, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { DAYS, EKSKUL_DAY, EKSKUL_PERIODS, PERIODS, periodLabelFor } from '../lib/constants';
import { DATASET } from '../lib/dataset';
import type { DayId } from '../lib/types';

export interface ManualValue {
  classId: number;
  subjectId: number;
  teacherId: number;
  day: DayId;
  period: number;
  pinned: boolean;
}

export default function ManualForm({ onAdd }: { onAdd: (v: ManualValue) => void }) {
  const [classId, setClassId] = useState<number>();
  const [loadKey, setLoadKey] = useState<string>();
  const [day, setDay] = useState<DayId>();
  const [period, setPeriod] = useState<number>();
  const [pinned, setPinned] = useState(true);

  const loadOptions = useMemo(
    () =>
      DATASET.loads
        .filter((l) => l.classId === classId)
        .map((l) => ({
          value: l.id,
          label: `${DATASET.subjects.find((s) => s.id === l.subjectId)?.name} — ${
            DATASET.teachers.find((t) => t.id === l.teacherId)?.name
          } (${l.jp} JP)`,
        })),
    [classId],
  );

  const periodOptions = useMemo(() => {
    if (!day) return PERIODS.map((p) => ({ value: p.period, label: `Jam ${p.period} (${periodLabelFor(1, p.period)})` }));
    const max = DAYS.find((d) => d.id === day)!.lastPeriod;
    return PERIODS.filter(
      (p) => p.period <= max && !(day === EKSKUL_DAY && EKSKUL_PERIODS.includes(p.period)),
    ).map((p) => ({
      value: p.period,
      label: `Jam ${p.period} (${periodLabelFor(day, p.period)})`,
    }));
  }, [day]);

  const submit = () => {
    const load = DATASET.loads.find((l) => l.id === loadKey);
    if (!load || !day || !period) return;
    onAdd({
      classId: load.classId,
      subjectId: load.subjectId,
      teacherId: load.teacherId,
      day,
      period,
      pinned,
    });
  };

  return (
    <Form layout="inline" className="flex flex-wrap gap-y-2">
      <Form.Item label="Kelas">
        <Select
          className="min-w-36"
          placeholder="Pilih kelas"
          value={classId}
          onChange={(v) => {
            setClassId(v);
            setLoadKey(undefined);
          }}
          options={DATASET.classes.map((c) => ({ value: c.id, label: c.className }))}
        />
      </Form.Item>
      <Form.Item label="Mapel / Guru">
        <Select
          className="min-w-72"
          placeholder="Pilih mapel"
          value={loadKey}
          onChange={setLoadKey}
          options={loadOptions}
          showSearch
          optionFilterProp="label"
        />
      </Form.Item>
      <Form.Item label="Hari">
        <Select
          className="min-w-28"
          placeholder="Hari"
          value={day}
          onChange={setDay}
          options={DAYS.map((d) => ({ value: d.id, label: d.name }))}
        />
      </Form.Item>
      <Form.Item label="Jam">
        <Select
          className="min-w-48"
          placeholder="Jam ke"
          value={period}
          onChange={setPeriod}
          options={periodOptions}
        />
      </Form.Item>
      <Form.Item label="Kunci (pin)">
        <Switch checked={pinned} onChange={setPinned} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" icon={<PlusOutlined />} onClick={submit} disabled={!loadKey || !day || !period}>
          Tambah ke Jadwal
        </Button>
      </Form.Item>
    </Form>
  );
}
