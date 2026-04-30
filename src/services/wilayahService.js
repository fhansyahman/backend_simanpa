const { WilayahModel, UserModel, LogModel } = require('../models/wilayahModel');

const WilayahService = {
  getAllWilayah: async () => {
    return await WilayahModel.getAll();
  },

  getWilayahById: async (id) => {
    const wilayah = await WilayahModel.getById(id);
    if (!wilayah) {
      throw new Error('Wilayah tidak ditemukan');
    }
    return wilayah;
  },

  createWilayah: async (nama_wilayah, keterangan, userId) => {
    if (!nama_wilayah) {
      throw new Error('Nama wilayah wajib diisi');
    }

    const exists = await WilayahModel.isNamaExists(nama_wilayah);
    if (exists) {
      throw new Error('Nama wilayah sudah ada');
    }

    const insertId = await WilayahModel.create(nama_wilayah, keterangan);
    
    await LogModel.create(
      'WILAYAH_CREATE',
      `Admin membuat wilayah baru: ${nama_wilayah}`,
      userId
    );

    return insertId;
  },

  updateWilayah: async (id, nama_wilayah, keterangan, userId) => {
    const wilayah = await WilayahModel.getById(id);
    if (!wilayah) {
      throw new Error('Wilayah tidak ditemukan');
    }

    const exists = await WilayahModel.isNamaExists(nama_wilayah, id);
    if (exists) {
      throw new Error('Nama wilayah sudah ada');
    }

    await WilayahModel.update(id, nama_wilayah, keterangan);
    
    await LogModel.create(
      'WILAYAH_UPDATE',
      `Admin mengupdate wilayah: ${nama_wilayah}`,
      userId
    );
  },

  deleteWilayah: async (id, userId) => {
    const wilayah = await WilayahModel.getById(id);
    if (!wilayah) {
      throw new Error('Wilayah tidak ditemukan');
    }

    const hasUsers = await WilayahModel.hasUsers(id);
    if (hasUsers) {
      throw new Error('Tidak dapat menghapus wilayah karena masih ada user yang menggunakan wilayah ini');
    }

    await WilayahModel.delete(id);
    
    await LogModel.create(
      'WILAYAH_DELETE',
      `Admin menghapus wilayah: ${wilayah.nama_wilayah}`,
      userId
    );
  },

  getUsersByWilayah: async (wilayah_id) => {
    const wilayah = await WilayahModel.getById(wilayah_id);
    if (!wilayah) {
      throw new Error('Wilayah tidak ditemukan');
    }
    return await WilayahModel.getUsersByWilayahId(wilayah_id);
  },

  assignWilayahToUser: async (user_id, wilayah_id, userId) => {
    const user = await UserModel.getById(user_id);
    if (!user) {
      throw new Error('User tidak ditemukan');
    }

    if (user.roles !== 'pegawai') {
      throw new Error('Hanya user dengan roles pegawai yang dapat ditugaskan wilayah');
    }

    let wilayahName = null;
    if (wilayah_id) {
      const wilayah = await WilayahModel.getById(wilayah_id);
      if (!wilayah) {
        throw new Error('Wilayah tidak ditemukan');
      }
      wilayahName = wilayah.nama_wilayah;
    }

    await UserModel.updateWilayah(user_id, wilayah_id, wilayahName);
    
    await LogModel.create(
      'USER_WILAYAH_ASSIGN',
      `Admin menugaskan wilayah ${wilayahName || 'Tidak ada wilayah'} ke user ${user.nama}`,
      userId
    );
  },

  getWilayahStats: async () => {
    const stats = await WilayahModel.getStats();
    const noWilayahTotal = await WilayahModel.getUsersWithoutWilayah();
    
    return {
      wilayah_stats: stats,
      no_wilayah_total: noWilayahTotal
    };
  },

  getAllPegawai: async () => {
    return await UserModel.getAllPegawai();
  }
};

module.exports = WilayahService;