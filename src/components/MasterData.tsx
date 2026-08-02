import { Switch, Table, Tabs, Tag, Tooltip } from 'antd';
import { DATASET, subjectName } from '../lib/dataset';
import type { Load } from '../lib/types';

export interface MasterDataProps {
  /** Id beban mengajar yang dijadwalkan Manual (tidak disentuh Auto-Randomizer). */
  manualLoadIds: Set<string>;
  onToggleManual: (loadId: string, manual: boolean) => void;
}

export default function MasterData({ manualLoadIds, onToggleManual }: MasterDataProps) {
  return (
    <Tabs
      items={[
        {
          key: 'teachers',
          label: 'Guru',
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={DATASET.teachers}
              columns={[
                { title: 'ID', dataIndex: 'id', width: 50 },
                { title: 'Nama Guru', dataIndex: 'name' },
                { title: 'Status', dataIndex: 'status', width: 80 },
                {
                  title: 'Mata Pelajaran',
                  dataIndex: 'subjectIds',
                  render: (ids: number[]) => ids.map((id) => <Tag key={id}>{subjectName(id)}</Tag>),
                },
              ]}
            />
          ),
        },
        {
          key: 'classes',
          label: 'Kelas',
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={DATASET.classes}
              columns={[
                { title: 'ID', dataIndex: 'id', width: 50 },
                { title: 'Kelas', dataIndex: 'className' },
                { title: 'Ruang', dataIndex: 'room' },
                {
                  title: 'Total JP',
                  render: (_, c) =>
                    DATASET.loads.filter((l) => l.classId === c.id).reduce((s, l) => s + l.jp, 0),
                },
              ]}
            />
          ),
        },
        {
          key: 'subjects',
          label: 'Mapel',
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={DATASET.subjects}
              columns={[
                { title: 'ID', dataIndex: 'id', width: 50 },
                { title: 'Mata Pelajaran', dataIndex: 'name' },
                { title: 'Default JP', dataIndex: 'defaultJp', width: 100 },
              ]}
            />
          ),
        },
        {
          key: 'loads',
          label: 'Beban Mengajar',
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={{ pageSize: 25 }}
              dataSource={DATASET.loads}
              columns={[
                {
                  title: 'Kelas',
                  dataIndex: 'classId',
                  render: (id: number) => DATASET.classes.find((c) => c.id === id)?.className,
                },
                { title: 'Mapel', dataIndex: 'subjectId', render: subjectName },
                {
                  title: 'Guru',
                  dataIndex: 'teacherId',
                  render: (id: number) => DATASET.teachers.find((t) => t.id === id)?.name,
                },
                { title: 'JP/minggu', dataIndex: 'jp', width: 90 },
                {
                  title: 'Penjadwalan',
                  width: 120,
                  render: (_, l: Load) =>
                    l.mergeGroupId ? (
                      <Tag color="purple">Gabungan (3 JP)</Tag>
                    ) : (
                      <Tooltip title="Manual: tidak disentuh Auto-Randomizer & Bersihkan">
                        <Switch
                          size="small"
                          checkedChildren="Manual"
                          unCheckedChildren="Auto"
                          checked={manualLoadIds.has(l.id)}
                          onChange={(checked) => onToggleManual(l.id, checked)}
                        />
                      </Tooltip>
                    ),
                },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
