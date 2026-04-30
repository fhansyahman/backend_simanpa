const { UserManagementModel, UserManagementLogModel } = require('../models/userManagementModel');

const UserManagementService = {
  getAllUsers: async (filters) => {
    return await UserManagementModel.getAll(filters);
  },

  getUserById: async (id) => {
    const user = await UserManagementModel.getById(id);
    if (!user) {
      throw new Error('Data user tidak ditemukan');
    }
    return user;
  },

  deactivateUser: async (id, adminId) => {
    // Cek apakah user exists
    const user = await UserManagementModel.getBasicInfo(id);
    if (!user) {
      throw new Error('Data user tidak ditemukan');
    }

    // Cek apakah user sudah nonaktif
    if (user.is_active === 0) {
      throw new Error('User sudah dalam status nonaktif');
    }

    // Update status user menjadi nonaktif
    await UserManagementModel.deactivate(id);

    // Log activity
    await UserManagementLogModel.create(
      'DEACTIVATE_USER',
      `Admin menonaktifkan user: ${user.nama} (${user.jabatan})`,
      adminId
    );

    return {
      user_id: parseInt(id),
      nama: user.nama,
      is_active: 0,
      status: 'Nonaktif'
    };
  },

  activateUser: async (id, adminId) => {
    // Cek apakah user exists
    const user = await UserManagementModel.getBasicInfo(id);
    if (!user) {
      throw new Error('Data user tidak ditemukan');
    }

    // Cek apakah user sudah aktif
    if (user.is_active === 1) {
      throw new Error('User sudah dalam status aktif');
    }

    // Update status user menjadi aktif
    await UserManagementModel.activate(id);

    // Log activity
    await UserManagementLogModel.create(
      'ACTIVATE_USER',
      `Admin mengaktifkan user: ${user.nama} (${user.jabatan})`,
      adminId
    );

    return {
      user_id: parseInt(id),
      nama: user.nama,
      is_active: 1,
      status: 'Aktif'
    };
  },

  updateUserStatus: async (id, status, adminId) => {
    // Validasi status
    const validStatuses = ['Aktif', 'Nonaktif', 'Cuti', 'Resign'];
    if (!status || !validStatuses.includes(status)) {
      throw new Error('Status harus Aktif, Nonaktif, Cuti, atau Resign');
    }

    // Cek apakah user exists
    const user = await UserManagementModel.getBasicInfo(id);
    if (!user) {
      throw new Error('Data user tidak ditemukan');
    }

    // Tentukan is_active berdasarkan status
    const is_active = status === 'Aktif' ? 1 : 0;

    // Update status user
    await UserManagementModel.updateStatus(id, status, is_active);

    // Log activity
    await UserManagementLogModel.create(
      'UPDATE_USER_STATUS',
      `Admin mengubah status user ${user.nama} menjadi ${status}`,
      adminId
    );

    return {
      user_id: parseInt(id),
      nama: user.nama,
      status: status,
      is_active: is_active
    };
  },

  getActiveUsers: async () => {
    return await UserManagementModel.getActiveUsers();
  },

  getInactiveUsers: async () => {
    return await UserManagementModel.getInactiveUsers();
  }
};

module.exports = UserManagementService;