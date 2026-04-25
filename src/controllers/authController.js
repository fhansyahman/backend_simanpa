const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { getUserPenugasan } = require('./jamKerjaController');
const { DateTime } = require('luxon');

// Helper function untuk base64
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

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('Login attempt for:', username);

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi'
      });
    }

    // Find user (tanpa JOIN jam_kerja karena sudah dihapus)
    const [users] = await pool.execute(
      `SELECT u.* 
       FROM users u 
       WHERE u.username = ? AND u.is_active = 1`,
      [username]
    );

    if (users.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(200).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    // Ambil penugasan aktif user untuk hari ini (opsional, untuk response)
    let penugasanAktif = null;
    try {
      const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
      penugasanAktif = await getUserPenugasan(user.id, today);
    } catch (error) {
      console.warn('Gagal mengambil penugasan aktif:', error.message);
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: user.id,
        userId: user.id,
        username: user.username,
        role: user.roles,
        roles: user.roles,
        nama: user.nama,
        jabatan: user.jabatan
      },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    // Response data user (tanpa password)
    const userResponse = {
      id: user.id,
      nama: user.nama,
      username: user.username,
      alamat: user.alamat,
      tempat_lahir: user.tempat_lahir,
      tanggal_lahir: user.tanggal_lahir,
      jenis_kelamin: user.jenis_kelamin,
      no_hp: user.no_hp,
      pendidikan_terakhir: user.pendidikan_terakhir,
      wilayah_penugasan: user.wilayah_penugasan,
      wilayah_id: user.wilayah_id,
      can_remote: user.can_remote,
      jabatan: user.jabatan,
      roles: user.roles,
      foto: user.foto,
      telegram_id: user.telegram_id,
      is_active: user.is_active,
      created_at: user.created_at,
      // Tambahkan informasi penugasan aktif (opsional)
      penugasan_aktif: penugasanAktif ? {
        id: penugasanAktif.id,
        nama_penugasan: penugasanAktif.nama_penugasan,
        tipe_penugasan: penugasanAktif.tipe_penugasan,
        jam_masuk: penugasanAktif.jam_masuk,
        jam_pulang: penugasanAktif.jam_pulang,
        is_penugasan_khusus: penugasanAktif.is_penugasan_khusus
      } : null
    };

    // Konversi foto ke base64 jika ada
    if (userResponse.foto) {
      userResponse.foto = getBase64FromFile(userResponse.foto);
    }

    res.status(200).json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT u.id, u.nama, u.username, u.no_hp, u.jabatan, u.roles, 
              u.foto, u.wilayah_penugasan, u.telegram_id, u.alamat,
              u.tempat_lahir, u.tanggal_lahir, u.jenis_kelamin,
              u.pendidikan_terakhir, u.can_remote, u.is_active,
              u.created_at, u.updated_at
       FROM users u 
       WHERE u.id = ? AND u.is_active = 1`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    const user = users[0];
    
    // Ambil penugasan aktif user untuk hari ini
    let penugasanAktif = null;
    try {
      const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
      penugasanAktif = await getUserPenugasan(user.id, today);
    } catch (error) {
      console.warn('Gagal mengambil penugasan aktif:', error.message);
    }
    
    let fotoBase64 = null;
    if (user.foto) {
      fotoBase64 = getBase64FromFile(user.foto);
    }

    const responseData = {
      ...user,
      foto: fotoBase64 || user.foto,
      penugasan_aktif: penugasanAktif ? {
        id: penugasanAktif.id,
        nama_penugasan: penugasanAktif.nama_penugasan,
        tipe_penugasan: penugasanAktif.tipe_penugasan,
        jam_masuk: penugasanAktif.jam_masuk,
        jam_pulang: penugasanAktif.jam_pulang,
        toleransi_keterlambatan: penugasanAktif.toleransi_keterlambatan,
        batas_terlambat: penugasanAktif.batas_terlambat,
        latitude: penugasanAktif.latitude,
        longitude: penugasanAktif.longitude,
        radius: penugasanAktif.radius,
        alamat: penugasanAktif.alamat,
        is_penugasan_khusus: penugasanAktif.is_penugasan_khusus
      } : null
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    console.log('Reset password attempt for user:', userId);

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password lama, password baru, dan konfirmasi password wajib diisi'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password baru dan konfirmasi password tidak cocok'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password baru minimal 6 karakter'
      });
    }

    const [users] = await pool.execute(
      'SELECT id, username, password FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    const user = users[0];

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Password lama tidak sesuai'
      });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password baru tidak boleh sama dengan password lama'
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedNewPassword, userId]
    );

    console.log(`Password berhasil direset untuk user: ${user.username} (ID: ${userId})`);

    res.status(200).json({
      success: true,
      message: 'Password berhasil direset'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server saat mereset password'
    });
  }
};

module.exports = { login, getProfile, resetPassword };