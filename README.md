# Penjadwalan Pelajaran — SMK Tri Ratna

Aplikasi web penjadwalan pelajaran (TP 2026-2027) untuk 10 kelas AK / DKV / RPL.

**Tech stack:** Vite + React + TypeScript · Tailwind CSS + Ant Design · GSAP · Neon PostgreSQL (opsional, via serverless function Vercel).

## Fitur

- **Auto-Randomizer** — engine penjadwalan otomatis dengan hard/soft constraint dan multi-restart, memilih hasil dengan pelanggaran paling sedikit.
- **Mode Manual** — tambah slot lewat form, kunci (pin) slot agar tidak digeser Auto-Randomizer.
- **Drag & drop** — geser kartu mapel antar slot di kolom kelasnya; otomatis menukar bila slot tujuan terisi.
- **Smart Conflict & Violation Warning** — sel merah/oranye + tooltip + Conflict Log detail untuk: bentrok guru, kelas dobel, PJOK di luar Senin–Rabu / di atas jam 12.00, Mandarin di luar window guru, blok Kelas Industri, KBM di slot Ekskul Wajib Kamis, guru persiapan Sholat Jumat (soft), dan alokasi JP yang belum terpenuhi.
- **Export CSV / Excel** dan tampilan cetak (A4 landscape).

## Aturan yang diimplementasikan

- Senin–Jumat, jam 1–9 (07.15–15.00) dengan Mindful Morning, Istirahat 1, Relaksasi Total, Istirahat 2.
- **Kamis:** KBM hanya sampai jam 6 (12.00); jam 7–8 = **Kegiatan Ekskul Wajib** seluruh kelas.
- **PJOK:** hanya Senin/Selasa/Rabu, jam 1–6.
- **Gabungan PJOK (opsional, saklar di toolbar):** ON = X AK + X RPL dan XI DKV 1 + XI DKV 2 digabung (2 JP → 3 JP, slot sejajar); OFF = per kelas 2 JP. Mapel lain selalu per kelas.
- **Window guru Mandarin:** Senin 6–9, Selasa 1–9, Rabu 6–9, Kamis 6, Jumat 4–9.
- **Blok Kelas Industri:** X RPL Senin+Selasa, XI RPL Rabu+Kamis, XII RPL Jumat (JP industri yang melebihi kapasitas hari blok boleh meluber ke hari lain).
- **Soft:** Pak Sultan, Pak Deny, Pak Dicky diusahakan tidak mengajar Jumat jam 5–6 (11.00–12.00).

> **Catatan kapasitas:** beban tiap kelas pada sheet 'Pembagian Tugas' 45–46 JP, sedangkan slot KBM hanya 42/minggu (Kamis pendek). Sisa JP yang tak tertampung dilaporkan di Conflict Log sebagai "JP Kurang".

## Menjalankan

```bash
npm install
npm run dev      # development
npm run build    # production build
npm run lint     # oxlint
```

Jadwal tersimpan otomatis di `localStorage`.

## Struktur data

- `src/data/pembagianTugas.ts` — data guru/mapel/JP hasil ekstraksi sheet **'Pembagian Tugas'**.
- `src/lib/constants.ts` — struktur hari/jam & seluruh aturan penjadwalan.
- `src/lib/scheduler.ts` — Auto-Randomizer.
- `src/lib/constraints.ts` — validasi & Conflict Log.
- `db/schema.sql`, `db/seed.sql` — skema & seed PostgreSQL (Neon) (`teachers`, `classes`, `subjects`, `teaching_loads`, `schedules`).
#
