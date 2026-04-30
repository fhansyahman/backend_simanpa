const { pool } = require('../config/database');

const PresensiModel = {
  // Check existing presensi
  checkExistingPresensi: async (userId, tanggal) => {
    const [existing] = await pool.execute(
      'SELECT id, izin_id, jam_masuk, status_masuk FROM presensi WHERE user_id = ? AND tanggal = ?',
      [userId, tanggal]
    );
    return existing;
  },

  // Get all active users
  getAllActiveUsers: async () => {
    const [users] = await pool.execute(
      `SELECT u.id, u.nama, u.wilayah_penugasan 
       FROM users u 
       WHERE u.is_active = 1 AND u.roles = 'pegawai'
       ORDER BY u.nama`
    );
    return users;
  },

  // Get presensi for date
  getPresensiForDate: async (tanggal) => {
    const [presensi] = await pool.execute(
      'SELECT id, user_id, izin_id, jam_masuk, status_masuk, keterangan, penugasan_id FROM presensi WHERE tanggal = ?',
      [tanggal]
    );
    return presensi;
  },

  // Get izin detail
  getIzinDetail: async (izinId) => {
    const [izinDetail] = await pool.execute(
      'SELECT jenis, status FROM izin WHERE id = ?',
      [izinId]
    );
    return izinDetail;
  },

  // Update presensi with izin
  updatePresensiWithIzin: async (izinId, statusIzin, keterangan, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        izin_id = ?, 
        status_masuk = ?, 
        status_pulang = ?, 
        keterangan = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [izinId, statusIzin, statusIzin, keterangan, id]
    );
  },

  // Update presensi penugasan
  updatePresensiPenugasan: async (penugasanId, isPenugasanKhusus, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        penugasan_id = ?,
        is_penugasan_khusus = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [penugasanId, isPenugasanKhusus ? 1 : 0, id]
    );
  },

  // Insert presensi with izin
  insertPresensiWithIzin: async (userId, tanggal, penugasanId, izinId, statusIzin, keterangan) => {
    const [result] = await pool.execute(
      `INSERT INTO presensi 
       (user_id, tanggal, penugasan_id, izin_id, status_masuk, status_pulang, is_system_generated, keterangan, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [userId, tanggal, penugasanId, izinId, statusIzin, statusIzin, keterangan]
    );
    return result;
  },

  // Insert presensi no status
  insertPresensiNoStatus: async (userId, tanggal, penugasanId, isPenugasanKhusus) => {
    const [result] = await pool.execute(
      `INSERT INTO presensi 
       (user_id, tanggal, penugasan_id, is_penugasan_khusus, is_system_generated, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
      [userId, tanggal, penugasanId, isPenugasanKhusus ? 1 : 0]
    );
    return result;
  },

  // Insert system log
  insertSystemLog: async (eventType, description, userId) => {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      [eventType, description, userId]
    );
  },

  // Get presensi without checkin
  getPresensiWithoutCheckin: async (tanggal) => {
    const [presensiList] = await pool.execute(
      `SELECT p.id, p.user_id, p.izin_id, p.jam_masuk, p.status_masuk, p.keterangan, u.nama
       FROM presensi p
       JOIN users u ON p.user_id = u.id
       WHERE p.tanggal = ? 
         AND u.is_active = 1
         AND p.jam_masuk IS NULL`,
      [tanggal]
    );
    return presensiList;
  },

  // Update presensi end of day
  updatePresensiEndOfDay: async (status, keterangan, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        status_masuk = ?, 
        status_pulang = ?,
        keterangan = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [status, status, keterangan, id]
    );
  },

  // Update presensi with izin end of day
  updatePresensiWithIzinEndOfDay: async (izinId, status, keterangan, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        izin_id = ?,
        status_masuk = ?, 
        status_pulang = ?,
        keterangan = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [izinId, status, status, keterangan, id]
    );
  },

  // Get users with izin
  getUsersWithIzin: async (tanggal) => {
    const [usersWithIzin] = await pool.execute(
      `SELECT DISTINCT u.id, u.nama, i.id as izin_id, i.jenis
       FROM users u
       JOIN izin i ON u.id = i.user_id
       WHERE u.is_active = 1 
         AND u.roles = 'pegawai'
         AND i.status = 'Disetujui'
         AND DATE(?) BETWEEN DATE(i.tanggal_mulai) AND DATE(i.tanggal_selesai)`,
      [tanggal]
    );
    return usersWithIzin;
  },

  // Get presensi by user and date
  getPresensiByUserAndDate: async (userId, tanggal) => {
    const [presensi] = await pool.execute(
      'SELECT id, izin_id, status_masuk, penugasan_id FROM presensi WHERE user_id = ? AND tanggal = ?',
      [userId, tanggal]
    );
    return presensi;
  },

  // Update presensi with penugasan and izin
  updatePresensiWithPenugasanAndIzin: async (penugasanId, isPenugasanKhusus, izinId, statusIzin, keterangan, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        penugasan_id = ?,
        is_penugasan_khusus = ?,
        izin_id = ?,
        status_masuk = ?,
        status_pulang = ?,
        keterangan = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [penugasanId, isPenugasanKhusus ? 1 : 0, izinId, statusIzin, statusIzin, keterangan, id]
    );
  },

  // Update presensi masuk
  updatePresensiMasuk: async (penugasanId, isPenugasanKhusus, jamMasuk, fotoMasuk, latitudeMasuk, longitudeMasuk, statusMasuk, keterangan, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        penugasan_id = ?,
        is_penugasan_khusus = ?,
        jam_masuk = ?, 
        foto_masuk = ?, 
        latitude_masuk = ?, 
        longitude_masuk = ?,
        status_masuk = ?,
        keterangan = COALESCE(?, keterangan),
        updated_at = NOW()
       WHERE id = ?`,
      [penugasanId, isPenugasanKhusus ? 1 : 0, jamMasuk, fotoMasuk, latitudeMasuk, longitudeMasuk, statusMasuk, keterangan, id]
    );
  },

  // Get presensi for pulang
  getPresensiForPulang: async (userId, tanggal) => {
    const [presensi] = await pool.execute(
      'SELECT * FROM presensi WHERE user_id = ? AND tanggal = ?',
      [userId, tanggal]
    );
    return presensi;
  },

  // Update presensi pulang
  updatePresensiPulang: async (jamPulang, fotoPulang, latitudePulang, longitudePulang, statusPulang, isLembur, jamLembur, keterangan, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        jam_pulang = ?, 
        foto_pulang = ?, 
        latitude_pulang = ?, 
        longitude_pulang = ?,
        status_pulang = ?, 
        is_lembur = ?, 
        jam_lembur = ?, 
        keterangan = COALESCE(?, keterangan),
        updated_at = NOW()
       WHERE id = ?`,
      [jamPulang, fotoPulang, latitudePulang, longitudePulang, statusPulang, isLembur, jamLembur, keterangan, id]
    );
  },

  // Get presensi today with joins
  getPresensiTodayWithJoins: async (userId, tanggal) => {
    const [presensi] = await pool.execute(
      `SELECT p.*, u.nama, u.jabatan, i.jenis as jenis_izin,
              pg.nama_penugasan, pg.tipe_penugasan
       FROM presensi p 
       JOIN users u ON p.user_id = u.id 
       LEFT JOIN izin i ON p.izin_id = i.id
       LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
       WHERE p.user_id = ? AND p.tanggal = ?`,
      [userId, tanggal]
    );
    return presensi;
  },

  // Get all presensi user
  getAllPresensiUser: async (userId) => {
    const [presensi] = await pool.execute(
      `SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan,
              i.jenis as jenis_izin, i.status as status_izin,
              pg.nama_penugasan, pg.tipe_penugasan,
              pg.jam_masuk as jam_masuk_standar, pg.jam_pulang as jam_pulang_standar
       FROM presensi p 
       LEFT JOIN users u ON p.user_id = u.id 
       LEFT JOIN izin i ON p.izin_id = i.id
       LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
       WHERE p.user_id = ?
       ORDER BY p.tanggal DESC`,
      [userId]
    );
    return presensi;
  },

  // Get presensi user per bulan
  getPresensiUserPerBulan: async (userId, startDate, endDate) => {
    const [presensi] = await pool.execute(
      `SELECT 
        p.*, 
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        i.jenis as jenis_izin, 
        i.status as status_izin,
        pg.nama_penugasan, 
        pg.tipe_penugasan,
        pg.jam_masuk as jam_masuk_standar, 
        pg.jam_pulang as jam_pulang_standar
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      LEFT JOIN izin i ON p.izin_id = i.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE p.user_id = ? 
        AND p.tanggal BETWEEN ? AND ?
      ORDER BY p.tanggal DESC`,
      [userId, startDate, endDate]
    );
    return presensi;
  },

  // Get available years for presensi
  getAvailableYearsPresensi: async (userId) => {
    const [availableYearsData] = await pool.execute(
      `SELECT DISTINCT YEAR(tanggal) as tahun 
       FROM presensi 
       WHERE user_id = ? 
       ORDER BY tahun DESC`,
      [userId]
    );
    return availableYearsData;
  },

  // Get count presensi for date
  getCountPresensiForDate: async (tanggal) => {
    const [count] = await pool.execute(
      'SELECT COUNT(*) as total FROM presensi WHERE tanggal = ?',
      [tanggal]
    );
    return count;
  },

  // Get count presensi for date range
  getCountPresensiForDateRange: async (startDate, endDate) => {
    const [count] = await pool.execute(
      'SELECT COUNT(*) as total FROM presensi WHERE tanggal BETWEEN ? AND ?',
      [startDate, endDate]
    );
    return count;
  },

  // Get all presensi for admin
  getAllPresensiAdmin: async (userId, tanggal, wilayah, status_masuk, limit, offset) => {
    let query = `
      SELECT 
        p.*, 
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        i.jenis as jenis_izin, 
        i.status as status_izin,
        pg.nama_penugasan, 
        pg.tipe_penugasan,
        pg.jam_masuk as jam_masuk_standar, 
        pg.jam_pulang as jam_pulang_standar
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      LEFT JOIN izin i ON p.izin_id = i.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE u.is_active = 1
      AND p.user_id = ?
    `;
    
    const params = [userId];

    if (tanggal) {
      query += ` AND p.tanggal = ?`;
      params.push(tanggal);
    }

    if (wilayah && wilayah !== '') {
      query += ` AND u.wilayah_penugasan = ?`;
      params.push(wilayah);
    }

    if (status_masuk && status_masuk !== '') {
      if (status_masuk === 'Izin') {
        query += ` AND (p.izin_id IS NOT NULL OR p.status_masuk = 'Izin')`;
      } else {
        query += ` AND p.status_masuk = ? AND p.izin_id IS NULL`;
        params.push(status_masuk);
      }
    }

    query += ` ORDER BY p.tanggal DESC`;

    if (limit) {
      query += ` LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));
    }

    const [presensi] = await pool.execute(query, params);
    return presensi;
  },

  // Count all presensi for admin
  countAllPresensiAdmin: async (userId, tanggal, wilayah, status_masuk) => {
    let query = `
      SELECT COUNT(*) as total
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      WHERE u.is_active = 1
      AND p.user_id = ?
    `;
    
    const params = [userId];
    
    if (tanggal) {
      query += ` AND p.tanggal = ?`;
      params.push(tanggal);
    }
    if (wilayah && wilayah !== '') {
      query += ` AND u.wilayah_penugasan = ?`;
      params.push(wilayah);
    }
    if (status_masuk && status_masuk !== '') {
      if (status_masuk === 'Izin') {
        query += ` AND (p.izin_id IS NOT NULL OR p.status_masuk = 'Izin')`;
      } else {
        query += ` AND p.status_masuk = ? AND p.izin_id IS NULL`;
        params.push(status_masuk);
      }
    }

    const [totalCount] = await pool.execute(query, params);
    return totalCount;
  },

  // Get all presensi per bulan for admin
  getAllPresensiPerBulanAdmin: async (startDate, endDate, wilayah) => {
    let query = `
      SELECT 
        p.*, 
        u.id as user_id,
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        i.jenis as jenis_izin, 
        i.status as status_izin,
        pg.nama_penugasan, 
        pg.tipe_penugasan,
        DATE_FORMAT(p.tanggal, '%Y-%m-%d') as tanggal,
        DATE_FORMAT(p.tanggal, '%d %M %Y') as tanggal_formatted,
        DATE_FORMAT(p.tanggal, '%W') as hari
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      LEFT JOIN izin i ON p.izin_id = i.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE DATE(p.tanggal) BETWEEN ? AND ?
        AND u.is_active = 1
        AND u.roles = 'pegawai'
    `;
    
    const params = [startDate, endDate];

    if (wilayah && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    query += ' ORDER BY u.nama ASC, p.tanggal DESC';
    
    const [presensi] = await pool.execute(query, params);
    return presensi;
  },

  // Get all active pegawai
  getAllActivePegawai: async (wilayah) => {
    let query = `
      SELECT id, nama, jabatan, wilayah_penugasan
      FROM users 
      WHERE is_active = 1 AND roles = 'pegawai'
    `;
    
    const params = [];

    if (wilayah && wilayah !== '') {
      query += ' AND wilayah_penugasan = ?';
      params.push(wilayah);
    }
    
    query += ' ORDER BY nama ASC';
    
    const [pegawaiList] = await pool.execute(query, params);
    return pegawaiList;
  },

  // Get rekap presensi
  getRekapPresensi: async (startDate, endDate, wilayah) => {
    let query = `
      SELECT 
        u.id as user_id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        COUNT(p.id) as total_presensi,
        SUM(CASE WHEN p.status_masuk = 'Tepat Waktu' THEN 1 ELSE 0 END) as tepat_waktu,
        SUM(CASE WHEN p.status_masuk LIKE 'Terlambat%' THEN 1 ELSE 0 END) as terlambat,
        SUM(CASE WHEN p.status_masuk = 'Tanpa Keterangan' THEN 1 ELSE 0 END) as tanpa_keterangan,
        SUM(CASE WHEN p.izin_id IS NOT NULL THEN 1 ELSE 0 END) as izin,
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as lembur
      FROM users u
      LEFT JOIN presensi p ON u.id = p.user_id AND p.tanggal BETWEEN ? AND ?
      WHERE u.is_active = 1 AND u.roles = 'pegawai'
    `;
    const params = [startDate, endDate];

    if (wilayah) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    query += ' GROUP BY u.id, u.nama, u.jabatan, u.wilayah_penugasan ORDER BY u.nama';
    
    const [rekap] = await pool.execute(query, params);
    return rekap;
  },

  // Get presensi for range fix
  getPresensiForRangeFix: async (startDate, endDate) => {
    const [presensiList] = await pool.execute(
      `SELECT p.id, p.user_id, p.tanggal, p.izin_id, p.status_masuk, i.jenis as jenis_izin, i.status as status_izin
       FROM presensi p
       LEFT JOIN izin i ON p.izin_id = i.id
       WHERE p.tanggal BETWEEN ? AND ?`,
      [startDate, endDate]
    );
    return presensiList;
  },

  // Fix presensi with izin
  fixPresensiWithIzin: async (izinId, statusIzin, keterangan, id) => {
    await pool.execute(
      `UPDATE presensi SET 
        izin_id = ?,
        status_masuk = ?,
        status_pulang = ?,
        keterangan = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [izinId, statusIzin, statusIzin, keterangan, id]
    );
  },

  // Fix presensi remove izin
  fixPresensiRemoveIzin: async (id) => {
    await pool.execute(
      `UPDATE presensi SET 
        izin_id = NULL,
        status_masuk = 'Tanpa Keterangan',
        status_pulang = 'Tanpa Keterangan',
        keterangan = CONCAT(COALESCE(keterangan, ''), ' - Fixed: Izin tidak disetujui'),
        updated_at = NOW()
       WHERE id = ?`,
      [id]
    );
  },

  // Get generate stats
  getGenerateStats: async (startDate, endDate) => {
    const [generateStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_generated,
        SUM(CASE WHEN is_system_generated = 1 THEN 1 ELSE 0 END) as system_generated,
        SUM(CASE WHEN izin_id IS NOT NULL THEN 1 ELSE 0 END) as dengan_izin,
        SUM(CASE WHEN izin_id IS NULL AND status_masuk = 'Tanpa Keterangan' THEN 1 ELSE 0 END) as tanpa_keterangan
       FROM presensi 
       WHERE tanggal BETWEEN ? AND ? AND is_system_generated = 1`,
      [startDate, endDate]
    );
    return generateStats;
  },

  // Get hari kerja stats
  getHariKerjaStats: async (startDate, endDate) => {
    const [hariKerjaStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_hari,
        SUM(CASE WHEN hl.id IS NOT NULL THEN 1 ELSE 0 END) as hari_libur,
        SUM(CASE WHEN hk.id IS NOT NULL AND hk.is_hari_kerja = 1 THEN 1 ELSE 0 END) as hari_kerja_khusus,
        SUM(CASE WHEN hl.id IS NULL AND hk.id IS NULL AND DAYOFWEEK(dates.tanggal) BETWEEN 2 AND 6 THEN 1 ELSE 0 END) as hari_kerja_normal
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
       LEFT JOIN hari_kerja hk ON dates.tanggal = hk.tanggal`,
      [startDate, startDate, endDate]
    );
    return hariKerjaStats;
  },

  // Get generate logs
  getGenerateLogs: async (startDate, endDate) => {
    const [generateLogs] = await pool.execute(
      `SELECT event_type, description, created_at 
       FROM system_log 
       WHERE event_type IN ('GENERATE_PRESENSI', 'ADMIN_GENERATE_PRESENSI', 'EMERGENCY_GENERATE', 'FIX_PRESENSI_DATA', 'UPDATE_PRESENSI_END_DAY')
       AND created_at BETWEEN ? AND ?
       ORDER BY created_at DESC 
       LIMIT 10`,
      [startDate, endDate]
    );
    return generateLogs;
  },

  // Get all pegawai for dashboard
  getAllPegawaiForDashboard: async () => {
    const [allPegawai] = await pool.execute(
      `SELECT id, nama, jabatan, wilayah_penugasan 
       FROM users 
       WHERE is_active = 1 
       ORDER BY wilayah_penugasan, nama`
    );
    return allPegawai;
  },

  // Get presensi with user for date
  getPresensiWithUserForDate: async (tanggal) => {
    const [presensiHariIni] = await pool.execute(
      `SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM presensi p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.tanggal = ?
       ORDER BY u.wilayah_penugasan, u.nama`,
      [tanggal]
    );
    return presensiHariIni;
  },

  // Get active izin for date detailed
  getActiveIzinForDateDetailed: async (tanggal) => {
    const [izinAktif] = await pool.execute(
      `SELECT i.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM izin i 
       JOIN users u ON i.user_id = u.id 
       WHERE i.status = 'Disetujui'
         AND u.is_active = 1
         AND DATE(?) BETWEEN DATE(i.tanggal_mulai) AND DATE(i.tanggal_selesai)
       ORDER BY u.wilayah_penugasan, u.nama`,
      [tanggal]
    );
    return izinAktif;
  },

  // Get kinerja for date detailed
  getKinerjaForDateDetailed: async (tanggal) => {
    const [kinerjaHariIni] = await pool.execute(
      `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM kinerja_harian k 
       JOIN users u ON k.user_id = u.id 
       WHERE DATE(k.tanggal) = ?
         AND u.is_active = 1
       ORDER BY u.wilayah_penugasan, u.nama`,
      [tanggal]
    );
    return kinerjaHariIni;
  },

  // Get presensi by date only
  getPresensiByDateOnly: async (tanggal) => {
    const [presensiHariIni] = await pool.execute(
      'SELECT user_id FROM presensi WHERE tanggal = ?',
      [tanggal]
    );
    return presensiHariIni;
  },

  // Get active izin simple
  getActiveIzinSimple: async (tanggal) => {
    const [izinAktif] = await pool.execute(
      `SELECT user_id, jenis FROM izin 
       WHERE status = 'Disetujui'
         AND DATE(?) BETWEEN DATE(tanggal_mulai) AND DATE(tanggal_selesai)`,
      [tanggal]
    );
    return izinAktif;
  },

  // Get hari kerja by tanggal
  getHariKerjaByTanggal: async (tanggal) => {
    const [hariKerja] = await pool.execute(
      'SELECT * FROM hari_kerja WHERE tanggal = ?',
      [tanggal]
    );
    return hariKerja;
  },

  // Get hari libur by tanggal
  getHariLiburByTanggal: async (tanggal) => {
    const [hariLibur] = await pool.execute(
      'SELECT * FROM hari_libur WHERE tanggal = ?',
      [tanggal]
    );
    return hariLibur;
  },

  // Get user izin by tanggal
  getUserIzinByTanggal: async (userId, tanggal) => {
    const [izin] = await pool.execute(
      `SELECT i.id, i.jenis, i.status 
       FROM izin i 
       WHERE i.user_id = ? 
         AND i.status = 'Disetujui'
         AND DATE(?) BETWEEN DATE(i.tanggal_mulai) AND DATE(i.tanggal_selesai)`,
      [userId, tanggal]
    );
    return izin;
  },

  // Get last cron log
  getLastCronLog: async () => {
    const [lastCron] = await pool.execute(
      `SELECT event_type, description, created_at FROM system_log 
       WHERE event_type LIKE '%GENERATE%' OR event_type LIKE '%UPDATE%' OR event_type LIKE '%CRON%'
       ORDER BY created_at DESC LIMIT 1`
    );
    return lastCron;
  },

  // Get today stats
  getTodayStats: async (tanggal) => {
    const [todayStats] = await pool.execute(
      `SELECT 
        SUM(CASE WHEN status_masuk = 'Tepat Waktu' THEN 1 ELSE 0 END) as tepat_waktu,
        SUM(CASE WHEN status_masuk LIKE 'Terlambat%' THEN 1 ELSE 0 END) as terlambat,
        SUM(CASE WHEN status_masuk = 'Tanpa Keterangan' THEN 1 ELSE 0 END) as tanpa_keterangan,
        SUM(CASE WHEN izin_id IS NOT NULL THEN 1 ELSE 0 END) as izin,
        COUNT(*) as total
       FROM presensi 
       WHERE tanggal = ?`,
      [tanggal]
    );
    return todayStats;
  },

  // Get active users count
  getActiveUsersCount: async () => {
    const [activeUsers] = await pool.execute(
      'SELECT COUNT(*) as total FROM users WHERE is_active = 1 AND roles = "pegawai"'
    );
    return activeUsers;
  }
};

module.exports = PresensiModel;