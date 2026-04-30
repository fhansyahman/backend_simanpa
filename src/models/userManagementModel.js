const { pool } = require('../config/database');

const UserManagementModel = {
  // Get all users with filters
  getAll: async (filters = {}) => {
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

    if (filters.search) {
      query += ' AND (u.nama LIKE ? OR u.username LIKE ? OR u.jabatan LIKE ? OR u.wilayah_penugasan LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.status) {
      query += ' AND u.status = ?';
      params.push(filters.status);
    }

    if (filters.is_active !== undefined) {
      query += ' AND u.is_active = ?';
      params.push(filters.is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY u.created_at DESC';

    const [users] = await pool.execute(query, params);
    return users;
  },

  // Get user by ID with wilayah info
  getById: async (id) => {
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
    return users.length > 0 ? users[0] : null;
  },

  // Get user basic info by ID
  getBasicInfo: async (id) => {
    const [users] = await pool.execute(
      'SELECT id, nama, jabatan, status, is_active FROM users WHERE id = ?',
      [id]
    );
    return users.length > 0 ? users[0] : null;
  },

  // Deactivate user
  deactivate: async (id) => {
    const [result] = await pool.execute(
      `UPDATE users SET 
        is_active = 0, 
        status = 'Nonaktif',
        updated_at = NOW()
       WHERE id = ?`,
      [id]
    );
    return result;
  },

  // Activate user
  activate: async (id) => {
    const [result] = await pool.execute(
      `UPDATE users SET 
        is_active = 1, 
        status = 'Aktif',
        updated_at = NOW()
       WHERE id = ?`,
      [id]
    );
    return result;
  },

  // Update user status
  updateStatus: async (id, status, is_active) => {
    const [result] = await pool.execute(
      `UPDATE users SET 
        status = ?, 
        is_active = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [status, is_active, id]
    );
    return result;
  },

  // Get active users only
  getActiveUsers: async () => {
    const [users] = await pool.execute(
      `SELECT 
        id, nama, jabatan, wilayah_penugasan, status, is_active
       FROM users 
       WHERE is_active = 1
       ORDER BY nama`
    );
    return users;
  },

  // Get inactive users only
  getInactiveUsers: async () => {
    const [users] = await pool.execute(
      `SELECT 
        id, nama, jabatan, wilayah_penugasan, status, is_active
       FROM users 
       WHERE is_active = 0
       ORDER BY nama`
    );
    return users;
  },

  // Get admin name for logging
  getAdminName: async (adminId) => {
    const [admins] = await pool.execute(
      'SELECT nama FROM users WHERE id = ?',
      [adminId]
    );
    return admins.length > 0 ? admins[0].nama : 'Unknown';
  }
};

// ==================== LOG MODEL ====================
const UserManagementLogModel = {
  create: async (event_type, description, user_id) => {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      [event_type, description, user_id]
    );
  }
};

module.exports = { UserManagementModel, UserManagementLogModel };