// Di file routes/dashboard.js, pastikan urutan route benar
const express = require('express');
const { 
  // FUNGSI LAMA
  getDashboardHariIni,
  getGrafikHadirBulanan,
  getPegawaiBelumAbsen,
  getDaftarWilayah,
  getDashboardKinerjaHariIni,
  getGrafikKinerjaBulanan,
  
  // FUNGSI BARU (TAMBAHAN)
  getDashboardKehadiranByDate,
  getPegawaiBelumAbsenByDate,
  getPresensiHarianByDate,
  getDashboardKinerjaByDate,
  getPegawaiIzinByDate,
} = require('../controllers/dashboarController'); // PERBAIKI TYPO: dashboarController -> dashboardController
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'atasan'));

// ==================== ROUTES DENGAN FILTER TANGGAL (LETAKKAN DI ATAS AGAR TIDAK BENTUR) ====================
// Kehadiran dengan filter tanggal - GET /admin/dashboard/kehadiran?tanggal=YYYY-MM-DD
router.get('/kehadiran', getDashboardKehadiranByDate);

// Presensi harian dengan filter tanggal - GET /admin/presensi?tanggal=YYYY-MM-DD
router.get('/presensi', getPresensiHarianByDate);

// Kinerja dengan filter tanggal - GET /admin/dashboard/kinerja?tanggal=YYYY-MM-DD
router.get('/kinerja', getDashboardKinerjaByDate);

// Pegawai belum absen dengan filter tanggal - GET /admin/dashboard/pegawai-belum-absen-filter?tanggal=YYYY-MM-DD
router.get('/pegawai-belum-absen-filter', getPegawaiBelumAbsenByDate);
router.get('/pegawai-izin', getPegawaiIzinByDate);
// ==================== ROUTES LAMA (TETAP) ====================
// Kehadiran hari ini (tanpa filter)
router.get('/kehadiran-hari-ini', getDashboardHariIni);

// Kinerja hari ini (tanpa filter)
router.get('/kinerja-hari-ini', getDashboardKinerjaHariIni);

// Grafik
router.get('/kehadiran-bulanan', getGrafikHadirBulanan);
router.get('/kinerja-bulanan', getGrafikKinerjaBulanan);

// Utility
router.get('/pegawai-belum-absen', getPegawaiBelumAbsen);
router.get('/daftar-wilayah', getDaftarWilayah);

module.exports = router;