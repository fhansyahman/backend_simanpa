const UserManagementService = require('../services/userManagementService');

const UserManagementController = {
  getAllUsers: async (req, res) => {
    try {
      const { search, status, is_active } = req.query;
      const filters = { search, status, is_active };
      
      const users = await UserManagementService.getAllUsers(filters);

      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getUserById: async (req, res) => {
    try {
      const { id } = req.params;
      const user = await UserManagementService.getUserById(id);

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Get user by id error:', error);
      
      if (error.message === 'Data user tidak ditemukan') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  deactivateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      console.log('=== DEACTIVATE USER START ===');

      const result = await UserManagementService.deactivateUser(id, adminId);

      console.log('User deactivated successfully');

      res.json({
        success: true,
        message: `User ${result.nama} berhasil dinonaktifkan`,
        data: result
      });
    } catch (error) {
      console.error('!!! DEACTIVATE USER ERROR:', error);
      
      let statusCode = 500;
      let errorMessage = 'Terjadi kesalahan server';
      
      if (error.message === 'Data user tidak ditemukan') {
        statusCode = 404;
        errorMessage = error.message;
      } else if (error.message === 'User sudah dalam status nonaktif') {
        statusCode = 400;
        errorMessage = error.message;
      }
      
      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  },

  activateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      console.log('=== ACTIVATE USER START ===');

      const result = await UserManagementService.activateUser(id, adminId);

      console.log('User activated successfully');

      res.json({
        success: true,
        message: `User ${result.nama} berhasil diaktifkan`,
        data: result
      });
    } catch (error) {
      console.error('!!! ACTIVATE USER ERROR:', error);
      
      let statusCode = 500;
      let errorMessage = 'Terjadi kesalahan server';
      
      if (error.message === 'Data user tidak ditemukan') {
        statusCode = 404;
        errorMessage = error.message;
      } else if (error.message === 'User sudah dalam status aktif') {
        statusCode = 400;
        errorMessage = error.message;
      }
      
      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  },

  updateUserStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const adminId = req.user.id;

      console.log('=== UPDATE USER STATUS START ===');

      const result = await UserManagementService.updateUserStatus(id, status, adminId);

      console.log('User status updated successfully');

      res.json({
        success: true,
        message: `Status user ${result.nama} berhasil diubah menjadi ${result.status}`,
        data: result
      });
    } catch (error) {
      console.error('!!! UPDATE USER STATUS ERROR:', error);
      
      let statusCode = 500;
      let errorMessage = 'Terjadi kesalahan server';
      
      if (error.message === 'Data user tidak ditemukan') {
        statusCode = 404;
        errorMessage = error.message;
      } else if (error.message.includes('Status harus')) {
        statusCode = 400;
        errorMessage = error.message;
      }
      
      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  },

  getActiveUsers: async (req, res) => {
    try {
      const users = await UserManagementService.getActiveUsers();

      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Get active users error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getInactiveUsers: async (req, res) => {
    try {
      const users = await UserManagementService.getInactiveUsers();

      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Get inactive users error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  }
};

module.exports = UserManagementController;