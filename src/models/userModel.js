const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// ==================== FILE UTILITY FUNCTIONS ====================
const ensureUploadsDir = () => {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
};

const saveBase64Image = (base64String, subfolder = 'users') => {
  if (!base64String || !base64String.startsWith('data:image')) {
    return null;
  }
  
  try {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 string');
    }

    const imageType = matches[1];
    const imageData = matches[2];
    
    const ext = imageType.split('/')[1] || 'png';
    const filename = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${ext}`;
    const uploadsDir = ensureUploadsDir();
    const subfolderDir = path.join(uploadsDir, subfolder);
    
    if (!fs.existsSync(subfolderDir)) {
      fs.mkdirSync(subfolderDir, { recursive: true });
    }
    
    const filePath = path.join(subfolderDir, filename);
    const buffer = Buffer.from(imageData, 'base64');
    
    if (buffer.length > 500 * 1024) {
      throw new Error('Ukuran foto terlalu besar (>500KB)');
    }
    
    fs.writeFileSync(filePath, buffer);
    
    return `/uploads/${subfolder}/${filename}`;
  } catch (error) {
    console.error('Error saving base64 image:', error);
    throw error;
  }
};

const deleteFile = (filePath) => {
  if (!filePath || filePath.includes('default.png')) {
    return;
  }
  
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

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

const optimizeImage = async (base64String) => {
  try {
    if (!base64String || !base64String.startsWith('data:image')) {
      throw new Error('Format foto tidak valid');
    }

    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 string');
    }

    const imageData = matches[2];
    const buffer = Buffer.from(imageData, 'base64');

    try {
      const sharp = require('sharp');
      
      const metadata = await sharp(buffer).metadata();
      console.log(`📐 Dimensi asli: ${metadata.width}x${metadata.height}`);
      console.log(`📁 Ukuran asli: ${(buffer.length / 1024).toFixed(2)} KB`);

      let resizeOptions = { 
        width: 400,
        height: 400,
        fit: 'cover',
        withoutEnlargement: true 
      };

      const optimizedBuffer = await sharp(buffer)
        .resize(resizeOptions)
        .jpeg({ 
          quality: 80,
          progressive: true 
        })
        .toBuffer();

      console.log(`📁 Ukuran setelah optimasi: ${(optimizedBuffer.length / 1024).toFixed(2)} KB`);

      const mimeType = 'image/jpeg';
      const base64 = optimizedBuffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
      
    } catch (sharpError) {
      console.log('⚠️ Sharp tidak tersedia, menggunakan gambar asli');
      return base64String;
    }
    
  } catch (error) {
    console.error('❌ Error optimizing image:', error);
    throw error;
  }
};

// ==================== USER MODEL ====================
const UserModel = {
  // Get all users
  getAll: async () => {
    const [users] = await pool.execute(
      `SELECT * FROM users ORDER BY nama`
    );
    return users.map(user => ({
      ...user,
      foto: getBase64FromFile(user.foto)
    }));
  },

  // Get user by ID
  getById: async (id) => {
    const [users] = await pool.execute(
      `SELECT * FROM users WHERE id = ?`,
      [id]
    );
    if (users.length === 0) return null;
    
    const user = users[0];
    user.foto = getBase64FromFile(user.foto);
    return user;
  },

  // Check if username exists
  isUsernameExists: async (username, excludeId = null) => {
    let query = 'SELECT id FROM users WHERE username = ?';
    let params = [username];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [users] = await pool.execute(query, params);
    return users.length > 0;
  },

  // Create user
  create: async (userData, fotoPath) => {
    const {
      nama, username, password, no_hp, jabatan, roles, wilayah_penugasan,
      tempat_lahir, tanggal_lahir, alamat, jenis_kelamin, pendidikan_terakhir,
      telegram_id, can_remote, status
    } = userData;

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO users 
       (nama, username, password, no_hp, jabatan, roles, wilayah_penugasan,
        tempat_lahir, tanggal_lahir, alamat, jenis_kelamin, pendidikan_terakhir,
        telegram_id, can_remote, status, foto) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nama, username, hashedPassword, no_hp || null, jabatan, roles, 
        wilayah_penugasan || null, tempat_lahir || null, tanggal_lahir || null, 
        alamat || null, jenis_kelamin || null, pendidikan_terakhir || null,
        telegram_id || null, can_remote !== undefined ? can_remote : 0, 
        status || 'Aktif', fotoPath
      ]
    );

    return result.insertId;
  },

  // Update user
  update: async (id, userData, fotoPath) => {
    const {
      nama, username, no_hp, jabatan, roles, status, is_active,
      wilayah_penugasan, tempat_lahir, tanggal_lahir, alamat,
      jenis_kelamin, pendidikan_terakhir, telegram_id, can_remote
    } = userData;

    const [result] = await pool.execute(
      `UPDATE users SET 
        nama = ?, username = ?, no_hp = ?, jabatan = ?, roles = ?,
        status = ?, is_active = ?, wilayah_penugasan = ?,
        tempat_lahir = ?, tanggal_lahir = ?, alamat = ?, 
        jenis_kelamin = ?, pendidikan_terakhir = ?,
        telegram_id = ?, can_remote = ?, foto = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        nama, username, no_hp || null, jabatan, roles,
        status || 'Aktif', is_active !== undefined ? is_active : 1,
        wilayah_penugasan || null, tempat_lahir || null, tanggal_lahir || null,
        alamat || null, jenis_kelamin || null, pendidikan_terakhir || null,
        telegram_id || null, can_remote !== undefined ? can_remote : 0,
        fotoPath, id
      ]
    );

    return result;
  },

  // Delete user
  delete: async (id) => {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return result;
  },

  // Update password
  updatePassword: async (id, password) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, id]
    );
    return result;
  },

  // Get user foto path
  getUserFotoPath: async (id) => {
    const [users] = await pool.execute('SELECT foto FROM users WHERE id = ?', [id]);
    return users.length > 0 ? users[0].foto : null;
  },

  // Get user for logging
  getUserForLog: async (id) => {
    const [users] = await pool.execute(
      'SELECT nama, username, foto, wilayah_penugasan FROM users WHERE id = ?',
      [id]
    );
    return users.length > 0 ? users[0] : null;
  },

  // Save base64 image
  saveImage: (base64String, subfolder = 'users') => {
    return saveBase64Image(base64String, subfolder);
  },

  // Delete file
  deleteFile: (filePath) => {
    deleteFile(filePath);
  },

  // Optimize image
  optimizeImage: async (base64String) => {
    return await optimizeImage(base64String);
  },

  // Get default foto path
  getDefaultFotoPath: () => {
    return "/uploads/users/default.png";
  }
};

// ==================== LOG MODEL (untuk user) ====================
const UserLogModel = {
  create: async (event_type, description, user_id) => {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      [event_type, description, user_id]
    );
  }
};

module.exports = { UserModel, UserLogModel };