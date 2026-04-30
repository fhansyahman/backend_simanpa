// utils/presensiHelper.js
const { DateTime } = require('luxon');
const { pool } = require('../config/database');
const path = require('path');
const fs = require('fs');

const PresensiHelper = {
  // ============ KONFIGURASI ============
  SYSTEM_CONFIG: {
    AUTO_GENERATE_HOUR: 0,
    AUTO_UPDATE_HOUR: 23,
    MORNING_CHECK_HOUR: 8,
    TANPA_KETERANGAN_UPDATE_HOUR: 20,
    TIMEZONE: 'Asia/Jakarta'
  },

  // ============ FUNGSI HELPER ============
  async checkHariKerja(tanggal) {
    try {
      const [hariKerja] = await pool.execute(
        'SELECT * FROM hari_kerja WHERE tanggal = ?',
        [tanggal]
      );

      if (hariKerja.length > 0) {
        return {
          is_hari_kerja: hariKerja[0].is_hari_kerja === 1,
          keterangan: hariKerja[0].keterangan,
          source: 'hari_kerja'
        };
      }

      const [hariLibur] = await pool.execute(
        'SELECT * FROM hari_libur WHERE tanggal = ?',
        [tanggal]
      );

      if (hariLibur.length > 0) {
        return {
          is_hari_kerja: false,
          keterangan: `Libur: ${hariLibur[0].nama_libur}`,
          source: 'hari_libur'
        };
      }

      const dayOfWeek = new Date(tanggal).getDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      return {
        is_hari_kerja: isWeekday,
        keterangan: isWeekday ? 'Hari kerja normal' : 'Weekend',
        source: 'default'
      };
    } catch (error) {
      console.error('Error in checkHariKerja:', error);
      return {
        is_hari_kerja: false,
        keterangan: 'Error menentukan hari kerja',
        source: 'error'
      };
    }
  },

  async checkUserIzin(userId, tanggal) {
    try {
      const [izin] = await pool.execute(
        `SELECT i.id, i.jenis, i.status 
         FROM izin i 
         WHERE i.user_id = ? 
           AND i.status = 'Disetujui'
           AND DATE(?) BETWEEN DATE(i.tanggal_mulai) AND DATE(i.tanggal_selesai)`,
        [userId, tanggal]
      );
      return izin.length > 0 ? izin[0] : null;
    } catch (error) {
      console.error('Error in checkUserIzin:', error);
      return null;
    }
  },

  async getUserPenugasan(userId, tanggal) {
    try {
      // Cek penugasan khusus terlebih dahulu
      const [penugasanKhusus] = await pool.execute(
        `SELECT p.*, pk.nama_penugasan, pk.tipe_penugasan, pk.jam_masuk, pk.jam_pulang,
                pk.toleransi_keterlambatan, pk.batas_terlambat, pk.latitude, pk.longitude, 
                pk.radius, pk.alamat
         FROM penugasan_karyawan pk
         JOIN penugasan p ON pk.penugasan_id = p.id
         WHERE pk.user_id = ? 
           AND pk.status = 'aktif'
           AND DATE(?) BETWEEN DATE(pk.tanggal_mulai) AND DATE(pk.tanggal_selesai)
         LIMIT 1`,
        [userId, tanggal]
      );

      if (penugasanKhusus.length > 0) {
        return {
          id: penugasanKhusus[0].id,
          nama_penugasan: penugasanKhusus[0].nama_penugasan,
          tipe_penugasan: penugasanKhusus[0].tipe_penugasan,
          jam_masuk: penugasanKhusus[0].jam_masuk,
          jam_pulang: penugasanKhusus[0].jam_pulang,
          toleransi_keterlambatan: penugasanKhusus[0].toleransi_keterlambatan,
          batas_terlambat: penugasanKhusus[0].batas_terlambat,
          latitude: penugasanKhusus[0].latitude,
          longitude: penugasanKhusus[0].longitude,
          radius: penugasanKhusus[0].radius,
          alamat: penugasanKhusus[0].alamat,
          is_penugasan_khusus: true
        };
      }

      // Ambil penugasan default user
      const [userPenugasan] = await pool.execute(
        `SELECT u.wilayah_penugasan, p.* 
         FROM users u
         LEFT JOIN penugasan p ON u.wilayah_penugasan = p.nama_penugasan
         WHERE u.id = ? AND p.is_default = 1`,
        [userId]
      );

      if (userPenugasan.length > 0 && userPenugasan[0].id) {
        return {
          id: userPenugasan[0].id,
          nama_penugasan: userPenugasan[0].nama_penugasan,
          tipe_penugasan: userPenugasan[0].tipe_penugasan,
          jam_masuk: userPenugasan[0].jam_masuk,
          jam_pulang: userPenugasan[0].jam_pulang,
          toleransi_keterlambatan: userPenugasan[0].toleransi_keterlambatan,
          batas_terlambat: userPenugasan[0].batas_terlambat,
          latitude: userPenugasan[0].latitude,
          longitude: userPenugasan[0].longitude,
          radius: userPenugasan[0].radius,
          alamat: userPenugasan[0].alamat,
          is_penugasan_khusus: false
        };
      }

      return null;
    } catch (error) {
      console.error('Error in getUserPenugasan:', error);
      return null;
    }
  },

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000;
  },

  saveBase64Image(base64String, prefix, userId, tanggal) {
    const fotoFileName = `${prefix}_${userId}_${tanggal}_${Date.now()}.jpg`;
    const uploadDir = path.join(__dirname, '../uploads/presensi');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join(uploadDir, fotoFileName);
    
    fs.writeFileSync(filePath, buffer);
    return fotoFileName;
  },

  getStatusAkhir(presensiItem) {
    if (presensiItem.keterangan && (
        presensiItem.keterangan.includes('PEMUTIHAN') || 
        presensiItem.keterangan.includes('pemutihan') ||
        presensiItem.keterangan.includes('Jangan lupa presensi'))) {
      return 'Hadir (Pemutihan)';
    }
    
    if (presensiItem.izin_id) {
      return presensiItem.jenis_izin === 'sakit' ? 'Sakit' : 'Izin';
    } else if (presensiItem.status_masuk === 'Tanpa Keterangan' || presensiItem.status_pulang === 'Tanpa Keterangan') {
      return 'Tanpa Keterangan';
    } else if (presensiItem.status_masuk === 'Tepat Waktu' && presensiItem.jam_pulang) {
      return 'Hadir';
    } else if (presensiItem.status_masuk && presensiItem.status_masuk.includes('Terlambat')) {
      return 'Terlambat';
    } else if (presensiItem.jam_masuk && !presensiItem.jam_pulang) {
      return 'Belum Pulang';
    } else if (!presensiItem.jam_masuk && !presensiItem.jam_pulang) {
      return 'Tanpa Keterangan';
    }
    return 'Tidak Diketahui';
  },

  getAvailableMonths() {
    return [
      { value: "01", label: "Januari" },
      { value: "02", label: "Februari" },
      { value: "03", label: "Maret" },
      { value: "04", label: "April" },
      { value: "05", label: "Mei" },
      { value: "06", label: "Juni" },
      { value: "07", label: "Juli" },
      { value: "08", label: "Agustus" },
      { value: "09", label: "September" },
      { value: "10", label: "Oktober" },
      { value: "11", label: "November" },
      { value: "12", label: "Desember" }
    ];
  },

  formatTanggalIndonesia(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  },

  getDayName(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', { weekday: 'long' });
  },

  async getTotalHariKerja(startDate, endDate) {
    let totalHariKerja = 0;
    const startDateObj = DateTime.fromISO(startDate);
    const endDateObj = DateTime.fromISO(endDate);
    let currentDate = startDateObj;
    
    while (currentDate <= endDateObj) {
      const hariKerjaInfo = await this.checkHariKerja(currentDate.toISODate());
      if (hariKerjaInfo.is_hari_kerja) totalHariKerja++;
      currentDate = currentDate.plus({ days: 1 });
    }
    return totalHariKerja;
  },

  calculateStatsFromPresensi(presensiList, totalHariKerja = null) {
    const stats = {
      total: presensiList.length,
      hadir: 0,
      hadir_pemutihan: 0,
      tepat_waktu: 0,
      terlambat: 0,
      terlambat_berat: 0,
      izin: 0,
      sakit: 0,
      tanpa_keterangan: 0,
      lembur: 0,
      belum_pulang: 0,
      presentase_kehadiran: 0
    };

    presensiList.forEach(item => {
      const statusAkhir = this.getStatusAkhir(item);
      
      switch (statusAkhir) {
        case 'Hadir':
          stats.hadir++;
          if (item.status_masuk === 'Tepat Waktu') stats.tepat_waktu++;
          if (item.is_lembur) stats.lembur++;
          break;
        case 'Hadir (Pemutihan)':
          stats.hadir++;
          stats.hadir_pemutihan++;
          if (item.status_masuk === 'Tepat Waktu') stats.tepat_waktu++;
          break;
        case 'Terlambat':
          stats.hadir++;
          stats.terlambat++;
          if (item.status_masuk === 'Terlambat Berat') stats.terlambat_berat++;
          if (item.is_lembur) stats.lembur++;
          break;
        case 'Izin':
          stats.izin++;
          break;
        case 'Sakit':
          stats.sakit++;
          break;
        case 'Tanpa Keterangan':
          stats.tanpa_keterangan++;
          break;
        case 'Belum Pulang':
          stats.belum_pulang++;
          stats.hadir++;
          break;
      }
    });

    if (totalHariKerja && totalHariKerja > 0) {
      stats.presentase_kehadiran = Math.round((stats.hadir / totalHariKerja) * 100);
    } else if (stats.total > 0) {
      stats.presentase_kehadiran = Math.round((stats.hadir / stats.total) * 100);
    }

    return stats;
  }
};

module.exports = PresensiHelper;