const KalenderService = require('../services/kalenderService');

const KalenderController = {
  // ========== HARI KERJA CONTROLLERS ==========
  getAllHariKerja: async (req, res) => {
    try {
      const { tahun, bulan } = req.query;
      const hariKerja = await KalenderService.getAllHariKerja({ tahun, bulan });
      res.json({
        success: true,
        data: hariKerja
      });
    } catch (error) {
      console.error('Get all hari kerja error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  createHariKerja: async (req, res) => {
    try {
      const { tanggal, is_hari_kerja, keterangan } = req.body;
      const insertId = await KalenderService.createHariKerja(
        { tanggal, is_hari_kerja, keterangan },
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: 'Hari kerja berhasil ditambahkan',
        data: { id: insertId }
      });
    } catch (error) {
      console.error('Create hari kerja error:', error);
      const status = error.message === 'Tanggal wajib diisi' || 
                     error.message === 'Tanggal sudah ada dalam database' ? 400 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  updateHariKerja: async (req, res) => {
    try {
      const { id } = req.params;
      const { tanggal, is_hari_kerja, keterangan } = req.body;

      await KalenderService.updateHariKerja(
        id,
        { tanggal, is_hari_kerja, keterangan },
        req.user.id
      );

      res.json({
        success: true,
        message: 'Hari kerja berhasil diupdate'
      });
    } catch (error) {
      console.error('Update hari kerja error:', error);
      let status = 500;
      if (error.message === 'Data hari kerja tidak ditemukan') status = 404;
      else if (error.message === 'Tanggal sudah ada dalam database') status = 400;
      
      res.status(status).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  deleteHariKerja: async (req, res) => {
    try {
      const { id } = req.params;
      await KalenderService.deleteHariKerja(id, req.user.id);

      res.json({
        success: true,
        message: 'Hari kerja berhasil dihapus'
      });
    } catch (error) {
      console.error('Delete hari kerja error:', error);
      res.status(error.message === 'Data hari kerja tidak ditemukan' ? 404 : 500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  bulkCreateHariKerja: async (req, res) => {
    try {
      const { start_date, end_date, is_hari_kerja, keterangan } = req.body;
      const result = await KalenderService.bulkCreateHariKerja(
        { start_date, end_date, is_hari_kerja, keterangan },
        req.user.id
      );

      res.json({
        success: true,
        message: `Bulk update berhasil: ${result.createdCount} dibuat, ${result.updatedCount} diupdate`,
        data: {
          created: result.createdCount,
          updated: result.updatedCount
        }
      });
    } catch (error) {
      console.error('Bulk create hari kerja error:', error);
      res.status(error.message.includes('wajib diisi') ? 400 : 500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  // ========== HARI LIBUR CONTROLLERS ==========
  getAllHariLibur: async (req, res) => {
    try {
      const { tahun, is_tahunan } = req.query;
      const hariLibur = await KalenderService.getAllHariLibur({ tahun, is_tahunan });
      res.json({
        success: true,
        data: hariLibur
      });
    } catch (error) {
      console.error('Get all hari libur error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  createHariLibur: async (req, res) => {
    try {
      const { tanggal, nama_libur, is_tahunan, tahun } = req.body;
      const insertId = await KalenderService.createHariLibur(
        { tanggal, nama_libur, is_tahunan, tahun },
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: 'Hari libur berhasil ditambahkan',
        data: { id: insertId }
      });
    } catch (error) {
      console.error('Create hari libur error:', error);
      const status = error.message === 'Tanggal dan nama libur wajib diisi' ||
                     error.message === 'Tanggal sudah ada dalam database' ? 400 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  updateHariLibur: async (req, res) => {
    try {
      const { id } = req.params;
      const { tanggal, nama_libur, is_tahunan, tahun } = req.body;

      await KalenderService.updateHariLibur(
        id,
        { tanggal, nama_libur, is_tahunan, tahun },
        req.user.id
      );

      res.json({
        success: true,
        message: 'Hari libur berhasil diupdate'
      });
    } catch (error) {
      console.error('Update hari libur error:', error);
      let status = 500;
      if (error.message === 'Data hari libur tidak ditemukan') status = 404;
      else if (error.message === 'Tanggal sudah ada dalam database') status = 400;
      
      res.status(status).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  deleteHariLibur: async (req, res) => {
    try {
      const { id } = req.params;
      await KalenderService.deleteHariLibur(id, req.user.id);

      res.json({
        success: true,
        message: 'Hari libur berhasil dihapus'
      });
    } catch (error) {
      console.error('Delete hari libur error:', error);
      res.status(error.message === 'Data hari libur tidak ditemukan' ? 404 : 500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  // ========== KALENDER CONTROLLER ==========
  getKalender: async (req, res) => {
    try {
      const { tahun, bulan } = req.query;
      const kalender = await KalenderService.getKalender({ tahun, bulan });
      res.json({
        success: true,
        data: kalender
      });
    } catch (error) {
      console.error('Get kalender error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  }
};

module.exports = KalenderController;