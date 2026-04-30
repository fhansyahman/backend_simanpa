const IzinService = require('../services/IzinService');
const fs = require('fs');

const IzinController = {
  getAllIzin: async (req, res) => {
    try {
      const { status, user_id, jenis, tanggal } = req.query;
      
      const izin = await IzinService.getAllIzin({ status, user_id, jenis, tanggal });
      
      res.json({
        success: true,
        data: izin,
        filters: { status, user_id, jenis, tanggal }
      });
    } catch (error) {
      console.error('Get all izin error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getIzinById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const izin = await IzinService.getIzinById(id);
      
      if (izin.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Data izin tidak ditemukan'
        });
      }
      
      res.json({
        success: true,
        data: izin[0]
      });
    } catch (error) {
      console.error('Get izin by id error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  getMyIzin: async (req, res) => {
    try {
      const userId = req.user.id;
      
      const izin = await IzinService.getMyIzin(userId);
      
      res.json({
        success: true,
        data: izin
      });
    } catch (error) {
      console.error('Get my izin error:', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    }
  },

  createIzin: async (req, res) => {
    try {
      const userId = req.user.id;
      const { jenis, tanggal_mulai, tanggal_selesai, keterangan, dokumen_pendukung } = req.body;
      
      console.log('Create izin attempt - User:', userId);
      console.log('Data:', { jenis, tanggal_mulai, tanggal_selesai, keterangan });
      
      if (!jenis || !tanggal_mulai || !tanggal_selesai) {
        return res.status(400).json({
          success: false,
          message: 'Jenis, tanggal mulai, dan tanggal selesai wajib diisi'
        });
      }
      
      const result = await IzinService.createIzin(userId, req.body, dokumen_pendukung);
      
      console.log('Izin berhasil dibuat - ID:', result.id);
      
      res.json({
        success: true,
        message: 'Izin berhasil diajukan',
        data: result
      });
    } catch (error) {
      console.error('Create izin error:', error);
      console.error('Error details:', error.message);
      
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  updateIzinStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const adminId = req.user.id;
      
      console.log('=== UPDATE IZIN STATUS START ===');
      
      const result = await IzinService.updateIzinStatus(id, status, adminId);
      
      console.log('Sending response');
      res.json({
        success: true,
        message: `Izin berhasil ${status.toLowerCase()}`,
        data: result
      });
    } catch (error) {
      console.error('!!! UPDATE IZIN STATUS ERROR:', error);
      
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  deleteIzin: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      await IzinService.deleteIzin(id, userId);
      
      res.json({
        success: true,
        message: 'Izin berhasil dihapus'
      });
    } catch (error) {
      console.error('Delete izin error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  createIzinByAdmin: async (req, res) => {
    try {
      const adminId = req.user.id;
      
      console.log('=== CREATE IZIN BY ADMIN START ===');
      console.log('Admin ID:', adminId);
      
      const result = await IzinService.adminCreateIzin(adminId, req.body);
      
      console.log('=== CREATE IZIN BY ADMIN SUCCESS ===');
      console.log('Response summary:', result);
      
      res.json({
        success: true,
        message: result.status === 'Disetujui' 
          ? `Izin berhasil dibuat dan disetujui. Presensi telah digenerate untuk ${result.presensi_generated} hari.`
          : `Izin berhasil dibuat dengan status ${result.status}`,
        data: result
      });
    } catch (error) {
      console.error('!!! CREATE IZIN BY ADMIN ERROR:', error);
      
      let errorMessage = error.message || 'Terjadi kesalahan server';
      let statusCode = 500;
      
      if (error.code === 'ER_DUP_ENTRY') {
        errorMessage = 'Data izin sudah ada';
        statusCode = 400;
      } else if (error.code === 'ER_NO_REFERENCED_ROW') {
        errorMessage = 'Referensi data tidak valid';
        statusCode = 400;
      } else if (error.code === 'ER_BAD_FIELD_ERROR') {
        errorMessage = 'Struktur tabel tidak sesuai';
        statusCode = 500;
      }
      
      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getMyIzinPerBulan: async (req, res) => {
    try {
      const userId = req.user.id;
      const { bulan, tahun } = req.query;
      
      console.log('Raw params - Bulan:', bulan, 'Tahun:', tahun);
      
      const result = await IzinService.getMyIzinPerBulan(userId, bulan, tahun);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('❌ Get izin per bulan error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getIzinPerTanggal: async (req, res) => {
    try {
      const userRoles = req.user.roles;
      const { tanggal, status, jenis, search } = req.query;
      
      const result = await IzinService.getIzinPerTanggal(userRoles, tanggal, status, jenis, search);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('❌ Get izin per tanggal error:', error);
      res.status(403).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getIzinTanggalOptions: async (req, res) => {
    try {
      const userRoles = req.user.roles;
      
      const options = await IzinService.getIzinTanggalOptions(userRoles);
      
      res.json({
        success: true,
        data: options
      });
    } catch (error) {
      console.error('Error get izin tanggal options:', error);
      res.status(403).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  downloadDokumen: async (req, res) => {
    try {
      const userRoles = req.user.roles;
      const { filename } = req.params;
      
      const { filePath, stats, filename: originalFilename } = await IzinService.downloadDokumen(userRoles, filename);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${originalFilename}"`);
      res.setHeader('Content-Length', stats.size);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
        console.error('Error streaming file:', error);
        res.status(500).json({
          success: false,
          message: 'Gagal mengirim file'
        });
      });
    } catch (error) {
      console.error('❌ Download dokumen error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

module.exports = IzinController;