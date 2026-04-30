const { DateTime } = require('luxon');
const RekapModel = require('../models/rekapModel');

const RekapService = {
  getRekapKehadiran: async (bulan, tahun, userId, wilayah) => {
    const currentDate = DateTime.now().setZone('Asia/Jakarta');
    const targetBulan = bulan || currentDate.month;
    const targetTahun = tahun || currentDate.getFullYear();

    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();

    console.log('Rekap period:', startDate, 'to', endDate);

    const rekap = await RekapModel.getRekapKehadiran(startDate, endDate, userId, wilayah);

    // Hitung statistik tambahan
    const rekapDenganStatistik = rekap.map(item => {
      const totalHadir = item.hadir;
      const totalIzin = item.izin_cuti + item.izin_sakit + item.izin_lainnya + item.dinas_luar;
      const totalKehadiran = totalHadir + totalIzin;
      
      const persentaseHadir = item.total_hari_kerja > 0 
        ? ((totalKehadiran / item.total_hari_kerja) * 100).toFixed(2)
        : 0;

      const persentaseTepatWaktu = totalHadir > 0 
        ? ((item.tepat_waktu / totalHadir) * 100).toFixed(2)
        : 0;

      return {
        ...item,
        total_hadir: totalHadir,
        total_izin: totalIzin,
        total_kehadiran: totalKehadiran,
        persentase_kehadiran: parseFloat(persentaseHadir),
        persentase_tepat_waktu: parseFloat(persentaseTepatWaktu),
        alpha: item.tanpa_keterangan
      };
    });

    // Hitung total statistik
    const totalStatistik = {
      total_pegawai: rekapDenganStatistik.length,
      total_hari_kerja: rekapDenganStatistik[0]?.total_hari_kerja || 0,
      total_hadir: rekapDenganStatistik.reduce((sum, item) => sum + item.hadir, 0),
      total_terlambat: rekapDenganStatistik.reduce((sum, item) => sum + item.terlambat, 0),
      total_izin: rekapDenganStatistik.reduce((sum, item) => sum + item.total_izin, 0),
      total_alpha: rekapDenganStatistik.reduce((sum, item) => sum + item.tanpa_keterangan, 0),
      total_lembur: rekapDenganStatistik.reduce((sum, item) => sum + item.lembur, 0)
    };

    return {
      periode: {
        bulan: parseInt(targetBulan),
        tahun: parseInt(targetTahun),
        nama_bulan: DateTime.fromObject({ month: targetBulan }).setLocale('id').toFormat('MMMM'),
        start_date: startDate,
        end_date: endDate
      },
      statistik: totalStatistik,
      rekap: rekapDenganStatistik
    };
  },

  getDetailKehadiranUser: async (user_id, bulan, tahun, currentUser) => {
    // Jika bukan admin, hanya bisa akses data sendiri
    let targetUserId = user_id;
    if (currentUser.roles !== 'admin' && currentUser.roles !== 'atasan') {
      targetUserId = currentUser.id;
    }

    if (!targetUserId) {
      throw new Error('User ID wajib diisi');
    }

    const targetBulan = bulan || DateTime.now().setZone('Asia/Jakarta').month;
    const targetTahun = tahun || DateTime.now().setZone('Asia/Jakarta').year;

    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();

    // Get detail presensi user
    const detailPresensi = await RekapModel.getDetailPresensiUser(targetUserId, startDate, endDate);

    // Get info user
    const user = await RekapModel.getUserById(targetUserId);
    if (!user) {
      throw new Error('User tidak ditemukan');
    }

    // Generate calendar days untuk bulan tersebut
    const daysInMonth = RekapModel.getDaysInMonth(targetTahun, targetBulan);
    const calendarDays = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const dateTime = DateTime.fromISO(date);
      const dayOfWeek = dateTime.weekday;
      
      const presensiHariIni = detailPresensi.find(p => 
        DateTime.fromJSDate(p.tanggal).toISODate() === date
      );
      
      const hariInfo = await RekapModel.getHariInfo(date);

      let status = 'Belum Ada Data';
      let keterangan = '';
      let isHariKerja = true;
      
      if (hariInfo.nama_libur) {
        status = 'Libur';
        keterangan = hariInfo.nama_libur;
        isHariKerja = false;
      } else if (hariInfo.keterangan) {
        status = hariInfo.is_hari_kerja ? 'Hari Kerja Khusus' : 'Libur Khusus';
        keterangan = hariInfo.keterangan;
        isHariKerja = hariInfo.is_hari_kerja;
      } else if (dayOfWeek === 6 || dayOfWeek === 7) {
        status = 'Weekend';
        isHariKerja = false;
      } else {
        status = 'Hari Kerja';
        isHariKerja = true;
      }

      if (presensiHariIni) {
        status = presensiHariIni.status_kehadiran;
        keterangan = presensiHariIni.keterangan || presensiHariIni.keterangan_izin || keterangan;
      }

      calendarDays.push({
        tanggal: date,
        hari: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dateTime.weekday - 1],
        status: status,
        keterangan: keterangan,
        jam_masuk: presensiHariIni?.jam_masuk || null,
        jam_pulang: presensiHariIni?.jam_pulang || null,
        is_lembur: presensiHariIni?.is_lembur || 0,
        jam_lembur: presensiHariIni?.jam_lembur || null,
        is_hari_kerja: isHariKerja,
        is_weekend: dayOfWeek === 6 || dayOfWeek === 7
      });
    }

    // Hitung rekap user
    const rekapUser = {
      hadir: detailPresensi.filter(p => 
        p.status_masuk === 'Tepat Waktu' || p.status_masuk === 'Terlambat' || p.status_masuk === 'Terlambat Berat'
      ).length,
      tepat_waktu: detailPresensi.filter(p => p.status_masuk === 'Tepat Waktu').length,
      terlambat: detailPresensi.filter(p => 
        p.status_masuk === 'Terlambat' || p.status_masuk === 'Terlambat Berat'
      ).length,
      izin: detailPresensi.filter(p => p.izin_id).length,
      sakit: detailPresensi.filter(p => p.jenis_izin === 'sakit').length,
      cuti: detailPresensi.filter(p => p.jenis_izin === 'cuti').length,
      tanpa_keterangan: detailPresensi.filter(p => 
        p.status_masuk === 'Tanpa Keterangan' || p.status_masuk === null
      ).length,
      lembur: detailPresensi.filter(p => p.is_lembur).length
    };

    return {
      user: user,
      periode: {
        bulan: parseInt(targetBulan),
        tahun: parseInt(targetTahun),
        nama_bulan: DateTime.fromObject({ month: targetBulan }).setLocale('id').toFormat('MMMM'),
        start_date: startDate,
        end_date: endDate
      },
      rekap: rekapUser,
      detail_harian: calendarDays,
      presensi: detailPresensi
    };
  },

  getRekapHarian: async (tanggal) => {
    if (!tanggal) {
      throw new Error('Tanggal wajib diisi (format: YYYY-MM-DD)');
    }

    if (!DateTime.fromISO(tanggal).isValid) {
      throw new Error('Format tanggal tidak valid. Gunakan format: YYYY-MM-DD');
    }

    const rekapHarian = await RekapModel.getRekapHarian(tanggal);

    // Hitung statistik
    const totalPegawai = rekapHarian.length;
    const hadir = rekapHarian.filter(r => r.status_kehadiran === 'Hadir').length;
    const terlambat = rekapHarian.filter(r => 
      r.status_kehadiran === 'Terlambat' || r.status_kehadiran === 'Terlambat Berat'
    ).length;
    const izin = rekapHarian.filter(r => r.status_kehadiran.includes('Izin')).length;
    const tanpaKeterangan = rekapHarian.filter(r => r.status_kehadiran === 'Tanpa Keterangan').length;
    const belumPresensi = rekapHarian.filter(r => 
      !r.jam_masuk && !r.izin_id && r.status_kehadiran === 'Belum Presensi'
    ).length;
    const lembur = rekapHarian.filter(r => r.is_lembur).length;

    const hariInfo = await RekapModel.getInfoHariWithName(tanggal);

    const infoHari = {
      tanggal: tanggal,
      nama_hari: hariInfo.nama_hari,
      is_libur: !!hariInfo.nama_libur,
      is_hari_kerja_khusus: !!hariInfo.keterangan,
      keterangan: hariInfo.nama_libur || hariInfo.keterangan || null
    };

    return {
      info_hari: infoHari,
      statistik: {
        total_pegawai: totalPegawai,
        hadir: hadir,
        terlambat: terlambat,
        izin: izin,
        tanpa_keterangan: tanpaKeterangan,
        belum_presensi: belumPresensi,
        lembur: lembur,
        persentase_kehadiran: totalPegawai > 0 ? 
          (((hadir + terlambat + izin) / totalPegawai) * 100).toFixed(2) : 0
      },
      detail: rekapHarian
    };
  }
};

module.exports = RekapService;