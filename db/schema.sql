-- Skema PostgreSQL (Neon) untuk aplikasi Penjadwalan Pelajaran SMK Tri Ratna.
-- Jalankan di Neon SQL Editor, lalu jalankan db/seed.sql.

CREATE TABLE IF NOT EXISTS teachers (
  id INT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '',
  -- Daftar id mapel yang diampu, disimpan sebagai JSON array (mis. [1,2,3]).
  subject_ids JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id INT PRIMARY KEY,
  class_name VARCHAR(30) NOT NULL UNIQUE,
  room VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id INT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  default_jp INT NOT NULL DEFAULT 2
);

-- Beban mengajar mingguan (hasil sheet 'Pembagian Tugas').
CREATE TABLE IF NOT EXISTS teaching_loads (
  id SERIAL PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id),
  subject_id INT NOT NULL REFERENCES subjects(id),
  teacher_id INT NOT NULL REFERENCES teachers(id),
  jp INT NOT NULL,
  merge_group_id VARCHAR(40)
);

CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(60) PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id),
  subject_id INT NOT NULL REFERENCES subjects(id),
  teacher_id INT NOT NULL REFERENCES teachers(id),
  -- day: 1=Senin ... 5=Jumat; time_slot: jam ke-1..9.
  day SMALLINT NOT NULL,
  time_slot SMALLINT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  merge_group_id VARCHAR(40),
  UNIQUE (class_id, day, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_teacher_slot ON schedules (teacher_id, day, time_slot);
