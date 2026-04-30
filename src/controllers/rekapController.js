const RekapService = require('../services/rekapService');

const RekapController = {
  getRekapKehadiran: async (req, res) => {
    try {
      const { bulan, tahun, user_id, wilayah } = req.query;
      
      const result = await RekapService.getRekapKehadiran(bulan, tahun, user_id, wilayah);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get rekap kehadiran error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getDetailKehadiranUser: async (req, res) => {
    try {
      const { user_id, bulan, tahun } = req.query;
      
      const result = await RekapService.getDetailKehadiranUser(user_id, bulan, tahun, req.user);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get detail kehadiran user error:', error);
      
      if (error.message === 'User tidak ditemukan') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message === 'User ID wajib diisi') {
        return res.status(400).json({
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

  getRekapHarian: async (req, res) => {
    try {
      const { tanggal } = req.query;
      
      const result = await RekapService.getRekapHarian(tanggal);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get rekap harian error:', error);
      
      if (error.message.includes('wajib diisi') || error.message.includes('Format tanggal tidak valid')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  }
};

module.exports = RekapController;