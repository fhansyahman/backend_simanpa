const { pool } = require('../config/database');
const { DateTime } = require('luxon');

const RekapModel = {
  // Get rekap kehadiran aggregated
  getRekapKehadiran: async (startDate, endDate, userId = null, wilayah = null) => {
    let query = `
      SELECT 
        u.id as user_id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        
        -- Hitung hari kerja dalam bulan ini
        (
          SELECT COUNT(*) 
          FROM (
            SELECT DATE_ADD(?, INTERVAL seq.seq DAY) as tanggal
            FROM (
              SELECT 0 as seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
              UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
              UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
              UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
              UNION SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24
              UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29
              UNION SELECT 30
            ) seq
            WHERE DATE_ADD(?, INTERVAL seq.seq DAY) <= ?
          ) dates
          LEFT JOIN hari_libur hl ON dates.tanggal = hl.tanggal
          LEFT JOIN hari_kerja hk ON dates.tanggal = hk.tanggal
          WHERE 
            (hk.id IS NULL AND DAYOFWEEK(dates.tanggal) BETWEEN 2 AND 6)
            OR 
            (hk.id IS NOT NULL AND hk.is_hari_kerja = 1)
            AND hl.id IS NULL
        ) as total_hari_kerja,
        
        COUNT(p.id) as total_presensi,
        
        SUM(CASE 
          WHEN p.izin_id IS NULL 
          AND (p.status_masuk = 'Tepat Waktu' OR p.status_masuk = 'Terlambat' OR p.status_masuk = 'Terlambat Berat')
          THEN 1 
          ELSE 0 
        END) as hadir,
        
        SUM(CASE 
          WHEN p.izin_id IS NULL AND p.status_masuk = 'Tepat Waktu' THEN 1 
          ELSE 0 
        END) as tepat_waktu,
        
        SUM(CASE 
          WHEN p.izin_id IS NULL AND (p.status_masuk = 'Terlambat' OR p.status_masuk = 'Terlambat Berat') THEN 1 
          ELSE 0 
        END) as terlambat,
        
        SUM(CASE 
          WHEN p.izin_id IS NOT NULL AND i.jenis = 'cuti' THEN 1 
          ELSE 0 
        END) as izin_cuti,
        
        SUM(CASE 
          WHEN p.izin_id IS NOT NULL AND i.jenis = 'sakit' THEN 1 
          ELSE 0 
        END) as izin_sakit,
        
        SUM(CASE 
          WHEN p.izin_id IS NOT NULL AND i.jenis = 'izin' THEN 1 
          ELSE 0 
        END) as izin_lainnya,
        
        SUM(CASE 
          WHEN p.izin_id IS NOT NULL AND i.jenis = 'dinas_luar' THEN 1 
          ELSE 0 
        END) as dinas_luar,
        
        SUM(CASE 
          WHEN p.izin_id IS NULL 
          AND (p.status_masuk = 'Tanpa Keterangan' OR p.status_masuk IS NULL) 
          THEN 1 
          ELSE 0 
        END) as tanpa_keterangan,
        
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as lembur,

        SUM(CASE 
          WHEN p.jam_masuk IS NOT NULL AND p.jam_pulang IS NULL 
          AND p.status_pulang = 'Belum Pulang' 
          THEN 1 
          ELSE 0 
        END) as belum_pulang

      FROM users u
      LEFT JOIN presensi p ON u.id = p.user_id AND p.tanggal BETWEEN ? AND ?
      LEFT JOIN izin i ON p.izin_id = i.id
      WHERE u.is_active = 1 AND u.roles = 'pegawai'
    `;

    const params = [startDate, startDate, endDate, startDate, endDate];

    if (userId) {
      query += ' AND u.id = ?';
      params.push(userId);
    }

    if (wilayah) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    query += ' GROUP BY u.id, u.nama, u.jabatan, u.wilayah_penugasan ORDER BY u.nama';

    const [rekap] = await pool.execute(query, params);
    return rekap;
  },

  // Get detail presensi user per bulan
  getDetailPresensiUser: async (userId, startDate, endDate) => {
    const [detailPresensi] = await pool.execute(
      `SELECT 
        p.tanggal,
        p.jam_masuk,
        p.jam_pulang,
        p.status_masuk,
        p.status_pulang,
        p.is_lembur,
        p.jam_lembur,
        p.keterangan,
        p.foto_masuk,
        p.foto_pulang,
        i.jenis as jenis_izin,
        i.keterangan as keterangan_izin,
        i.status as status_izin,
        i.dokumen_pendukung,
        CASE 
          WHEN p.izin_id IS NOT NULL THEN 
            CASE i.jenis
              WHEN 'cuti' THEN 'Cuti'
              WHEN 'sakit' THEN 'Sakit' 
              WHEN 'izin' THEN 'Izin'
              WHEN 'dinas_luar' THEN 'Dinas Luar'
              ELSE 'Izin'
            END
          WHEN p.status_masuk = 'Tepat Waktu' THEN 'Hadir'
          WHEN p.status_masuk = 'Terlambat' THEN 'Hadir (Terlambat)'
          WHEN p.status_masuk = 'Terlambat Berat' THEN 'Hadir (Terlambat Berat)'
          WHEN p.status_masuk = 'Tanpa Keterangan' OR p.status_masuk IS NULL THEN 'Tanpa Keterangan'
          ELSE 'Tidak Hadir'
        END as status_kehadiran,
        
        DAYNAME(p.tanggal) as nama_hari,
        hl.nama_libur,
        hk.keterangan as keterangan_hari_kerja
        
       FROM presensi p
       LEFT JOIN izin i ON p.izin_id = i.id
       LEFT JOIN hari_libur hl ON p.tanggal = hl.tanggal
       LEFT JOIN hari_kerja hk ON p.tanggal = hk.tanggal
       WHERE p.user_id = ? AND p.tanggal BETWEEN ? AND ?
       ORDER BY p.tanggal`,
      [userId, startDate, endDate]
    );
    return detailPresensi;
  },

  // Get user info
  getUserById: async (userId) => {
    const [user] = await pool.execute(
      'SELECT id, nama, jabatan, wilayah_penugasan, no_hp FROM users WHERE id = ?',
      [userId]
    );
    return user.length > 0 ? user[0] : null;
  },

  // Get hari info (libur/hari kerja)
  getHariInfo: async (tanggal) => {
    const [hariInfo] = await pool.execute(
      `SELECT 
        hl.nama_libur,
        hk.keterangan,
        hk.is_hari_kerja
       FROM (SELECT ? as tanggal) d
       LEFT JOIN hari_libur hl ON d.tanggal = hl.tanggal
       LEFT JOIN hari_kerja hk ON d.tanggal = hk.tanggal`,
      [tanggal]
    );
    return hariInfo[0];
  },

  // Get rekap harian
  getRekapHarian: async (tanggal) => {
    const [rekapHarian] = await pool.execute(
      `SELECT 
        u.id as user_id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        u.no_hp,
        p.tanggal,
        p.jam_masuk,
        p.jam_pulang,
        p.status_masuk,
        p.status_pulang,
        p.is_lembur,
        p.jam_lembur,
        p.keterangan,
        p.foto_masuk,
        p.foto_pulang,
        i.jenis as jenis_izin,
        i.keterangan as keterangan_izin,
        CASE 
          WHEN p.izin_id IS NOT NULL THEN 
            CONCAT('Izin ', UPPER(SUBSTRING(i.jenis, 1, 1)), LOWER(SUBSTRING(i.jenis, 2)))
          WHEN p.status_masuk = 'Tepat Waktu' THEN 'Hadir'
          WHEN p.status_masuk = 'Terlambat' THEN 'Terlambat'
          WHEN p.status_masuk = 'Terlambat Berat' THEN 'Terlambat Berat'
          WHEN p.status_masuk = 'Tanpa Keterangan' OR p.status_masuk IS NULL THEN 'Tanpa Keterangan'
          ELSE 'Belum Presensi'
        END as status_kehadiran
       FROM users u
       LEFT JOIN presensi p ON u.id = p.user_id AND p.tanggal = ?
       LEFT JOIN izin i ON p.izin_id = i.id
       WHERE u.is_active = 1 AND u.roles = 'pegawai'
       ORDER BY u.nama`,
      [tanggal]
    );
    return rekapHarian;
  },

  // Get info hari untuk rekap harian
  getInfoHariWithName: async (tanggal) => {
    const [hariInfo] = await pool.execute(
      `SELECT 
        hl.nama_libur,
        hk.keterangan,
        hk.is_hari_kerja,
        DAYNAME(?) as nama_hari
       FROM (SELECT ? as tanggal) d
       LEFT JOIN hari_libur hl ON d.tanggal = hl.tanggal
       LEFT JOIN hari_kerja hk ON d.tanggal = hk.tanggal`,
      [tanggal, tanggal]
    );
    return hariInfo[0];
  },

  // Get total days in month
  getDaysInMonth: (year, month) => {
    return DateTime.fromObject({ year, month }).daysInMonth;
  }
};

module.exports = RekapModel;