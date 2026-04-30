const UserService = require('../services/userService');

const UserController = {
  getAllUsers: async (req, res) => {
    try {
      const users = await UserService.getAllUsers();
      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getUserById: async (req, res) => {
    try {
      const { id } = req.params;
      const user = await UserService.getUserById(id);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      if (error.message === 'User tidak ditemukan') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      console.error('Get user by id error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  createUser: async (req, res) => {
    try {
      console.log(`📥 Request create user: ${req.body.nama}`);
      console.log(`📸 Ada foto: ${!!req.body.foto}`);
      console.log(`📍 Wilayah penugasan: ${req.body.wilayah_penugasan || 'Tidak diisi'}`);

      const insertId = await UserService.createUser(req.body, req.user?.id || 1);
      
      console.log('✅ User berhasil dibuat:', insertId);

      res.json({
        success: true,
        message: 'User berhasil ditambahkan',
        data: {
          id: insertId
        }
      });
    } catch (error) {
      console.error('❌ Create user error:', error);
      
      let errorMessage = 'Terjadi kesalahan server';
      if (error.message.includes('PayloadTooLargeError')) {
        errorMessage = 'Ukuran foto terlalu besar. Silakan gunakan foto yang lebih kecil atau kompres terlebih dahulu.';
      } else if (error.message.includes('Ukuran foto terlalu besar')) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      res.status(error.message.includes('wajib diisi') || error.message.includes('sudah digunakan') ? 400 : 500).json({
        success: false,
        message: errorMessage,
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`📥 Request update user ID: ${id}`);
      console.log(`📸 Ada foto: ${!!req.body.foto}`);
      console.log(`📍 Wilayah penugasan: ${req.body.wilayah_penugasan || 'Tidak diisi'}`);

      const result = await UserService.updateUser(id, req.body, req.user?.id || 1);
      
      console.log('✅ User berhasil diupdate:', id);

      res.json({
        success: true,
        message: 'User berhasil diupdate',
        data: result
      });
    } catch (error) {
      console.error('❌ Update user error:', error);
      
      let errorMessage = 'Terjadi kesalahan server';
      if (error.message.includes('PayloadTooLargeError')) {
        errorMessage = 'Ukuran foto terlalu besar. Silakan gunakan foto yang lebih kecil atau kompres terlebih dahulu.';
      } else if (error.message.includes('Ukuran foto terlalu besar')) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      res.status(error.message.includes('tidak ditemukan') ? 404 : 
                error.message.includes('sudah digunakan') ? 400 : 500).json({
        success: false,
        message: errorMessage,
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`🗑️ Request delete user ID: ${id}`);

      await UserService.deleteUser(id, req.user?.id || 1);
      
      console.log('✅ User berhasil dihapus:', id);

      res.json({
        success: true,
        message: 'User berhasil dihapus'
      });
    } catch (error) {
      console.error('❌ Delete user error:', error);
      res.status(error.message === 'User tidak ditemukan' ? 404 : 500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  updateUserPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;
      
      console.log(`🔐 Request update password user ID: ${id}`);

      await UserService.updateUserPassword(id, password, req.user?.id || 1);
      
      console.log('✅ Password berhasil diupdate untuk user:', id);

      res.json({
        success: true,
        message: 'Password berhasil diupdate'
      });
    } catch (error) {
      console.error('❌ Update password error:', error);
      res.status(error.message === 'User tidak ditemukan' ? 404 : 
                error.message === 'Password wajib diisi' ? 400 : 500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  }
};

module.exports = UserController;