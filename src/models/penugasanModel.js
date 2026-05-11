const { pool } = require('../config/database');
const { DateTime } = require('luxon');

const PenugasanModel = {
  // ============ GET ALL PENUGASAN ============
  getAllPenugasan: async (jenis = 'semua') => {
    let query = `
      SELECT 
        id,
        kode_penugasan,
        nama_penugasan,
        tipe_penugasan,
        jam_masuk,
        jam_pulang,
        batas_akhir_pulang,
        toleransi_keterlambatan,
        batas_terlambat,
        maps_link,
        alamat,
        latitude,
        longitude,
        radius,
        tanggal_mulai,
        tanggal_selesai,
        status,
        is_active,
        created_at
      FROM penugasan 
      WHERE 1=1
    `;
    
    if (jenis === 'aktif') {
      query += ` AND status = 'aktif' AND is_active = 1`;
    } else if (jenis === 'selesai') {
      query += ` AND status IN ('selesai', 'dibatalkan')`;
    } else if (jenis === 'default') {
      query += ` AND tipe_penugasan = 'default'`;
    }
    
    query += ` ORDER BY 
      CASE WHEN tipe_penugasan = 'khusus' AND status = 'aktif' THEN 1 ELSE 2 END,
      is_active DESC, 
      created_at DESC`;
    
    const [penugasan] = await pool.execute(query);
    return penugasan;
  },

  // ============ GET PENUGASAN DEFAULT AKTIF ============
  getPenugasanDefaultAktif: async () => {
    const [penugasan] = await pool.execute(
      `SELECT 
        id, 
        kode_penugasan,
        nama_penugasan, 
        jam_masuk, 
        jam_pulang,
        batas_akhir_pulang,
        toleransi_keterlambatan, 
        batas_terlambat
      FROM penugasan 
      WHERE tipe_penugasan = 'default' AND is_active = 1 AND status = 'aktif'
      LIMIT 1`
    );
    return penugasan.length > 0 ? penugasan[0] : null;
  },

  // ============ GET PENUGASAN BY ID ============
  getPenugasanById: async (id) => {
    const [penugasan] = await pool.execute(
      `SELECT * FROM penugasan WHERE id = ?`,
      [id]
    );
    return penugasan.length > 0 ? penugasan[0] : null;
  },

  // ============ GET PENUGASAN KHUSUS BY ID ============
  getPenugasanKhususById: async (id) => {
    const [penugasan] = await pool.execute(
      `SELECT * FROM penugasan WHERE id = ? AND tipe_penugasan = 'khusus'`,
      [id]
    );
    return penugasan.length > 0 ? penugasan[0] : null;
  },

  // ============ CREATE PENUGASAN ============
  createPenugasan: async (data, coordinates, isPenugasanActive, createdBy) => {
    const {
      kodePenugasan, nama_penugasan, tipe_penugasan,
      jam_masuk, jam_pulang, batas_akhir_pulang,
      toleransi_keterlambatan, batas_terlambat,
      maps_link, alamat, radius, tanggal_mulai, tanggal_selesai
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO penugasan 
       (kode_penugasan, nama_penugasan, tipe_penugasan,
        jam_masuk, jam_pulang, batas_akhir_pulang,
        toleransi_keterlambatan, batas_terlambat,
        maps_link, alamat, latitude, longitude, radius,
        tanggal_mulai, tanggal_selesai, status, is_active, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?, ?)`,
      [
        kodePenugasan, nama_penugasan, tipe_penugasan,
        jam_masuk, jam_pulang, batas_akhir_pulang || null,
        toleransi_keterlambatan || '00:15:00',
        batas_terlambat || jam_masuk,
        maps_link || null, alamat || null,
        coordinates?.latitude || null, coordinates?.longitude || null,
        tipe_penugasan === 'default' ? null : radius,
        tanggal_mulai || null, tanggal_selesai || null,
        isPenugasanActive, createdBy || null
      ]
    );
    return result.insertId;
  },

  // ============ UPDATE PENUGASAN ============
  updatePenugasan: async (id, data, coordinates) => {
    const {
      nama_penugasan, maps_link, alamat, tanggal_mulai, tanggal_selesai,
      jam_masuk, jam_pulang, batas_akhir_pulang,
      batas_terlambat, toleransi_keterlambatan,
      radius, is_active
    } = data;

    const [result] = await pool.execute(
      `UPDATE penugasan SET 
        nama_penugasan = ?,
        maps_link = ?,
        alamat = ?,
        latitude = ?,
        longitude = ?,
        radius = ?,
        tanggal_mulai = ?,
        tanggal_selesai = ?,
        jam_masuk = ?,
        jam_pulang = ?,
        batas_akhir_pulang = ?,
        batas_terlambat = ?,
        toleransi_keterlambatan = ?,
        is_active = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        nama_penugasan,
        maps_link || null,
        alamat || null,
        coordinates?.latitude || null,
        coordinates?.longitude || null,
        radius,
        tanggal_mulai,
        tanggal_selesai,
        jam_masuk,
        jam_pulang,
        batas_akhir_pulang || null,
        batas_terlambat || jam_masuk,
        toleransi_keterlambatan || '00:15:00',
        is_active ? 1 : 0,
        id
      ]
    );
    return result;
  },

  // ============ UPDATE PENUGASAN STATUS ============
  updatePenugasanStatus: async (id, status) => {
    const [result] = await pool.execute(
      'UPDATE penugasan SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    return result;
  },

  // ============ UPDATE DEFAULT PENUGASAN ============
  updateDefaultPenugasan: async (id, data) => {
    const {
      nama_penugasan, jam_masuk, jam_pulang, batas_akhir_pulang,
      toleransi_keterlambatan, batas_terlambat, is_active
    } = data;

    const [result] = await pool.execute(
      `UPDATE penugasan SET 
        nama_penugasan = ?,
        jam_masuk = ?,
        jam_pulang = ?,
        batas_akhir_pulang = ?,
        toleransi_keterlambatan = ?,
        batas_terlambat = ?,
        is_active = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [nama_penugasan, jam_masuk, jam_pulang, batas_akhir_pulang, 
       toleransi_keterlambatan, batas_terlambat, is_active ? 1 : 0, id]
    );
    return result;
  },

  // ============ SOFT DELETE PENUGASAN ============
  softDeletePenugasan: async (id, tipe_penugasan) => {
    let result;
    if (tipe_penugasan === 'default') {
      [result] = await pool.execute(
        'UPDATE penugasan SET is_active = 0, status = "nonaktif", updated_at = NOW() WHERE id = ?',
        [id]
      );
    } else {
      [result] = await pool.execute(
        'UPDATE penugasan SET status = "dibatalkan", is_active = 0, updated_at = NOW() WHERE id = ?',
        [id]
      );
    }
    return result;
  },

  // ============ HARD DELETE PENUGASAN ============
  deletePenugasan: async (id) => {
    const [result] = await pool.execute('DELETE FROM penugasan WHERE id = ?', [id]);
    return result;
  },

  // ============ NONAKTIFKAN DEFAULT LAINNYA ============
  nonaktifkanDefaultLainnya: async (excludeId = null) => {
    let query = 'UPDATE penugasan SET is_active = 0 WHERE tipe_penugasan = "default"';
    if (excludeId) {
      query += ' AND id != ?';
      await pool.execute(query, [excludeId]);
    } else {
      await pool.execute(query);
    }
  },

  // ============ GET PENUGASAN KHUSUS AKTIF UNTUK USER ============
  getPenugasanKhususAktifForUser: async (userId, targetDate) => {
    const [penugasan] = await pool.execute(
      `SELECT 
        p.*, 
        true as is_penugasan_khusus,
        ap.tipe_assign,
        ap.id as assignment_id
      FROM penugasan p
      INNER JOIN assignment_pekerja ap ON ap.penugasan_id = p.id
      WHERE ap.user_id = ? 
        AND ap.status = 'aktif'
        AND p.tipe_penugasan = 'khusus'
        AND p.status = 'aktif'
        AND p.is_active = 1
        AND ? BETWEEN p.tanggal_mulai AND p.tanggal_selesai
      ORDER BY p.id DESC
      LIMIT 1`,
      [userId, targetDate]
    );
    return penugasan.length > 0 ? penugasan[0] : null;
  },

  // ============ GET PENUGASAN DEFAULT AKTIF SISTEM ============
  getPenugasanDefaultAktifSistem: async () => {
    const [penugasan] = await pool.execute(
      `SELECT 
        *, 
        false as is_penugasan_khusus,
        NULL as tipe_assign,
        NULL as assignment_id
      FROM penugasan 
      WHERE tipe_penugasan = 'default' 
        AND is_active = 1 
        AND status = 'aktif'
      LIMIT 1`
    );
    return penugasan.length > 0 ? penugasan[0] : null;
  },

  // ============ CEK PENUGASAN KHUSUS AKTIF ============
  cekPenugasanKhususAktif: async (userId, targetDate) => {
    const [result] = await pool.execute(
      `SELECT COUNT(*) as total 
       FROM penugasan p
       INNER JOIN assignment_pekerja ap ON ap.penugasan_id = p.id
       WHERE ap.user_id = ? 
         AND ap.status = 'aktif'
         AND p.tipe_penugasan = 'khusus'
         AND p.status = 'aktif'
         AND p.is_active = 1
         AND ? BETWEEN p.tanggal_mulai AND p.tanggal_selesai`,
      [userId, targetDate]
    );
    return result[0].total > 0;
  },

  // ============ GET MONITORING PENUGASAN ============
  getAssignedUsersByPenugasanId: async (penugasanId) => {
    const [assignedUsers] = await pool.execute(
      `SELECT ap.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM assignment_pekerja ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.penugasan_id = ? AND ap.status = 'aktif'`,
      [penugasanId]
    );
    return assignedUsers;
  },

  // ============ GET PRESENSI BY PENUGASAN AND TANGGAL ============
  getPresensiByPenugasanAndTanggal: async (penugasanId, tanggal) => {
    const [presensi] = await pool.execute(
      `SELECT pr.*, u.nama as user_nama
       FROM presensi pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.penugasan_id = ? AND pr.tanggal = ?`,
      [penugasanId, tanggal]
    );
    return presensi;
  },

  // ============ DELETE ASSIGNMENT PEKERJA ============
  deleteAssignmentByPenugasanId: async (penugasanId) => {
    const [result] = await pool.execute(
      'DELETE FROM assignment_pekerja WHERE penugasan_id = ?',
      [penugasanId]
    );
    return result;
  },

  // ============ NONAKTIFKAN ASSIGNMENT LAMA UNTUK USER ============
  nonaktifkanAssignmentLamaUntukUser: async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    const placeholders = userIds.map(() => '?').join(',');
    const [result] = await pool.execute(
      `UPDATE assignment_pekerja SET status = 'nonaktif' 
       WHERE user_id IN (${placeholders}) 
       AND penugasan_id IN (
         SELECT id FROM penugasan 
         WHERE tipe_penugasan = 'khusus' AND status = 'aktif'
       )`,
      userIds
    );
    return result;
  },

  // ============ NONAKTIFKAN SEMUA ASSIGNMENT KHUSUS ============
  nonaktifkanSemuaAssignmentKhusus: async () => {
    const [result] = await pool.execute(
      `UPDATE assignment_pekerja SET status = 'nonaktif' 
       WHERE penugasan_id IN (
         SELECT id FROM penugasan 
         WHERE tipe_penugasan = 'khusus' AND status = 'aktif'
       )`
    );
    return result;
  },

  // ============ GET USERS BY WILAYAH ============
  getUsersByWilayah: async (wilayahList) => {
    if (!wilayahList || wilayahList.length === 0) return [];
    const placeholders = wilayahList.map(() => '?').join(',');
    const [users] = await pool.execute(
      `SELECT id FROM users 
       WHERE is_active = 1 AND roles = "pegawai" 
       AND wilayah_penugasan IN (${placeholders})`,
      wilayahList
    );
    return users;
  },

  // ============ GET SEMUA PEGAWAI AKTIF ============
  getAllPegawaiAktif: async () => {
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE is_active = 1 AND roles = "pegawai"'
    );
    return users;
  },

  // ============ CREATE ASSIGNMENT PEKERJA ============
  createAssignmentPekerja: async (penugasanId, userId, tipeAssign) => {
    const [existing] = await pool.execute(
      `SELECT id FROM assignment_pekerja 
       WHERE penugasan_id = ? AND user_id = ? AND status = 'aktif'`,
      [penugasanId, userId]
    );
    
    if (existing.length === 0) {
      const [result] = await pool.execute(
        `INSERT INTO assignment_pekerja (penugasan_id, user_id, tipe_assign, status, assigned_at) 
         VALUES (?, ?, ?, 'aktif', NOW())`,
        [penugasanId, userId, tipeAssign]
      );
      return result;
    }
    return null;
  },

  // ============ GET PENUGASAN YANG SUDAH SELESAI ============
  getPenugasanSelesai: async (tipe = 'semua') => {
    let query = `
      SELECT id, tipe_penugasan, nama_penugasan FROM penugasan 
      WHERE status IN ('selesai', 'dibatalkan', 'nonaktif')
      AND is_active = 0
    `;
    
    if (tipe === 'default') {
      query += ` AND tipe_penugasan = 'default'`;
    } else if (tipe === 'khusus') {
      query += ` AND tipe_penugasan = 'khusus'`;
    }
    
    const [penugasanList] = await pool.execute(query);
    return penugasanList;
  },

  // ============ GET DETAIL PENUGASAN DENGAN ASSIGNMENT ============
  getPenugasanDetailWithAssignment: async (id) => {
    const [penugasan] = await pool.execute(
      `SELECT 
        p.*,
        GROUP_CONCAT(DISTINCT ap.user_id) as user_ids,
        GROUP_CONCAT(DISTINCT u.wilayah_penugasan) as wilayah_names
      FROM penugasan p
      LEFT JOIN assignment_pekerja ap ON ap.penugasan_id = p.id AND ap.status = 'aktif'
      LEFT JOIN users u ON ap.user_id = u.id
      WHERE p.id = ?
      GROUP BY p.id`,
      [id]
    );
    return penugasan.length > 0 ? penugasan[0] : null;
  },

  // ============ GET ASSIGNED USERS WITH DETAIL ============
  getAssignedUsersWithDetail: async (penugasanId) => {
    const [assignedUsers] = await pool.execute(
      `SELECT u.id, u.nama, u.jabatan, u.wilayah_penugasan, ap.tipe_assign
       FROM assignment_pekerja ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.penugasan_id = ? AND ap.status = 'aktif'`,
      [penugasanId]
    );
    return assignedUsers;
  }
};

module.exports = PenugasanModel;