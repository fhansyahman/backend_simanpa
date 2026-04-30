const PemutihanService = require('../services/pemutihanService');

const PemutihanController = {
  getDataForPemutihan: async (req, res) => {
    console.log('=== GET DATA PEMUTIHAN START ===');
    try {
      const { bulan, tahun, wilayah } = req.query;
      
      const result = await PemutihanService.getDataForPemutihan(bulan, tahun, wilayah, req.user);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error in getDataForPemutihan:', error);
      const statusCode = error.message.includes('wajib diisi') || error.message.includes('tidak valid') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  prosesPemutihan: async (req, res) => {
    console.log('=== PROSES PEMUTIHAN START ===');
    try {
      const { presensi_ids, catatan_pemutihan, jenis_pemutihan = 'manual' } = req.body;
      
      const result = await PemutihanService.prosesPemutihan(
        presensi_ids, catatan_pemutihan, jenis_pemutihan, req.user
      );
      
      res.json({
        success: true,
        message: `Berhasil memutihkan ${result.affected_rows} data presensi`,
        data: result
      });
    } catch (error) {
      console.error('Error in prosesPemutihan:', error);
      const statusCode = error.message.includes('wajib diisi') || 
                        error.message.includes('tidak ditemukan') ||
                        error.message.includes('sudah pernah') ||
                        error.message.includes('valid') ? 400 : 
                        error.message.includes('Hanya') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  batalkanPemutihan: async (req, res) => {
    console.log('=== BATAL PEMUTIHAN START ===');
    try {
      const { presensi_ids, alasan_pembatalan } = req.body;
      
      const result = await PemutihanService.batalkanPemutihan(presensi_ids, alasan_pembatalan, req.user);
      
      res.json({
        success: true,
        message: `Berhasil membatalkan ${result.affected_rows} data pemutihan`,
        data: result
      });
    } catch (error) {
      console.error('Error in batalkanPemutihan:', error);
      const statusCode = error.message.includes('wajib diisi') || 
                        error.message.includes('tidak ditemukan') ? 400 : 
                        error.message.includes('Hanya') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  getRiwayatPemutihan: async (req, res) => {
    console.log('=== GET RIWAYAT PEMUTIHAN START ===');
    try {
      const { start_date, end_date, wilayah, jenis = 'all' } = req.query;
      
      const result = await PemutihanService.getRiwayatPemutihan(start_date, end_date, wilayah, jenis, req.user);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error in getRiwayatPemutihan:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  }
};

module.exports = PemutihanController;