const WilayahService = require('../services/wilayahService');

const WilayahController = {
  getAllWilayah: async (req, res) => {
    try {
      const wilayah = await WilayahService.getAllWilayah();
      res.json({ success: true, data: wilayah });
    } catch (error) {
      console.error('Get all wilayah error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  getWilayahById: async (req, res) => {
    try {
      const wilayah = await WilayahService.getWilayahById(req.params.id);
      res.json({ success: true, data: wilayah });
    } catch (error) {
      if (error.message === 'Wilayah tidak ditemukan') {
        return res.status(404).json({ success: false, message: error.message });
      }
      console.error('Get wilayah by id error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  createWilayah: async (req, res) => {
    try {
      const { nama_wilayah, keterangan } = req.body;
      const insertId = await WilayahService.createWilayah(nama_wilayah, keterangan, req.user.id);
      res.status(201).json({
        success: true,
        message: 'Wilayah berhasil dibuat',
        data: { id: insertId }
      });
    } catch (error) {
      if (error.message === 'Nama wilayah wajib diisi' || error.message === 'Nama wilayah sudah ada') {
        return res.status(400).json({ success: false, message: error.message });
      }
      console.error('Create wilayah error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  updateWilayah: async (req, res) => {
    try {
      const { id } = req.params;
      const { nama_wilayah, keterangan } = req.body;
      await WilayahService.updateWilayah(id, nama_wilayah, keterangan, req.user.id);
      res.json({ success: true, message: 'Wilayah berhasil diupdate' });
    } catch (error) {
      if (error.message === 'Wilayah tidak ditemukan') {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message === 'Nama wilayah sudah ada') {
        return res.status(400).json({ success: false, message: error.message });
      }
      console.error('Update wilayah error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  deleteWilayah: async (req, res) => {
    try {
      const { id } = req.params;
      await WilayahService.deleteWilayah(id, req.user.id);
      res.json({ success: true, message: 'Wilayah berhasil dihapus' });
    } catch (error) {
      if (error.message === 'Wilayah tidak ditemukan') {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message.includes('Tidak dapat menghapus wilayah')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      console.error('Delete wilayah error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  getUsersByWilayah: async (req, res) => {
    try {
      const users = await WilayahService.getUsersByWilayah(req.params.wilayah_id);
      res.json({ success: true, data: users });
    } catch (error) {
      if (error.message === 'Wilayah tidak ditemukan') {
        return res.status(404).json({ success: false, message: error.message });
      }
      console.error('Get users by wilayah error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  assignWilayahToUser: async (req, res) => {
    try {
      const { user_id } = req.params;
      const { wilayah_id } = req.body;
      await WilayahService.assignWilayahToUser(user_id, wilayah_id, req.user.id);
      res.json({
        success: true,
        message: `Wilayah berhasil ${wilayah_id ? 'ditugaskan' : 'dihapus'} dari user`
      });
    } catch (error) {
      if (error.message === 'User tidak ditemukan' || error.message === 'Wilayah tidak ditemukan') {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message === 'Hanya user dengan roles pegawai yang dapat ditugaskan wilayah') {
        return res.status(400).json({ success: false, message: error.message });
      }
      console.error('Assign wilayah to user error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  getWilayahStats: async (req, res) => {
    try {
      const stats = await WilayahService.getWilayahStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Get wilayah stats error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  },

  getAllPegawai: async (req, res) => {
    try {
      const pegawai = await WilayahService.getAllPegawai();
      res.json({ success: true, data: pegawai });
    } catch (error) {
      console.error('Get all pegawai error:', error);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
  }
};

module.exports = WilayahController;