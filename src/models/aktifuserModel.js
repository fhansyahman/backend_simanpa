// models/aktifuserModel.js
const { pool } = require('../config/database');

class AktifuserModel {
  static async findAll(filters = {}) {
    const { search, status, is_active } = filters;
    
    let query = `
      SELECT 
        u.id, u.nama, u.username, u.jabatan, u.status, u.is_active,
        u.wilayah_penugasan, u.jenis_kelamin, u.no_hp, u.alamat,
        u.pendidikan_terakhir, u.tempat_lahir, u.tanggal_lahir,
        u.foto, u.roles, u.created_at, u.updated_at,
        w.nama_wilayah
      FROM users u
      LEFT JOIN wilayah w ON u.wilayah_id = w.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (u.nama LIKE ? OR u.username LIKE ? OR u.jabatan LIKE ? OR u.wilayah_penugasan LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += ' AND u.status = ?';
      params.push(status);
    }

    if (is_active !== undefined) {
      query += ' AND u.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY u.created_at DESC';
    
    const [users] = await pool.execute(query, params);
    return users;
  }

  static async findById(id) {
    const [users] = await pool.execute(
      `SELECT 
        u.id, u.nama, u.username, u.jabatan, u.status, u.is_active,
        u.wilayah_penugasan, u.jenis_kelamin, u.no_hp, u.alamat,
        u.pendidikan_terakhir, u.tempat_lahir, u.tanggal_lahir,
        u.foto, u.roles, u.created_at, u.updated_at,
        w.nama_wilayah
       FROM users u
       LEFT JOIN wilayah w ON u.wilayah_id = w.id
       WHERE u.id = ?`,
      [id]
    );
    
    return users[0] || null;
  }

  static async updateStatus(id, status, is_active) {
    const [result] = await pool.execute(
      `UPDATE users SET 
        status = ?, 
        is_active = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [status, is_active, id]
    );
    
    return result;
  }

  static async findByIdWithAdmin(id, adminId) {
    const [users] = await pool.execute(
      `SELECT u.*, admin.nama as admin_name 
       FROM users u 
       CROSS JOIN (SELECT nama FROM users WHERE id = ?) as admin
       WHERE u.id = ?`,
      [adminId, id]
    );
    
    return users[0] || null;
  }

  static async findByActiveStatus(is_active) {
    const [users] = await pool.execute(
      `SELECT 
        id, nama, jabatan, wilayah_penugasan, status, is_active
       FROM users 
       WHERE is_active = ?
       ORDER BY nama`,
      [is_active]
    );
    
    return users;
  }

  static async createLog(event_type, description, user_id) {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      [event_type, description, user_id]
    );
  }
}

module.exports = AktifuserModel;