import { Empty, List, Tag } from 'antd';
import { CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import type { Violation } from '../lib/types';

export const CODE_LABELS: Record<Violation['code'], string> = {
  TEACHER_CLASH: 'Bentrok Guru',
  CLASS_DOUBLE_BOOKED: 'Kelas Dobel',
  PJOK_DAY: 'Hari PJOK',
  PJOK_AFTERNOON: 'PJOK Siang',
  MANDARIN_WINDOW: 'Jam Mandarin',
  INDUSTRI_BLOCK: 'Blok Industri',
  MERGED_NOT_ALIGNED: 'Kelas Gabungan',
  EKSKUL_SLOT: 'Slot Ekskul',
  JUMAT_SHOLAT: 'Sholat Jumat',
  JP_UNDER_ALLOCATED: 'JP Kurang',
};

export default function ConflictLog({ violations }: { violations: Violation[] }) {
  if (violations.length === 0)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
        <CheckCircleFilled /> Zero Conflict — tidak ada bentrok maupun pelanggaran constraint.
      </div>
    );

  const hard = violations.filter((v) => v.severity === 'hard');
  const soft = violations.filter((v) => v.severity === 'soft');

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <Tag color="red">{hard.length} pelanggaran keras</Tag>
        <Tag color="orange">{soft.length} pelanggaran lunak</Tag>
      </div>
      <List
        size="small"
        bordered
        dataSource={[...hard, ...soft]}
        locale={{ emptyText: <Empty /> }}
        renderItem={(v) => (
          <List.Item>
            <div className="flex items-start gap-2 text-xs">
              <WarningFilled className={v.severity === 'hard' ? 'mt-0.5 text-red-500' : 'mt-0.5 text-amber-500'} />
              <div>
                <Tag color={v.severity === 'hard' ? 'red' : 'orange'}>{CODE_LABELS[v.code]}</Tag>
                {v.message}
              </div>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}
