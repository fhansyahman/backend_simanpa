const express = require('express');
const { 
  getAllPresensi,
  getPresensiHariIni,
  getPresensiBulanan,
  getPresensiById,
  updatePresensi,
  deletePresensi,
  generatePresensiHariIni,
  getStatistikPresensi,
  getStatistikHarian,
  getStatistikBulanan,
  getDashboardSummary,
  getRekapKehadiranBulanan,
  exportRekapKehadiranExcel
} = require('../controllers/adminPresensiController');

// Import penugasan controller untuk admin


const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Middleware untuk semua route di file ini
router.use(authenticate);
router.use(authorize('admin', 'atasan'));

// ==================== ROUTES PRESENSI ====================
router.get('/hari-ini', getPresensiHariIni);
router.get('/bulanan', getPresensiBulanan);
router.get('/', getAllPresensi);
router.get('/statistik', getStatistikPresensi);
router.get('/:id', getPresensiById);
router.put('/:id', updatePresensi);
router.delete('/:id', deletePresensi);
router.post('/generate-hari-ini', generatePresensiHariIni);
router.get('/statistik/harian', getStatistikHarian);
router.get('/statistik/bulanan', getStatistikBulanan);
router.get('/dashboard/summary', getDashboardSummary);
router.get('/rekap-bulanan', getRekapKehadiranBulanan);
router.get('/export-rekap-excel', exportRekapKehadiranExcel);

// ========
// ==================== ROUTES EKSTRA UNTUK PENUGASAN ====================

// Get semua penugasan aktif untuk user tertentu
router.get('/penugasan/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = require('../config/database');
    
    const [assignments] = await pool.execute(
      `SELECT p.*, ap.tipe_assign, ap.assigned_at
       FROM assignment_pekerja ap
       JOIN penugasan_kerja p ON ap.penugasan_id = p.id
       WHERE ap.user_id = ? 
         AND ap.status = 'aktif'
         AND p.status = 'aktif'
         AND CURDATE() BETWEEN p.tanggal_mulai AND p.tanggal_selesai
       ORDER BY p.created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Get user penugasan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
});

// Get statistik penugasan overview
router.get('/penugasan-stats/overview', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    const [totalActive] = await pool.execute(
      `SELECT COUNT(*) as total FROM penugasan_kerja WHERE status = 'aktif'`
    );
    
    const [totalSelesai] = await pool.execute(
      `SELECT COUNT(*) as total FROM penugasan_kerja WHERE status = 'selesai'`
    );
    
    const [totalDibatalkan] = await pool.execute(
      `SELECT COUNT(*) as total FROM penugasan_kerja WHERE status = 'dibatalkan'`
    );
    
    const [totalPekerja] = await pool.execute(
      `SELECT COUNT(DISTINCT user_id) as total 
       FROM assignment_pekerja ap
       JOIN penugasan_kerja p ON ap.penugasan_id = p.id
       WHERE ap.status = 'aktif' AND p.status = 'aktif'`
    );
    
    const [recentPenugasan] = await pool.execute(
      `SELECT p.*, COUNT(ap.user_id) as total_pekerja
       FROM penugasan_kerja p
       LEFT JOIN assignment_pekerja ap ON p.id = ap.penugasan_id AND ap.status = 'aktif'
       WHERE p.status = 'aktif'
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT 5`
    );
    
    res.json({
      success: true,
      data: {
        total_penugasan_aktif: totalActive[0].total,
        total_penugasan_selesai: totalSelesai[0].total,
        total_penugasan_dibatalkan: totalDibatalkan[0].total,
        total_pekerja_terlibat: totalPekerja[0].total,
        recent_penugasan: recentPenugasan
      }
    });
  } catch (error) {
    console.error('Get penugasan stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
});

// Generate laporan penugasan per periode
router.get('/penugasan-laporan/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    const { pool } = require('../config/database');
    const { DateTime } = require('luxon');
    
    const startDate = start_date || DateTime.now().setZone('Asia/Jakarta').startOf('month').toISODate();
    const endDate = end_date || DateTime.now().setZone('Asia/Jakarta').toISODate();
    
    const [penugasan] = await pool.execute(
      `SELECT * FROM penugasan_kerja WHERE id = ?`,
      [id]
    );
    
    if (penugasan.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Penugasan tidak ditemukan'
      });
    }
    
    const [assignedUsers] = await pool.execute(
      `SELECT ap.user_id, u.nama, u.jabatan, u.wilayah_penugasan
       FROM assignment_pekerja ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.penugasan_id = ? AND ap.status = 'aktif'`,
      [id]
    );
    
    const [presensiList] = await pool.execute(
      `SELECT pr.*, u.nama as user_nama
       FROM presensi pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.penugasan_id = ? AND pr.tanggal BETWEEN ? AND ?
       ORDER BY pr.tanggal ASC`,
      [id, startDate, endDate]
    );
    
    const rekapPerUser = assignedUsers.map(user => {
      const userPresensi = presensiList.filter(p => p.user_id === user.user_id);
      
      let hadir = 0;
      let izin = 0;
      let tanpaKeterangan = 0;
      let terlambat = 0;
      
      for (const presensi of userPresensi) {
        if (presensi.izin_id) {
          izin++;
        } else if (!presensi.jam_masuk) {
          tanpaKeterangan++;
        } else {
          hadir++;
          if (presensi.status_masuk === 'Terlambat' || presensi.status_masuk === 'Terlambat Berat') {
            terlambat++;
          }
        }
      }
      
      const persenKehadiran = userPresensi.length > 0 ? Math.round((hadir / userPresensi.length) * 100) : 0;
      
      return {
        user_id: user.user_id,
        nama: user.nama,
        jabatan: user.jabatan,
        wilayah: user.wilayah_penugasan,
        total_hari: userPresensi.length,
        hadir: hadir,
        izin: izin,
        tanpa_keterangan: tanpaKeterangan,
        terlambat: terlambat,
        persen_kehadiran: persenKehadiran
      };
    });
    
    let totalHari = 0;
    let currentDate = DateTime.fromISO(startDate);
    const endDateObj = DateTime.fromISO(endDate);
    
    while (currentDate <= endDateObj) {
      totalHari++;
      currentDate = currentDate.plus({ days: 1 });
    }
    
    const totalHadir = rekapPerUser.reduce((sum, u) => sum + u.hadir, 0);
    const totalKehadiran = rekapPerUser.length > 0 ? Math.round(totalHadir / (rekapPerUser.length * totalHari) * 100) : 0;
    
    res.json({
      success: true,
      data: {
        penugasan: penugasan[0],
        periode: {
          start_date: startDate,
          end_date: endDate,
          total_hari: totalHari
        },
        rekap_per_user: rekapPerUser,
        total_pekerja: assignedUsers.length,
        total_kehadiran: totalKehadiran,
        total_izin: rekapPerUser.reduce((sum, u) => sum + u.izin, 0),
        total_tanpa_keterangan: rekapPerUser.reduce((sum, u) => sum + u.tanpa_keterangan, 0)
      }
    });
    
  } catch (error) {
    console.error('Generate penugasan laporan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
});

module.exports = router;