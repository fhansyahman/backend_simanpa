const DashboardService = require('../services/dashboardService');

/**
 * =========================
 * DASHBOARD HARI INI
 * =========================
 */
const getDashboardHariIni = async (req, res) => {
  try {
    const data = await DashboardService.getDashboardHariIni();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard hari ini error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * GRAFIK KEHADIRAN BULANAN
 * =========================
 */
const getGrafikHadirBulanan = async (req, res) => {
  try {
    const { tahun, bulan, wilayah } = req.query;
    const data = await DashboardService.getGrafikHadirBulanan(tahun, bulan, wilayah);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Grafik bulanan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * PEGAWAI BELUM ABSEN
 * =========================
 */
const getPegawaiBelumAbsen = async (req, res) => {
  try {
    const data = await DashboardService.getPegawaiBelumAbsen();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Pegawai belum absen error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * DAFTAR WILAYAH
 * =========================
 */
const getDaftarWilayah = async (req, res) => {
  try {
    const data = await DashboardService.getDaftarWilayah();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Daftar wilayah error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * GRAFIK KINERJA BULANAN - DIAGRAM BATANG
 * =========================
 */
const getGrafikKinerjaBulanan = async (req, res) => {
  try {
    const { tahun, bulan } = req.query;
    const data = await DashboardService.getGrafikKinerjaBulanan(tahun, bulan);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Grafik kinerja bulanan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * DASHBOARD KINERJA HARI INI
 * =========================
 */
const getDashboardKinerjaHariIni = async (req, res) => {
  try {
    const data = await DashboardService.getDashboardKinerjaHariIni();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard kinerja hari ini error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * DASHBOARD KEHADIRAN DENGAN FILTER TANGGAL (TAMBAHAN)
 * =========================
 */
const getDashboardKehadiranByDate = async (req, res) => {
  try {
    const { tanggal } = req.query;
    const data = await DashboardService.getDashboardKehadiranByDate(tanggal);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard kehadiran by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * PEGAWAI BELUM ABSEN DENGAN FILTER TANGGAL (TAMBAHAN)
 * TANPA NIP - SAMA PERSIS DENGAN FUNGSI LAMA
 * =========================
 */
const getPegawaiBelumAbsenByDate = async (req, res) => {
  try {
    const { tanggal } = req.query;
    const data = await DashboardService.getPegawaiBelumAbsenByDate(tanggal);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Pegawai belum absen by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * PRESENSI HARIAN DENGAN FILTER TANGGAL (TAMBAHAN)
 * TANPA NIP - HANYA FIELD YANG ADA DI DATABASE
 * =========================
 */
const getPresensiHarianByDate = async (req, res) => {
  try {
    const { tanggal } = req.query;
    const data = await DashboardService.getPresensiHarianByDate(tanggal);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Presensi harian by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * DASHBOARD KINERJA DENGAN FILTER TANGGAL (TAMBAHAN)
 * TANPA NIP - SAMA PERSIS DENGAN FUNGSI LAMA
 * =========================
 */
const getDashboardKinerjaByDate = async (req, res) => {
  try {
    const { tanggal } = req.query;
    const data = await DashboardService.getDashboardKinerjaByDate(tanggal);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard kinerja by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * =========================
 * PEGAWAI IZIN/SAKIT/CUTI BERDASARKAN TANGGAL (TAMBAHAN)
 * =========================
 */
const getPegawaiIzinByDate = async (req, res) => {
  try {
    const { tanggal } = req.query;
    const data = await DashboardService.getPegawaiIzinByDate(tanggal);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Pegawai izin by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

module.exports = {
  // FUNGSI LAMA (TETAP ADA)
  getDashboardHariIni,
  getGrafikHadirBulanan,
  getPegawaiBelumAbsen,
  getDaftarWilayah,
  getGrafikKinerjaBulanan,
  getDashboardKinerjaHariIni,
  
  // FUNGSI BARU (TAMBAHAN UNTUK FILTER TANGGAL)
  getDashboardKehadiranByDate,
  getPegawaiBelumAbsenByDate,
  getPresensiHarianByDate,
  getDashboardKinerjaByDate,
  getPegawaiIzinByDate
};