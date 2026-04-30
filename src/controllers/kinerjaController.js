const KinerjaService = require('../services/KinerjaService');

const KinerjaController = {
  createKinerja: async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await KinerjaService.createKinerja(userId, req.body);
      
      res.status(201).json({
        success: true,
        message: 'Data kinerja harian berhasil disimpan',
        data: result
      });
    } catch (error) {
      console.error('Create kinerja error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  createKinerjaWithCamera: async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await KinerjaService.createKinerjaWithCamera(userId, req.body);
      
      res.status(201).json({
        success: true,
        message: 'Data kinerja harian berhasil disimpan (via kamera)',
        data: result
      });
    } catch (error) {
      console.error('Create kinerja with camera error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server saat menyimpan data dari kamera'
      });
    }
  },

  getKinerjaUser: async (req, res) => {
    try {
      const userId = req.user.id;
      const { bulan, tahun } = req.query;
      
      const data = await KinerjaService.getKinerjaUser(userId, bulan, tahun);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Get kinerja user error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getKinerjaById: async (req, res) => {
    try {
      const { id } = req.params;
      const data = await KinerjaService.getKinerjaById(id);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Get kinerja by id error:', error);
      res.status(404).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  updateKinerja: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      await KinerjaService.updateKinerja(id, userId, userRole, req.body);
      
      res.json({
        success: true,
        message: 'Data kinerja berhasil diupdate'
      });
    } catch (error) {
      console.error('Update kinerja error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  deleteKinerja: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      await KinerjaService.deleteKinerja(id, userId, userRole);
      
      res.json({
        success: true,
        message: 'Data kinerja berhasil dihapus'
      });
    } catch (error) {
      console.error('Delete kinerja error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  getAllKinerja: async (req, res) => {
    try {
      const { start_date, end_date, wilayah, user_id } = req.query;
      const data = await KinerjaService.getAllKinerja(start_date, end_date, wilayah, user_id);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Get all kinerja error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getKinerjaStatistik: async (req, res) => {
    try {
      const { bulan, tahun, wilayah } = req.query;
      const data = await KinerjaService.getKinerjaStatistik(bulan, tahun, wilayah);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Get kinerja statistik error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  generatePDF: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const { pdfBuffer, kinerjaData } = await KinerjaService.generatePDF(id, userId);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Laporan_${kinerjaData.nama}_${kinerjaData.tanggal}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Generate PDF error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan saat generate PDF'
      });
    }
  },

  generateRekapWilayah: async (req, res) => {
    try {
      const { wilayah, start_date, end_date } = req.body;
      const userId = req.user.id;
      
      const { pdfBuffer, wilayah: wilayahName } = await KinerjaService.generateRekapWilayah(wilayah, start_date, end_date, userId);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Rekap_Wilayah_${wilayahName}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Generate rekap wilayah error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan saat generate rekap PDF'
      });
    }
  },

  downloadAllWilayah: async (req, res) => {
    try {
      const { wilayah, start_date, end_date } = req.query;
      const userId = req.user.id;
      
      if (!wilayah) {
        return res.status(400).json({
          success: false,
          message: 'Wilayah harus diisi'
        });
      }
      
      const { zipBuffer, wilayah: wilayahName } = await KinerjaService.downloadAllWilayah(wilayah, start_date, end_date, userId);
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="Semua_Laporan_Wilayah_${wilayahName}.zip"`);
      res.send(zipBuffer);
    } catch (error) {
      console.error('Download all wilayah error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan saat download semua laporan'
      });
    }
  },

  getKinerjaUserPerBulan: async (req, res) => {
    try {
      const userId = req.user.id;
      const { bulan, tahun } = req.query;
      
      const data = await KinerjaService.getKinerjaUserPerBulan(userId, bulan, tahun);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('❌ Get kinerja per bulan error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getKinerjaPerTanggal: async (req, res) => {
    try {
      const userRoles = req.user.roles;
      const { tanggal, wilayah, search } = req.query;
      
      const data = await KinerjaService.getKinerjaPerTanggal(userRoles, tanggal, wilayah, search);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('❌ Get kinerja per tanggal error:', error);
      res.status(403).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getAllKinerjaPerBulan: async (req, res) => {
    try {
      const userRoles = req.user.roles;
      const { bulan, tahun, wilayah, search } = req.query;
      
      const data = await KinerjaService.getAllKinerjaPerBulan(userRoles, bulan, tahun, wilayah, search);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('❌ Get all kinerja per bulan error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getRekapLaporanKerjaBulanan: async (req, res) => {
    try {
      const userRoles = req.user.roles || [];
      const { bulan, tahun } = req.query;
      
      const data = await KinerjaService.getRekapLaporanKerjaBulanan(userRoles, bulan, tahun);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('❌ Get rekap laporan kerja bulanan error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  exportRekapLaporanExcel: async (req, res) => {
    try {
      const userRoles = req.user.roles || [];
      const { bulan, tahun } = req.query;
      
      const { csvData, bulanNama, tahun: targetTahun } = await KinerjaService.exportRekapLaporanExcel(userRoles, bulan, tahun);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="rekap_laporan_kerja_${bulanNama}_${targetTahun}.csv"`);
      res.send(csvData);
    } catch (error) {
      console.error('Export rekap laporan error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  getPegawaiDashboardKinerja: async (req, res) => {
    try {
      const userId = req.user.id;
      const { bulan, tahun } = req.query;
      
      const data = await KinerjaService.getPegawaiDashboardKinerja(userId, bulan, tahun);
      
      return res.status(200).json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('❌ Pegawai dashboard error:', error);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server: ' + error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
};

module.exports = KinerjaController;