// Vercel Serverless Function: GET/PUT /api/schedules — persistensi jadwal ke Neon (PostgreSQL).
// Set env DATABASE_URL (postgresql://user:pass@host/db) di Vercel + jalankan db/schema.sql & db/seed.sql.
import { neon } from '@neondatabase/serverless';

interface ScheduleRow {
  id: string;
  class_id: number;
  subject_id: number;
  teacher_id: number;
  day: number;
  time_slot: number;
  pinned: boolean;
  merge_group_id: string | null;
}

interface EntryPayload {
  id: string;
  classId: number;
  subjectId: number;
  teacherId: number;
  day: number;
  period: number;
  pinned: boolean;
  mergeGroupId?: string;
}

export default async function handler(
  req: { method?: string; body?: { entries?: EntryPayload[] } },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    setHeader: (k: string, v: string) => void;
  },
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).json(null);

  if (!process.env.DATABASE_URL)
    return res.status(500).json({ error: 'DATABASE_URL belum dikonfigurasi' });

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    const rows = (await sql`SELECT * FROM schedules`) as ScheduleRow[];
    const entries = rows.map((r) => ({
      id: r.id,
      classId: r.class_id,
      subjectId: r.subject_id,
      teacherId: r.teacher_id,
      day: r.day,
      period: r.time_slot,
      pinned: Boolean(r.pinned),
      mergeGroupId: r.merge_group_id ?? undefined,
    }));
    return res.status(200).json({ entries });
  }

  if (req.method === 'PUT') {
    const entries = req.body?.entries;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries wajib berupa array' });
    await sql.transaction((tx) => [
      tx`DELETE FROM schedules`,
      ...entries.map(
        (e) =>
          tx`INSERT INTO schedules (id, class_id, subject_id, teacher_id, day, time_slot, pinned, merge_group_id)
             VALUES (${e.id}, ${e.classId}, ${e.subjectId}, ${e.teacherId}, ${e.day}, ${e.period}, ${e.pinned}, ${e.mergeGroupId ?? null})`,
      ),
    ]);
    return res.status(200).json({ saved: entries.length });
  }

  return res.status(405).json({ error: 'Method tidak didukung' });
}
