const { pool } = require('../config/database');

const DashboardModel = {
  // =========================
  // DASHBOARD HARI INI
  // =========================
  getDashboardHariIni: async () => {
    const today = new Date().toISOString().split('T')[0];

    const [[pegawai]] = await pool.execute(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE roles = 'pegawai'
        AND is_active = 1
        AND status = 'Aktif'
    `);

    const [[statistik]] = await pool.execute(`
      SELECT
        COUNT(DISTINCT p.user_id) AS total_hadir,
        SUM(CASE WHEN p.jam_masuk IS NOT NULL AND p.status_masuk = 'Tepat Waktu' THEN 1 ELSE 0 END) AS hadir_tepat_waktu,
        SUM(CASE WHEN p.status_masuk = 'Terlambat' THEN 1 ELSE 0 END) AS terlambat,
        SUM(CASE WHEN p.status_masuk = 'Izin' THEN 1 ELSE 0 END) AS izin,
        SUM(CASE WHEN p.status_masuk = 'Sakit' THEN 1 ELSE 0 END) AS sakit,
        SUM(CASE WHEN p.status_masuk = 'Cuti' THEN 1 ELSE 0 END) AS cuti
      FROM presensi p
      JOIN users u ON p.user_id = u.id
      WHERE p.tanggal = ?
        AND u.roles = 'pegawai'
        AND u.is_active = 1
        AND p.jam_masuk IS NOT NULL
    `, [today]);

    return { pegawai: pegawai.total || 0, statistik, today };
  },

  // =========================
  // GRAFIK KEHADIRAN BULANAN
  // =========================
  getGrafikHadirBulanan: async (tahun, bulan, wilayah) => {
    let query = `
      SELECT
        MONTH(p.tanggal) AS bulan,
        COUNT(DISTINCT p.user_id) AS total_hadir,
        COUNT(DISTINCT u.id) AS total_pegawai,
        SUM(CASE WHEN p.jam_masuk IS NOT NULL AND p.status_masuk = 'Tepat Waktu' THEN 1 ELSE 0 END) AS hadir_tepat_waktu,
        SUM(CASE WHEN p.status_masuk = 'Terlambat' THEN 1 ELSE 0 END) AS terlambat,
        SUM(CASE WHEN p.status_masuk = 'Izin' THEN 1 ELSE 0 END) AS izin,
        SUM(CASE WHEN p.status_masuk = 'Sakit' THEN 1 ELSE 0 END) AS sakit,
        SUM(CASE WHEN p.status_masuk = 'Cuti' THEN 1 ELSE 0 END) AS cuti
      FROM presensi p
      JOIN users u ON p.user_id = u.id
      WHERE YEAR(p.tanggal) = ?
        AND MONTH(p.tanggal) = ?
        AND u.roles = 'pegawai'
        AND u.is_active = 1
    `;

    const params = [tahun, bulan];

    if (wilayah !== 'all') {
      query += ` AND u.wilayah_penugasan = ?`;
      params.push(wilayah);
    }

    query += ` GROUP BY MONTH(p.tanggal)`;

    const [[data]] = await pool.execute(query, params);

    let totalQuery = `
      SELECT COUNT(*) AS total
      FROM users u
      WHERE u.roles = 'pegawai'
        AND u.is_active = 1
    `;
    
    const totalParams = [];
    
    if (wilayah !== 'all') {
      totalQuery += ` AND u.wilayah_penugasan = ?`;
      totalParams.push(wilayah);
    }
    
    const [[totalData]] = await pool.execute(totalQuery, totalParams);

    return { data, totalData: totalData.total || 0 };
  },

  // =========================
  // PEGAWAI BELUM ABSEN
  // =========================
  getPegawaiBelumAbsen: async (today) => {
    const [belumAbsen] = await pool.execute(`
      SELECT 
        u.id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        'Belum melakukan absen hari ini' AS keterangan
      FROM users u
      WHERE u.roles = 'pegawai'
        AND u.is_active = 1
        AND u.status = 'Aktif'
        AND u.id NOT IN (
          SELECT user_id
          FROM presensi
          WHERE tanggal = ?
            AND jam_masuk IS NOT NULL
        )
      ORDER BY u.nama ASC
    `, [today]);

    return belumAbsen;
  },

  // =========================
  // DAFTAR WILAYAH
  // =========================
  getDaftarWilayah: async () => {
    const [wilayah] = await pool.execute(`
      SELECT DISTINCT wilayah_penugasan
      FROM users
      WHERE roles = 'pegawai'
        AND is_active = 1
        AND wilayah_penugasan IS NOT NULL
        AND wilayah_penugasan != ''
      ORDER BY wilayah_penugasan ASC
    `);

    return wilayah;
  },

  // =========================
  // GRAFIK KINERJA BULANAN
  // =========================
  getGrafikKinerjaBulanan: async (tahun) => {
    const [kinerjaPerBulan] = await pool.execute(`
      SELECT
        MONTH(tanggal) AS bulan,
        SUM(COALESCE(panjang_kr, 0) + COALESCE(panjang_kn, 0)) AS realisasi,
        COUNT(DISTINCT user_id) AS jumlah_pegawai
      FROM kinerja_harian
      WHERE YEAR(tanggal) = ?
      GROUP BY MONTH(tanggal)
      ORDER BY bulan ASC
    `, [tahun]);

    const [[pegawai]] = await pool.execute(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE roles = 'pegawai'
        AND is_active = 1
        AND status = 'Aktif'
    `);

    return { kinerjaPerBulan, totalPegawai: pegawai.total || 0 };
  },

  // =========================
  // DASHBOARD KINERJA HARI INI
  // =========================
  getDashboardKinerjaHariIni: async (today) => {
    const todayDate = new Date(today);
    const dayOfWeek = todayDate.getDay();

    const [hariLibur] = await pool.execute(
      `SELECT id, nama_libur, is_tahunan, tanggal
       FROM hari_libur
       WHERE (tanggal = ? OR (is_tahunan = 1 AND DATE_FORMAT(tanggal, '%m-%d') = DATE_FORMAT(?, '%m-%d')))
       LIMIT 1`,
      [today, today]
    );

    const [hariKerjaCustom] = await pool.execute(
      `SELECT is_hari_kerja
       FROM hari_kerja
       WHERE tanggal = ?
       LIMIT 1`,
      [today]
    );

    const [[pegawai]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE roles = 'pegawai'
         AND is_active = 1
         AND status = 'Aktif'`
    );

    const [[sudahLapor]] = await pool.execute(
      `SELECT COUNT(DISTINCT user_id) AS total
       FROM kinerja_harian
       WHERE tanggal = ?
         AND (panjang_kr > 0 OR panjang_kn > 0)`,
      [today]
    );

    const [belumLapor] = await pool.execute(
      `SELECT 
         u.id,
         u.nama,
         u.jabatan,
         u.wilayah_penugasan,
         'Belum lapor kinerja hari ini' AS keterangan
       FROM users u
       WHERE u.roles = 'pegawai'
         AND u.is_active = 1
         AND u.status = 'Aktif'
         AND u.id NOT IN (
           SELECT user_id
           FROM kinerja_harian
           WHERE tanggal = ?
             AND (panjang_kr > 0 OR panjang_kn > 0)
         )
       ORDER BY u.nama ASC`,
      [today]
    );

    const [topPerformers] = await pool.execute(
      `SELECT 
         u.id,
         u.nama,
         u.jabatan,
         u.wilayah_penugasan,
         kh.panjang_kr,
         kh.panjang_kn,
         (COALESCE(kh.panjang_kr, 0) + COALESCE(kh.panjang_kn, 0)) AS total_kinerja,
         ROUND((COALESCE(kh.panjang_kr, 0) + COALESCE(kh.panjang_kn, 0)) / 50 * 100, 2) AS persentase_capaian
       FROM kinerja_harian kh
       JOIN users u ON kh.user_id = u.id
       WHERE kh.tanggal = ?
         AND u.roles = 'pegawai'
         AND u.is_active = 1
         AND (kh.panjang_kr > 0 OR kh.panjang_kn > 0)
       ORDER BY total_kinerja DESC
       LIMIT 10`,
      [today]
    );

    return { hariLibur, hariKerjaCustom, dayOfWeek, pegawai: pegawai.total, sudahLapor: sudahLapor.total, belumLapor, topPerformers };
  },

  // =========================
  // DASHBOARD KEHADIRAN BY DATE (TAMBAHAN)
  // =========================
  getDashboardKehadiranByDate: async (tanggal) => {
    const [[pegawai]] = await pool.execute(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE roles = 'pegawai'
        AND is_active = 1
        AND status = 'Aktif'
    `);

    const [[hadirStat]] = await pool.execute(`
      SELECT
        COUNT(DISTINCT user_id) AS hadir,
        SUM(CASE WHEN status_masuk = 'Tepat Waktu' THEN 1 ELSE 0 END) AS tepat_waktu,
        SUM(CASE WHEN status_masuk = 'Terlambat' THEN 1 ELSE 0 END) AS terlambat
      FROM presensi
      WHERE tanggal = ?
        AND jam_masuk IS NOT NULL
    `, [tanggal]);

    const [[izinStat]] = await pool.execute(`
      SELECT
        COUNT(DISTINCT CASE 
          WHEN izin_id IS NOT NULL AND keterangan LIKE '%Izin%' AND jam_masuk IS NULL 
          THEN user_id 
        END) AS izin,
        COUNT(DISTINCT CASE 
          WHEN izin_id IS NOT NULL AND keterangan LIKE '%Sakit%' AND jam_masuk IS NULL 
          THEN user_id 
        END) AS sakit,
        COUNT(DISTINCT CASE 
          WHEN izin_id IS NOT NULL AND keterangan LIKE '%Cuti%' AND jam_masuk IS NULL 
          THEN user_id 
        END) AS cuti
      FROM presensi
      WHERE tanggal = ?
    `, [tanggal]);

    return { pegawai: pegawai.total || 0, hadirStat, izinStat };
  },

  // =========================
  // PEGAWAI BELUM ABSEN WITH EXCLUDE IZIN (TAMBAHAN)
  // =========================
  getPegawaiBelumAbsenExcludeIzin: async (tanggal) => {
    const [belumAbsen] = await pool.execute(`
      SELECT 
        u.id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        'Belum melakukan absen hari ini' AS keterangan
      FROM users u
      WHERE u.roles = 'pegawai'
        AND u.is_active = 1
        AND u.status = 'Aktif'
        AND u.id NOT IN (
          SELECT user_id
          FROM presensi
          WHERE tanggal = ?
            AND jam_masuk IS NOT NULL
        )
        AND u.id NOT IN (
          SELECT user_id
          FROM presensi
          WHERE tanggal = ?
            AND izin_id IS NOT NULL
            AND jam_masuk IS NULL
        )
      ORDER BY u.nama ASC
    `, [tanggal, tanggal]);

    return belumAbsen;
  },

  // =========================
  // PRESENSI HARIAN BY DATE (TAMBAHAN)
  // =========================
  getPresensiHarianByDate: async (tanggal) => {
    const [presensi] = await pool.execute(`
      SELECT 
        p.id,
        p.user_id AS pegawai_id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        p.tanggal,
        p.jam_masuk,
        p.jam_pulang,
        p.status_masuk,
        p.status_pulang,
        p.foto_masuk,
        p.foto_pulang,
        p.lokasi_masuk,
        p.lokasi_pulang,
        p.keterangan,
        p.izin_id,
        p.status_kehadiran
      FROM presensi p
      JOIN users u ON p.user_id = u.id
      WHERE p.tanggal = ?
        AND u.roles = 'pegawai'
        AND u.is_active = 1
      ORDER BY u.nama ASC
    `, [tanggal]);

    return presensi;
  },

  // =========================
  // DASHBOARD KINERJA BY DATE (TAMBAHAN)
  // =========================
  getDashboardKinerjaByDate: async (tanggal) => {
    const todayDate = new Date(tanggal);
    const dayOfWeek = todayDate.getDay();

    const [hariLibur] = await pool.execute(
      `SELECT id, nama_libur, is_tahunan, tanggal
       FROM hari_libur
       WHERE (tanggal = ? OR (is_tahunan = 1 AND DATE_FORMAT(tanggal, '%m-%d') = DATE_FORMAT(?, '%m-%d')))
       LIMIT 1`,
      [tanggal, tanggal]
    );

    const [hariKerjaCustom] = await pool.execute(
      `SELECT is_hari_kerja
       FROM hari_kerja
       WHERE tanggal = ?
       LIMIT 1`,
      [tanggal]
    );

    const [[pegawai]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE roles = 'pegawai'
         AND is_active = 1
         AND status = 'Aktif'`
    );

    const [[sudahLapor]] = await pool.execute(
      `SELECT COUNT(DISTINCT user_id) AS total
       FROM kinerja_harian
       WHERE tanggal = ?
         AND (panjang_kr > 0 OR panjang_kn > 0)`,
      [tanggal]
    );

    const [belumLapor] = await pool.execute(
      `SELECT 
         u.id,
         u.nama,
         u.jabatan,
         u.wilayah_penugasan,
         'Belum lapor kinerja hari ini' AS keterangan
       FROM users u
       WHERE u.roles = 'pegawai'
         AND u.is_active = 1
         AND u.status = 'Aktif'
         AND u.id NOT IN (
           SELECT user_id
           FROM kinerja_harian
           WHERE tanggal = ?
             AND (panjang_kr > 0 OR panjang_kn > 0)
         )
       ORDER BY u.nama ASC`,
      [tanggal]
    );

    const [topPerformers] = await pool.execute(
      `SELECT 
         u.id,
         u.nama,
         u.jabatan,
         u.wilayah_penugasan,
         kh.panjang_kr,
         kh.panjang_kn,
         (COALESCE(kh.panjang_kr, 0) + COALESCE(kh.panjang_kn, 0)) AS total_kinerja,
         ROUND((COALESCE(kh.panjang_kr, 0) + COALESCE(kh.panjang_kn, 0)) / 50 * 100, 2) AS persentase_capaian
       FROM kinerja_harian kh
       JOIN users u ON kh.user_id = u.id
       WHERE kh.tanggal = ?
         AND u.roles = 'pegawai'
         AND u.is_active = 1
         AND (kh.panjang_kr > 0 OR kh.panjang_kn > 0)
       ORDER BY total_kinerja DESC
       LIMIT 10`,
      [tanggal]
    );

    return { hariLibur, hariKerjaCustom, dayOfWeek, pegawai: pegawai.total, sudahLapor: sudahLapor.total, belumLapor, topPerformers };
  },

  // =========================
  // PEGAWAI IZIN/SAKIT/CUTI BERDASARKAN TANGGAL (TAMBAHAN)
  // =========================
  getPegawaiIzinByDate: async (tanggal) => {
    const [pegawaiIzin] = await pool.execute(`
      SELECT 
        u.id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        p.keterangan,
        p.izin_id,
        CASE 
          WHEN p.keterangan LIKE '%Izin%' THEN 'Izin'
          WHEN p.keterangan LIKE '%Sakit%' THEN 'Sakit'
          WHEN p.keterangan LIKE '%Cuti%' THEN 'Cuti'
          ELSE 'Izin Lainnya'
        END AS jenis_izin
      FROM users u
      JOIN presensi p ON u.id = p.user_id
      WHERE u.roles = 'pegawai'
        AND u.is_active = 1
        AND u.status = 'Aktif'
        AND p.tanggal = ?
        AND p.izin_id IS NOT NULL
        AND p.jam_masuk IS NULL
      ORDER BY u.nama ASC
    `, [tanggal]);

    return pegawaiIzin;
  }
};

module.exports = DashboardModel;