const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// ==================== FILE UTILITY FUNCTIONS ====================
const getBase64FromFile = (filePath) => {
  if (!filePath) {
    return null;
  }
  
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    
    const fileBuffer = fs.readFileSync(fullPath);
    const fileType = path.extname(filePath).toLowerCase().substring(1);
    
    const mimeTypes = {
      'jpg': 'jpeg',
      'jpeg': 'jpeg',
      'png': 'png',
      'gif': 'gif',
      'webp': 'webp'
    };
    
    const mimeType = mimeTypes[fileType] || 'png';
    const base64 = fileBuffer.toString('base64');
    
    return `data:image/${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
};

// ==================== AUTH MODEL ====================
const AuthModel = {
  // Get user by username (active only)
  getUserByUsername: async (username) => {
    const [users] = await pool.execute(
      `SELECT u.* 
       FROM users u 
       WHERE u.username = ? AND u.is_active = 1`,
      [username]
    );
    return users.length > 0 ? users[0] : null;
  },

  // Get user by ID (active only)
  getUserById: async (id) => {
    const [users] = await pool.execute(
      `SELECT u.id, u.nama, u.username, u.no_hp, u.jabatan, u.roles, 
              u.foto, u.wilayah_penugasan, u.telegram_id, u.alamat,
              u.tempat_lahir, u.tanggal_lahir, u.jenis_kelamin,
              u.pendidikan_terakhir, u.can_remote, u.is_active,
              u.created_at, u.updated_at
       FROM users u 
       WHERE u.id = ? AND u.is_active = 1`,
      [id]
    );
    return users.length > 0 ? users[0] : null;
  },

  // Get user with password by ID
  getUserWithPasswordById: async (id) => {
    const [users] = await pool.execute(
      'SELECT id, username, password FROM users WHERE id = ? AND is_active = 1',
      [id]
    );
    return users.length > 0 ? users[0] : null;
  },

  // Update user password
  updatePassword: async (id, hashedPassword) => {
    await pool.execute(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, id]
    );
  },

  // Get user foto path
  getUserFotoPath: async (id) => {
    const [users] = await pool.execute('SELECT foto FROM users WHERE id = ?', [id]);
    return users.length > 0 ? users[0].foto : null;
  },

  // Convert foto to base64
  getFotoBase64: (fotoPath) => {
    return getBase64FromFile(fotoPath);
  }
};

module.exports = AuthModel;