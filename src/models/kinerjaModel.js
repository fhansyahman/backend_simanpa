const { pool } = require('../config/database');

const KinerjaModel = {
  // Check existing data
  checkExistingQuery: (userId, tanggal) => ({
    query: 'SELECT id FROM kinerja_harian WHERE user_id = ? AND tanggal = ?',
    params: [userId, tanggal]
  }),

  // Create kinerja
  createKinerjaQuery: (data) => ({
    query: `INSERT INTO kinerja_harian 
             (user_id, tanggal, ruas_jalan, kegiatan, panjang_kr, panjang_kn, 
              sket_image, foto_0, foto_50, foto_100) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      data.userId,
      data.tanggal,
      data.ruas_jalan,
      data.kegiatan,
      data.finalPanjangKr,
      data.finalPanjangKn,
      data.sketImagePath,
      data.foto0Path,
      data.foto50Path,
      data.foto100Path
    ]
  }),

  // Insert log
  insertLogQuery: (eventType, description, userId) => ({
    query: 'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
    params: [eventType, description, userId]
  }),

  // Get kinerja user
  getKinerjaUserQuery: (userId, bulan, tahun) => {
    let query = `
      SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE k.user_id = ?
    `;
    const params = [userId];

    if (bulan && tahun) {
      query += ' AND MONTH(k.tanggal) = ? AND YEAR(k.tanggal) = ?';
      params.push(bulan, tahun);
    }

    query += ' ORDER BY k.tanggal DESC';
    
    return { query, params };
  },

  // Get kinerja user per bulan (efisien)
  getKinerjaUserPerBulanQuery: (userId, startDate, endDate) => ({
    query: `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
            FROM kinerja_harian k
            JOIN users u ON k.user_id = u.id
            WHERE k.user_id = ? AND k.tanggal BETWEEN ? AND ?
            ORDER BY k.tanggal DESC`,
    params: [userId, startDate, endDate]
  }),

  // Get kinerja by id
  getKinerjaByIdQuery: (id) => ({
    query: `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
            FROM kinerja_harian k
            JOIN users u ON k.user_id = u.id
            WHERE k.id = ?`,
    params: [id]
  }),

  // Get existing kinerja for update
  getExistingKinerjaQuery: (id) => ({
    query: 'SELECT * FROM kinerja_harian WHERE id = ?',
    params: [id]
  }),

  // Update kinerja
  updateKinerjaQuery: (data) => ({
    query: `UPDATE kinerja_harian SET 
              tanggal = ?, ruas_jalan = ?, kegiatan = ?, 
              panjang_kr = ?, panjang_kn = ?,
              sket_image = ?, foto_0 = ?, foto_50 = ?, foto_100 = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
    params: [
      data.finalTanggal,
      data.finalRuasJalan,
      data.finalKegiatan,
      data.finalPanjangKr,
      data.finalPanjangKn,
      data.sketImagePath,
      data.foto0Path,
      data.foto50Path,
      data.foto100Path,
      data.id
    ]
  }),

  // Get kinerja for delete
  getKinerjaForDeleteQuery: (id) => ({
    query: 'SELECT user_id, sket_image, foto_0, foto_50, foto_100 FROM kinerja_harian WHERE id = ?',
    params: [id]
  }),

  // Delete kinerja
  deleteKinerjaQuery: (id) => ({
    query: 'DELETE FROM kinerja_harian WHERE id = ?',
    params: [id]
  }),

  // Get all kinerja with filters
  getAllKinerjaQuery: (start_date, end_date, wilayah, user_id) => {
    let query = `
      SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date && end_date) {
      query += ' AND k.tanggal BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    if (wilayah) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    if (user_id) {
      query += ' AND k.user_id = ?';
      params.push(user_id);
    }

    query += ' ORDER BY k.tanggal DESC, u.nama ASC';
    
    return { query, params };
  },

  // Get kinerja statistik
  getKinerjaStatistikQuery: (targetBulan, targetTahun, wilayah) => {
    let query = `
      SELECT 
        u.wilayah_penugasan,
        COUNT(k.id) as total_laporan,
        COUNT(DISTINCT k.user_id) as total_pegawai,
        AVG(k.panjang_kr) as avg_panjang_kr,
        AVG(k.panjang_kn) as avg_panjang_kn
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE MONTH(k.tanggal) = ? AND YEAR(k.tanggal) = ?
    `;
    const params = [targetBulan, targetTahun];

    if (wilayah) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    query += ' GROUP BY u.wilayah_penugasan ORDER BY total_laporan DESC';
    
    return { query, params };
  },

  // Get rekap wilayah
  getRekapWilayahStatistikQuery: (wilayah, start_date, end_date) => {
    let query = `
      SELECT 
        u.wilayah_penugasan as wilayah,
        COUNT(k.id) as total_laporan,
        COUNT(DISTINCT k.user_id) as total_pegawai,
        AVG(k.panjang_kr) as avg_panjang_kr,
        AVG(k.panjang_kn) as avg_panjang_kn
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE u.wilayah_penugasan = ?
    `;
    const params = [wilayah];

    if (start_date && end_date) {
      query += ' AND k.tanggal BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    query += ' GROUP BY u.wilayah_penugasan';
    
    return { query, params };
  },

  // Get laporan list for rekap wilayah
  getLaporanListForWilayahQuery: (wilayah, start_date, end_date) => {
    let query = `
      SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE u.wilayah_penugasan = ?
    `;
    const params = [wilayah];

    if (start_date && end_date) {
      query += ' AND k.tanggal BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    query += ' ORDER BY k.tanggal DESC, u.nama ASC';
    
    return { query, params };
  },

  // Get laporan list for download all wilayah
  getLaporanListForDownloadQuery: (wilayah, start_date, end_date) => {
    let query = `
      SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE u.wilayah_penugasan = ?
    `;
    const params = [wilayah];

    if (start_date && end_date) {
      query += ' AND k.tanggal BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    query += ' ORDER BY k.tanggal DESC, u.nama ASC';
    
    return { query, params };
  },

  // Get kinerja per tanggal (admin)
  getKinerjaPerTanggalQuery: (tanggal, wilayah, search) => {
    let query = `
      SELECT 
        k.*, 
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        DATE_FORMAT(k.tanggal, '%d %M %Y') as tanggal_formatted,
        DATE_FORMAT(k.tanggal, '%W') as hari
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE DATE(k.tanggal) = ?
        AND u.is_active = 1
    `;
    
    const params = [tanggal];

    if (wilayah && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    if (search && search !== '') {
      query += ` AND (
        u.nama LIKE ? OR 
        k.ruas_jalan LIKE ? OR 
        k.kegiatan LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY u.nama ASC, k.tanggal DESC';
    
    return { query, params };
  },

  // Get all kinerja per bulan (admin)
  getAllKinerjaPerBulanQuery: (startDate, endDate, wilayah, search) => {
    let query = `
      SELECT 
        k.*, 
        u.id as user_id,
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        DATE_FORMAT(k.tanggal, '%Y-%m-%d') as tanggal,
        DATE_FORMAT(k.tanggal, '%d %M %Y') as tanggal_formatted,
        DATE_FORMAT(k.tanggal, '%W') as hari
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE DATE(k.tanggal) BETWEEN ? AND ?
        AND u.is_active = 1
        AND u.roles = 'pegawai'
    `;
    
    const params = [startDate, endDate];

    if (wilayah && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    if (search && search !== '') {
      query += ` AND (
        u.nama LIKE ? OR 
        k.ruas_jalan LIKE ? OR 
        k.kegiatan LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY u.nama ASC, k.tanggal ASC';
    
    return { query, params };
  },

  // Get all active pegawai
  getAllActivePegawaiQuery: (wilayah, search) => {
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

    if (search && search !== '') {
      query += ` AND (nama LIKE ? OR jabatan LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    query += ' ORDER BY nama ASC';
    
    return { query, params };
  },

  // Get rekap laporan kerja bulanan
  getRekapLaporanKerjaBulananQuery: (targetBulan, targetTahun) => ({
    query: `SELECT user_id, tanggal, panjang_kr, panjang_kn, kegiatan, ruas_jalan
            FROM kinerja_harian 
            WHERE MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
    params: [targetBulan, targetTahun]
  }),

  // Get all users for rekap
  getAllUsersForRekapQuery: () => ({
    query: `SELECT id, nama, jabatan, wilayah_penugasan 
            FROM users 
            WHERE is_active = 1 AND roles = 'pegawai'
            ORDER BY nama ASC`,
    params: []
  }),

  // Get laporan list for export
  getLaporanListForExportQuery: (targetBulan, targetTahun) => ({
    query: `SELECT user_id, tanggal, panjang_kr, panjang_kn, kegiatan, ruas_jalan
            FROM kinerja_harian 
            WHERE MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
    params: [targetBulan, targetTahun]
  }),

  // Get pegawai dashboard data
  getPegawaiDataQuery: (userId) => ({
    query: `SELECT id, nama, jabatan, wilayah_penugasan 
            FROM users 
            WHERE id = ? AND is_active = 1`,
    params: [userId]
  }),

  // Get laporan list for dashboard
  getLaporanListForDashboardQuery: (userId, startDateStr, endDateStr) => ({
    query: `
      SELECT 
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        ruas_jalan,
        kegiatan,
        panjang_kr,
        panjang_kn
      FROM kinerja_harian
      WHERE user_id = ?
        AND tanggal >= ? 
        AND tanggal <= ?
      ORDER BY tanggal ASC
    `,
    params: [userId, startDateStr, endDateStr]
  }),

  // Get presensi list for dashboard
  getPresensiListForDashboardQuery: (userId, startDateStr, endDateStr) => ({
    query: `
      SELECT 
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        status_masuk,
        jam_masuk,
        jam_pulang,
        keterangan,
        izin_id
      FROM presensi
      WHERE user_id = ?
        AND tanggal >= ? 
        AND tanggal <= ?
      ORDER BY tanggal ASC
    `,
    params: [userId, startDateStr, endDateStr]
  })
};

module.exports = KinerjaModel;