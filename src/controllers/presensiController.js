const {
  presensiMasuk,
  presensiPulang,
  getPresensiHariIni,
  getPresensiUser,
  getPresensiUserPerBulan,
  getAllPresensi,
  getAllPresensiPerBulan,
  getRekapPresensi,
  generatePresensiForDate,
  generatePresensiHariIniOnStartup,
  updatePresensiStatusAkhirHari,
  checkAndUpdateIzinPresensi,
  generatePresensiManual,
  generatePresensiHariIni,
  generatePresensiRange,
  updateTanpaKeteranganEarly,
  generatePresensiForDateRange,
  generatePresensiOtomatis,
  fixPresensiData,
  getGenerateStats,
  checkHariKerja,
  checkUserIzin,
  setupPresensiCronJobs,
  getSystemStatus,
  getUserPenugasanAktif,
  getDashboardKehadiran,
  getDaftarBelumAbsen
} = require('../services/presensiService');

module.exports = {
  // Fungsi utama presensi
  presensiMasuk,
  presensiPulang,
  getPresensiHariIni,
  getPresensiUser,
  getPresensiUserPerBulan,
  getAllPresensi,
  getAllPresensiPerBulan,
  getRekapPresensi,
  
  // Fungsi generate yang sudah ada
  generatePresensiForDate,
  generatePresensiHariIniOnStartup,
  updatePresensiStatusAkhirHari,
  checkAndUpdateIzinPresensi,
  
  // Fungsi generate untuk admin
  generatePresensiManual,
  generatePresensiHariIni,
  generatePresensiRange,
  updateTanpaKeteranganEarly,
  generatePresensiForDateRange,
  
  // Fungsi legacy (untuk compatibility)
  generatePresensiOtomatis,
  fixPresensiData,
  getGenerateStats,
  
  // Helper functions
  checkHariKerja,
  checkUserIzin,
  
  // Setup cron
  setupPresensiCronJobs,
  
  // System functions
  getSystemStatus,
  
  // Tambahan
  getUserPenugasanAktif,
  getDashboardKehadiran,
  getDaftarBelumAbsen
};