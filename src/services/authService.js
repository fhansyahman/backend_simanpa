const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');
const AuthModel = require('../models/authModel');

// Import service untuk penugasan (akan dibuat terpisah)
// Untuk sementara gunakan fungsi dari jamKerjaController yang sudah ada
let getUserPenugasanFunction = null;

// Function to set dependency injection for penugasan service
const setGetUserPenugasan = (fn) => {
  getUserPenugasanFunction = fn;
};

const AuthService = {
  login: async (username, password) => {
    // Validation
    if (!username || !password) {
      throw new Error('Username dan password wajib diisi');
    }

    // Find user
    const user = await AuthModel.getUserByUsername(username);
    if (!user) {
      throw new Error('Username atau password salah');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Username atau password salah');
    }

    // Ambil penugasan aktif user untuk hari ini (opsional)
    let penugasanAktif = null;
    if (getUserPenugasanFunction) {
      try {
        const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
        penugasanAktif = await getUserPenugasanFunction(user.id, today);
      } catch (error) {
        console.warn('Gagal mengambil penugasan aktif:', error.message);
      }
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

    // Get foto base64
    let fotoBase64 = null;
    if (user.foto) {
      fotoBase64 = AuthModel.getFotoBase64(user.foto);
    }

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
      foto: fotoBase64 || user.foto,
      telegram_id: user.telegram_id,
      is_active: user.is_active,
      created_at: user.created_at,
      penugasan_aktif: penugasanAktif ? {
        id: penugasanAktif.id,
        nama_penugasan: penugasanAktif.nama_penugasan,
        tipe_penugasan: penugasanAktif.tipe_penugasan,
        jam_masuk: penugasanAktif.jam_masuk,
        jam_pulang: penugasanAktif.jam_pulang,
        is_penugasan_khusus: penugasanAktif.is_penugasan_khusus
      } : null
    };

    return { token, user: userResponse };
  },

  getProfile: async (userId) => {
    const user = await AuthModel.getUserById(userId);
    if (!user) {
      throw new Error('User tidak ditemukan');
    }

    // Ambil penugasan aktif user untuk hari ini
    let penugasanAktif = null;
    if (getUserPenugasanFunction) {
      try {
        const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
        penugasanAktif = await getUserPenugasanFunction(user.id, today);
      } catch (error) {
        console.warn('Gagal mengambil penugasan aktif:', error.message);
      }
    }

    let fotoBase64 = null;
    if (user.foto) {
      fotoBase64 = AuthModel.getFotoBase64(user.foto);
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

    return responseData;
  },

  resetPassword: async (userId, oldPassword, newPassword, confirmPassword) => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      throw new Error('Password lama, password baru, dan konfirmasi password wajib diisi');
    }

    if (newPassword !== confirmPassword) {
      throw new Error('Password baru dan konfirmasi password tidak cocok');
    }

    if (newPassword.length < 6) {
      throw new Error('Password baru minimal 6 karakter');
    }

    const user = await AuthModel.getUserWithPasswordById(userId);
    if (!user) {
      throw new Error('User tidak ditemukan');
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new Error('Password lama tidak sesuai');
    }

    if (oldPassword === newPassword) {
      throw new Error('Password baru tidak boleh sama dengan password lama');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await AuthModel.updatePassword(userId, hashedNewPassword);

    return true;
  }
};

module.exports = { AuthService, setGetUserPenugasan };