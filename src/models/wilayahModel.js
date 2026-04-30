const { pool } = require('../config/database');

// ==================== WILAYAH MODELS ====================
const WilayahModel = {
  // Get all wilayah
  getAll: async () => {
    const [wilayah] = await pool.execute(
      'SELECT * FROM wilayah ORDER BY nama_wilayah ASC'
    );
    return wilayah;
  },

  // Get wilayah by ID
  getById: async (id) => {
    const [wilayah] = await pool.execute(
      'SELECT * FROM wilayah WHERE id = ?',
      [id]
    );
    return wilayah.length ? wilayah[0] : null;
  },

  // Check if nama_wilayah exists
  isNamaExists: async (nama_wilayah, excludeId = null) => {
    let query = 'SELECT id FROM wilayah WHERE nama_wilayah = ?';
    let params = [nama_wilayah];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [existing] = await pool.execute(query, params);
    return existing.length > 0;
  },

  // Create wilayah
  create: async (nama_wilayah, keterangan) => {
    const [result] = await pool.execute(
      'INSERT INTO wilayah (nama_wilayah, keterangan) VALUES (?, ?)',
      [nama_wilayah, keterangan]
    );
    return result.insertId;
  },

  // Update wilayah
  update: async (id, nama_wilayah, keterangan) => {
    await pool.execute(
      'UPDATE wilayah SET nama_wilayah = ?, keterangan = ? WHERE id = ?',
      [nama_wilayah, keterangan, id]
    );
  },

  // Delete wilayah
  delete: async (id) => {
    await pool.execute('DELETE FROM wilayah WHERE id = ?', [id]);
  },

  // Get users by wilayah_id
  getUsersByWilayahId: async (wilayah_id) => {
    const [users] = await pool.execute(
      `SELECT u.id, u.nama, u.jabatan, u.roles, u.status, u.is_active, 
              u.wilayah_penugasan, w.nama_wilayah
       FROM users u 
       LEFT JOIN wilayah w ON u.wilayah_id = w.id 
       WHERE u.wilayah_id = ? AND u.is_active = 1 AND u.roles = 'pegawai'
       ORDER BY u.nama ASC`,
      [wilayah_id]
    );
    return users;
  },

  // Check if wilayah has users
  hasUsers: async (wilayah_id) => {
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE wilayah_id = ?',
      [wilayah_id]
    );
    return users.length > 0;
  },

  // Get wilayah statistics
  getStats: async () => {
    const [stats] = await pool.execute(
      `SELECT 
        w.id,
        w.nama_wilayah,
        COUNT(u.id) as total_users,
        SUM(CASE WHEN u.status = 'Aktif' THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) as system_active_users
       FROM wilayah w
       LEFT JOIN users u ON w.id = u.wilayah_id AND u.roles = 'pegawai'
       GROUP BY w.id, w.nama_wilayah
       ORDER BY w.nama_wilayah ASC`
    );
    return stats;
  },

  // Get users without wilayah
  getUsersWithoutWilayah: async () => {
    const [noWilayah] = await pool.execute(
      `SELECT COUNT(*) as total FROM users WHERE wilayah_id IS NULL AND is_active = 1 AND roles = 'pegawai'`
    );
    return noWilayah[0].total;
  }
};

// ==================== USER MODELS ====================
const UserModel = {
  // Get user by ID
  getById: async (id) => {
    const [user] = await pool.execute(
      'SELECT id, nama, roles FROM users WHERE id = ?',
      [id]
    );
    return user.length ? user[0] : null;
  },

  // Get all pegawai
  getAllPegawai: async () => {
    const [pegawai] = await pool.execute(
      `SELECT 
         u.id, u.nama, u.jabatan, u.roles, u.status, u.is_active, 
         u.wilayah_penugasan, u.wilayah_id, w.nama_wilayah,
         u.username, u.foto, u.telegram_id, u.created_at
       FROM users u 
       LEFT JOIN wilayah w ON u.wilayah_id = w.id 
       WHERE u.is_active = 1 AND u.roles = 'pegawai'
       ORDER BY w.nama_wilayah, u.nama ASC`
    );
    return pegawai;
  },

  // Update user's wilayah
  updateWilayah: async (user_id, wilayah_id, wilayah_name) => {
    await pool.execute(
      'UPDATE users SET wilayah_id = ?, wilayah_penugasan = ? WHERE id = ?',
      [wilayah_id, wilayah_name, user_id]
    );
  }
};

// ==================== LOG MODELS ====================
const LogModel = {
  create: async (event_type, description, user_id) => {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      [event_type, description, user_id]
    );
  }
};

// ==================== EXPORT ALL MODELS ====================
module.exports = {
  WilayahModel,
  UserModel,
  LogModel
};