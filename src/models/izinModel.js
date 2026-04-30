const { pool } = require('../config/database');
const { DateTime } = require('luxon');

const IzinModel = {
  // Query untuk mengambil semua izin dengan filter
  getAllIzinQuery: (status, user_id, jenis, tanggal) => {
    let query = `
      SELECT i.*, u.nama as nama_pegawai, u.jabatan, u.wilayah_penugasan,
             admin.nama as Disetujui_by_name
      FROM izin i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN users admin ON i.updated_by = admin.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('i.status = ?');
      params.push(status);
    }

    if (user_id) {
      conditions.push('i.user_id = ?');
      params.push(user_id);
    }

    if (jenis) {
      conditions.push('i.jenis = ?');
      params.push(jenis);
    }

    if (tanggal) {
      conditions.push('? BETWEEN i.tanggal_mulai AND i.tanggal_selesai');
      params.push(tanggal);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY i.created_at DESC';

    return { query, params };
  },

  // Get izin by ID
  getIzinByIdQuery: (id) => ({
    query: `SELECT i.*, u.nama as nama_pegawai, u.jabatan, u.wilayah_penugasan,
                   admin.nama as Disetujui_by_name
            FROM izin i
            JOIN users u ON i.user_id = u.id
            LEFT JOIN users admin ON i.updated_by = admin.id
            WHERE i.id = ?`,
    params: [id]
  }),

  // Get my izin
  getMyIzinQuery: (userId) => ({
    query: `SELECT i.*, u.nama as nama_pegawai, u.jabatan,
                   admin.nama as Disetujui_by_name
            FROM izin i
            JOIN users u ON i.user_id = u.id
            LEFT JOIN users admin ON i.updated_by = admin.id
            WHERE i.user_id = ?
            ORDER BY i.created_at DESC`,
    params: [userId]
  }),

  // Create izin
  createIzinQuery: (data) => ({
    query: `INSERT INTO izin 
            (user_id, tanggal_mulai, tanggal_selesai, durasi_hari, jenis, 
             keterangan, dokumen_pendukung, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
    params: [
      data.userId,
      data.tanggalMulaiDB,
      data.tanggalSelesaiDB,
      data.durasi_hari,
      data.jenis,
      data.keterangan || null,
      data.dokumenFileName
    ]
  }),

  // Get izin untuk update status
  getIzinForUpdateQuery: (id) => ({
    query: `SELECT i.*, u.nama as nama_pegawai 
            FROM izin i 
            JOIN users u ON i.user_id = u.id 
            WHERE i.id = ?`,
    params: [id]
  }),

  // Update status izin
  updateIzinStatusQuery: (id, status, adminId, nowDate) => ({
    query: `UPDATE izin SET 
             status = ?, updated_by = ?, updated_at = ?
            WHERE id = ?`,
    params: [status, adminId, nowDate, id]
  }),

  // Delete izin
  deleteIzinQuery: (id) => ({
    query: 'DELETE FROM izin WHERE id = ?',
    params: [id]
  }),

  // Check izin exists
  checkIzinExistsQuery: (id, userId) => ({
    query: 'SELECT * FROM izin WHERE id = ? AND user_id = ?',
    params: [id, userId]
  }),

  // Check existing izin for duplicate
  checkExistingIzinQuery: (userId, tanggalMulaiDB, tanggalSelesaiDB) => ({
    query: `SELECT * FROM izin 
            WHERE user_id = ? AND status = 'Disetujui'
            AND (
              (tanggal_mulai BETWEEN ? AND ?) OR
              (tanggal_selesai BETWEEN ? AND ?) OR
              (? BETWEEN tanggal_mulai AND tanggal_selesai) OR
              (? BETWEEN tanggal_mulai AND tanggal_selesai)
            )`,
    params: [userId, tanggalMulaiDB, tanggalSelesaiDB, tanggalMulaiDB, tanggalSelesaiDB, 
             tanggalMulaiDB, tanggalSelesaiDB]
  }),

  // Check user exists
  checkUserExistsQuery: (userId) => ({
    query: 'SELECT id, nama, jabatan, wilayah_penugasan FROM users WHERE id = ? AND is_active = 1',
    params: [userId]
  }),

  // Admin create izin
  adminCreateIzinQuery: (data, nowDate) => ({
    query: `INSERT INTO izin 
            (user_id, tanggal_mulai, tanggal_selesai, durasi_hari, jenis, 
             keterangan, dokumen_pendukung, status, updated_by, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      data.user_id,
      data.tanggalMulaiDB,
      data.tanggalSelesaiDB,
      data.durasiHari,
      data.jenis,
      data.keterangan || null,
      data.dokumenFileName,
      data.status,
      data.adminId,
      nowDate,
      nowDate
    ]
  }),

  // Get my izin per bulan
  getMyIzinPerBulanQuery: (userId, startDate, endDate) => ({
    query: `SELECT i.*, u.nama as nama_pegawai, u.jabatan, u.wilayah_penugasan,
                   admin.nama as disetujui_by_name
            FROM izin i
            JOIN users u ON i.user_id = u.id
            LEFT JOIN users admin ON i.updated_by = admin.id
            WHERE i.user_id = ? 
              AND (
                (i.tanggal_mulai BETWEEN ? AND ?) OR
                (i.tanggal_selesai BETWEEN ? AND ?) OR
                (? BETWEEN i.tanggal_mulai AND i.tanggal_selesai) OR
                (? BETWEEN i.tanggal_mulai AND i.tanggal_selesai)
              )
            ORDER BY i.tanggal_mulai DESC`,
    params: [userId, startDate, endDate, startDate, endDate, startDate, endDate]
  }),

  // Get available years for filter
  getAvailableYearsQuery: (userId) => ({
    query: `SELECT DISTINCT YEAR(tanggal_mulai) as tahun 
            FROM izin 
            WHERE user_id = ? 
            ORDER BY tahun DESC`,
    params: [userId]
  }),

  // Get izin per tanggal for admin
  getIzinPerTanggalQuery: (targetDateStr, status, jenis, search) => {
    let query = `
      SELECT 
        i.*,
        u.nama as nama_pegawai,
        u.jabatan,
        u.wilayah_penugasan,
        admin.nama as disetujui_by_name,
        DATE_FORMAT(i.created_at, '%d %M %Y pukul %H.%i') as created_at_formatted,
        DATE_FORMAT(i.updated_at, '%d %M %Y pukul %H.%i') as updated_at_formatted
      FROM izin i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN users admin ON i.updated_by = admin.id
      WHERE u.is_active = 1
        AND (
          (i.tanggal_mulai <= ? AND i.tanggal_selesai >= ?)
        )
    `;
    
    const params = [targetDateStr, targetDateStr];
    
    if (status && status !== '') {
      query += ` AND i.status = ?`;
      params.push(status);
    }
    
    if (jenis && jenis !== '') {
      query += ` AND i.jenis = ?`;
      params.push(jenis);
    }
    
    if (search && search !== '') {
      query += ` AND (
        u.nama LIKE ? OR 
        i.jenis LIKE ? OR 
        i.keterangan LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ` ORDER BY i.created_at DESC`;
    
    return { query, params };
  },

  // Get izin tanggal options for calendar
  getIzinTanggalOptionsQuery: () => ({
    query: `SELECT DISTINCT 
              DATE(tanggal_mulai) as tanggal,
              COUNT(*) as total
            FROM izin
            WHERE status = 'Disetujui'
            GROUP BY DATE(tanggal_mulai)
            ORDER BY tanggal DESC
            LIMIT 30`,
    params: []
  }),

  // Insert system log
  insertLogQuery: (eventType, description, userId, nowDate) => ({
    query: 'INSERT INTO system_log (event_type, description, user_id, created_at) VALUES (?, ?, ?, ?)',
    params: [eventType, description, userId, nowDate]
  })
};

module.exports = IzinModel;