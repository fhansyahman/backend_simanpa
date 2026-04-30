const DashboardModel = require('../models/dashboardModel');

const getMonthName = (bulan) => {
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return monthNames[bulan - 1];
};

const hitungHariKerjaPerBulan = (bulan, tahun) => {
  let count = 0;
  const date = new Date(tahun, bulan - 1, 1);
  const lastDay = new Date(tahun, bulan, 0).getDate();

  for (let day = 1; day <= lastDay; day++) {
    const currentDate = new Date(tahun, bulan - 1, day);
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      count++;
    }
  }
  return count;
};

const DashboardService = {
  // =========================
  // DASHBOARD HARI INI
  // =========================
  getDashboardHariIni: async () => {
    const { pegawai: totalPegawai, statistik, today } = await DashboardModel.getDashboardHariIni();
    
    const totalHadir = statistik.total_hadir || 0;
    const tidakHadir = Math.max(0, totalPegawai - totalHadir);

    const persentaseHadir = totalPegawai > 0 ? ((totalHadir / totalPegawai) * 100) : 0;
    const persentaseTidakHadir = totalPegawai > 0 ? ((tidakHadir / totalPegawai) * 100) : 0;
    const persentaseTepatWaktu = totalPegawai > 0 ? ((statistik.hadir_tepat_waktu / totalPegawai) * 100) : 0;
    const persentaseTerlambat = totalPegawai > 0 ? ((statistik.terlambat / totalPegawai) * 100) : 0;
    const persentaseIzin = totalPegawai > 0 ? ((statistik.izin / totalPegawai) * 100) : 0;
    const persentaseSakit = totalPegawai > 0 ? ((statistik.sakit / totalPegawai) * 100) : 0;
    const persentaseCuti = totalPegawai > 0 ? ((statistik.cuti / totalPegawai) * 100) : 0;

    return {
      tanggal: today,
      total_pegawai: totalPegawai,
      hadir: totalHadir,
      tidak_hadir: tidakHadir,
      hadir_tepat_waktu: statistik.hadir_tepat_waktu || 0,
      terlambat: statistik.terlambat || 0,
      izin: statistik.izin || 0,
      sakit: statistik.sakit || 0,
      cuti: statistik.cuti || 0,
      persentase_hadir: Number(persentaseHadir.toFixed(2)),
      persentase_tidak_hadir: Number(persentaseTidakHadir.toFixed(2)),
      persentase_hadir_tepat_waktu: Number(persentaseTepatWaktu.toFixed(2)),
      persentase_terlambat: Number(persentaseTerlambat.toFixed(2)),
      persentase_izin: Number(persentaseIzin.toFixed(2)),
      persentase_sakit: Number(persentaseSakit.toFixed(2)),
      persentase_cuti: Number(persentaseCuti.toFixed(2))
    };
  },

  // =========================
  // GRAFIK KEHADIRAN BULANAN
  // =========================
  getGrafikHadirBulanan: async (tahun, bulan, wilayah) => {
    const targetTahun = tahun || new Date().getFullYear();
    const targetBulan = bulan || new Date().getMonth() + 1;
    const targetWilayah = wilayah || 'all';

    const { data, totalData: totalPegawai } = await DashboardModel.getGrafikHadirBulanan(targetTahun, targetBulan, targetWilayah);

    const totalHadir = data?.total_hadir || 0;
    const tidakHadir = Math.max(0, totalPegawai - totalHadir);
    
    const persentaseHadir = totalPegawai > 0 ? ((totalHadir / totalPegawai) * 100) : 0;
    const persentaseTidakHadir = totalPegawai > 0 ? ((tidakHadir / totalPegawai) * 100) : 0;

    const grafik = Array.from({ length: 12 }, (_, i) => {
      const bulanGrafik = i + 1;
      if (bulanGrafik === targetBulan && data) {
        return {
          bulan: bulanGrafik,
          total_hadir: totalHadir,
          total_pegawai: totalPegawai,
          hadir_tepat_waktu: data.hadir_tepat_waktu || 0,
          terlambat: data.terlambat || 0,
          izin: data.izin || 0,
          sakit: data.sakit || 0,
          cuti: data.cuti || 0,
          tidak_hadir: tidakHadir,
          persentase_hadir: Number(persentaseHadir.toFixed(2)),
          persentase_tidak_hadir: Number(persentaseTidakHadir.toFixed(2))
        };
      }
      return {
        bulan: bulanGrafik,
        total_hadir: 0,
        total_pegawai: totalPegawai,
        hadir_tepat_waktu: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        cuti: 0,
        tidak_hadir: totalPegawai,
        persentase_hadir: 0,
        persentase_tidak_hadir: 100
      };
    });

    const dataBulanan = grafik.map(item => ({
      bulan: getMonthName(item.bulan),
      hadir: item.total_hadir,
      tidak_hadir: item.tidak_hadir,
      persentase_hadir: item.persentase_hadir
    }));

    return {
      tahun: targetTahun,
      bulan: targetBulan,
      wilayah: targetWilayah !== 'all' ? targetWilayah : 'Semua Wilayah',
      total_pegawai: totalPegawai,
      total_hadir: totalHadir,
      tidak_hadir: tidakHadir,
      persentase_hadir: Number(persentaseHadir.toFixed(2)),
      persentase_tidak_hadir: Number(persentaseTidakHadir.toFixed(2)),
      grafik: grafik,
      data_bulanan: dataBulanan
    };
  },

  // =========================
  // PEGAWAI BELUM ABSEN
  // =========================
  getPegawaiBelumAbsen: async () => {
    const today = new Date().toISOString().split('T')[0];
    return await DashboardModel.getPegawaiBelumAbsen(today);
  },

  // =========================
  // DAFTAR WILAYAH
  // =========================
  getDaftarWilayah: async () => {
    const wilayah = await DashboardModel.getDaftarWilayah();
    return wilayah.map(w => w.wilayah_penugasan);
  },

  // =========================
  // GRAFIK KINERJA BULANAN
  // =========================
  getGrafikKinerjaBulanan: async (tahun, bulan) => {
    const targetTahun = tahun || new Date().getFullYear();
    const targetBulan = bulan || new Date().getMonth() + 1;

    const { kinerjaPerBulan, totalPegawai } = await DashboardModel.getGrafikKinerjaBulanan(targetTahun);

    const grafik = Array.from({ length: 12 }, (_, i) => {
      const bulanGrafik = i + 1;
      const hariKerja = hitungHariKerjaPerBulan(bulanGrafik, targetTahun);
      const target = totalPegawai * hariKerja * 50;
      
      const found = kinerjaPerBulan.find(k => k.bulan === bulanGrafik);
      const realisasi = found ? Number(found.realisasi) : 0;
      const jumlahPegawai = found ? found.jumlah_pegawai : 0;
      const persentase = target > 0 ? (realisasi / target) * 100 : 0;
      const rataRata = jumlahPegawai > 0 ? realisasi / jumlahPegawai : 0;

      return {
        bulan: bulanGrafik,
        nama_bulan: getMonthName(bulanGrafik),
        target: Number(target.toFixed(2)),
        realisasi: Number(realisasi.toFixed(2)),
        persentase_capaian: Number(persentase.toFixed(2)),
        rata_rata_per_pegawai: Number(rataRata.toFixed(2)),
        jumlah_pegawai_lapor: jumlahPegawai,
        hari_kerja: hariKerja
      };
    });

    const bulanIniData = grafik.find(g => g.bulan === targetBulan);

    return {
      tahun: targetTahun,
      bulan: targetBulan,
      target_per_pegawai_per_hari: 50,
      total_pegawai: totalPegawai,
      hari_kerja_bulan_ini: bulanIniData?.hari_kerja || 0,
      target_total: bulanIniData?.target || 0,
      realisasi_total: bulanIniData?.realisasi || 0,
      persentase_realisasi: bulanIniData?.persentase_capaian || 0,
      rata_rata_per_pegawai: bulanIniData?.rata_rata_per_pegawai || 0,
      jumlah_pegawai_lapor: bulanIniData?.jumlah_pegawai_lapor || 0,
      grafik: grafik
    };
  },

  // =========================
  // DASHBOARD KINERJA HARI INI
  // =========================
  getDashboardKinerjaHariIni: async () => {
    const today = new Date().toISOString().split('T')[0];
    const { hariLibur, hariKerjaCustom, dayOfWeek, pegawai: totalPegawai, sudahLapor, belumLapor, topPerformers } = 
      await DashboardModel.getDashboardKinerjaHariIni(today);

    let isHariKerja = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (hariKerjaCustom.length > 0) {
      isHariKerja = hariKerjaCustom[0].is_hari_kerja === 1;
    }

    if (hariLibur.length > 0) {
      isHariKerja = false;
    }

    if (!isHariKerja) {
      return {
        tanggal: today,
        is_hari_kerja: false,
        keterangan: hariLibur.length > 0 ? `Libur: ${hariLibur[0].nama_libur}` : 'Bukan hari kerja',
        total_pegawai: 0,
        sudah_lapor: 0,
        belum_lapor: 0,
        daftar_belum_lapor: [],
        top_performers: []
      };
    }

    return {
      tanggal: today,
      is_hari_kerja: true,
      total_pegawai: totalPegawai,
      sudah_lapor: sudahLapor,
      belum_lapor: totalPegawai - sudahLapor,
      daftar_belum_lapor: belumLapor,
      top_performers: topPerformers
    };
  },

  // =========================
  // DASHBOARD KEHADIRAN BY DATE (TAMBAHAN)
  // =========================
  getDashboardKehadiranByDate: async (tanggal) => {
    const targetTanggal = tanggal || new Date().toISOString().split('T')[0];
    
    const { pegawai: totalPegawai, hadirStat, izinStat } = await DashboardModel.getDashboardKehadiranByDate(targetTanggal);

    const totalHadir = hadirStat.hadir || 0;
    const tidakHadir = Math.max(0, totalPegawai - totalHadir);
    
    const persentaseHadir = totalPegawai > 0 ? ((totalHadir / totalPegawai) * 100) : 0;
    const persentaseTidakHadir = totalPegawai > 0 ? ((tidakHadir / totalPegawai) * 100) : 0;
    const persentaseTepatWaktu = totalPegawai > 0 ? ((hadirStat.tepat_waktu / totalPegawai) * 100) : 0;
    const persentaseTerlambat = totalPegawai > 0 ? ((hadirStat.terlambat / totalPegawai) * 100) : 0;
    const persentaseIzin = totalPegawai > 0 ? ((izinStat.izin / totalPegawai) * 100) : 0;
    const persentaseSakit = totalPegawai > 0 ? ((izinStat.sakit / totalPegawai) * 100) : 0;
    const persentaseCuti = totalPegawai > 0 ? ((izinStat.cuti / totalPegawai) * 100) : 0;

    return {
      tanggal: targetTanggal,
      total_pegawai: totalPegawai,
      hadir: totalHadir,
      tidak_hadir: tidakHadir,
      hadir_tepat_waktu: hadirStat.tepat_waktu || 0,
      terlambat: hadirStat.terlambat || 0,
      izin: izinStat.izin || 0,
      sakit: izinStat.sakit || 0,
      cuti: izinStat.cuti || 0,
      persentase_hadir: Number(persentaseHadir.toFixed(2)),
      persentase_tidak_hadir: Number(persentaseTidakHadir.toFixed(2)),
      persentase_hadir_tepat_waktu: Number(persentaseTepatWaktu.toFixed(2)),
      persentase_terlambat: Number(persentaseTerlambat.toFixed(2)),
      persentase_izin: Number(persentaseIzin.toFixed(2)),
      persentase_sakit: Number(persentaseSakit.toFixed(2)),
      persentase_cuti: Number(persentaseCuti.toFixed(2))
    };
  },

  // =========================
  // PEGAWAI BELUM ABSEN DENGAN FILTER TANGGAL (TAMBAHAN)
  // =========================
  getPegawaiBelumAbsenByDate: async (tanggal) => {
    const targetTanggal = tanggal || new Date().toISOString().split('T')[0];
    return await DashboardModel.getPegawaiBelumAbsenExcludeIzin(targetTanggal);
  },

  // =========================
  // PRESENSI HARIAN DENGAN FILTER TANGGAL (TAMBAHAN)
  // =========================
  getPresensiHarianByDate: async (tanggal) => {
    const targetTanggal = tanggal || new Date().toISOString().split('T')[0];
    return await DashboardModel.getPresensiHarianByDate(targetTanggal);
  },

  // =========================
  // DASHBOARD KINERJA DENGAN FILTER TANGGAL (TAMBAHAN)
  // =========================
  getDashboardKinerjaByDate: async (tanggal) => {
    const targetTanggal = tanggal || new Date().toISOString().split('T')[0];
    
    const { hariLibur, hariKerjaCustom, dayOfWeek, pegawai: totalPegawai, sudahLapor, belumLapor, topPerformers } = 
      await DashboardModel.getDashboardKinerjaByDate(targetTanggal);

    let isHariKerja = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (hariKerjaCustom.length > 0) {
      isHariKerja = hariKerjaCustom[0].is_hari_kerja === 1;
    }

    if (hariLibur.length > 0) {
      isHariKerja = false;
    }

    if (!isHariKerja) {
      return {
        tanggal: targetTanggal,
        is_hari_kerja: false,
        keterangan: hariLibur.length > 0 ? `Libur: ${hariLibur[0].nama_libur}` : 'Bukan hari kerja',
        total_pegawai: 0,
        sudah_lapor: 0,
        belum_lapor: 0,
        daftar_belum_lapor: [],
        top_performers: []
      };
    }

    return {
      tanggal: targetTanggal,
      is_hari_kerja: true,
      total_pegawai: totalPegawai,
      sudah_lapor: sudahLapor,
      belum_lapor: totalPegawai - sudahLapor,
      daftar_belum_lapor: belumLapor,
      top_performers: topPerformers
    };
  },

  // =========================
  // PEGAWAI IZIN/SAKIT/CUTI BERDASARKAN TANGGAL (TAMBAHAN)
  // =========================
  getPegawaiIzinByDate: async (tanggal) => {
    const targetTanggal = tanggal || new Date().toISOString().split('T')[0];
    const pegawaiIzin = await DashboardModel.getPegawaiIzinByDate(targetTanggal);
    
    const izin = pegawaiIzin.filter(p => p.jenis_izin === 'Izin');
    const sakit = pegawaiIzin.filter(p => p.jenis_izin === 'Sakit');
    const cuti = pegawaiIzin.filter(p => p.jenis_izin === 'Cuti');

    return { izin, sakit, cuti, semua: pegawaiIzin };
  }
};

module.exports = DashboardService;