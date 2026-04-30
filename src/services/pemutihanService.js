const { DateTime } = require('luxon');
const PemutihanModel = require('../models/pemutihanModel');

const PemutihanService = {
  getDataForPemutihan: async (bulan, tahun, wilayah, user) => {
    const userRoles = user.roles || [];
    const userId = user.id;

    if (!bulan || !tahun) {
      throw new Error('Bulan dan tahun wajib diisi');
    }

    if (!PemutihanModel.isValidDate(tahun, bulan)) {
      throw new Error('Bulan atau tahun tidak valid');
    }

    const bulanNum = parseInt(bulan);
    const tahunNum = parseInt(tahun);

    const startDate = `${tahunNum}-${bulanNum.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromISO(startDate).endOf('month').toISODate();

    const data = await PemutihanModel.getDataForPemutihan(
      startDate, endDate, wilayah, userId, user.wilayah_penugasan, userRoles, userId
    );

    // Hitung statistik
    const stats = {
      total: data.length,
      alpha_total: data.filter(d => 
        d.jam_masuk === null && 
        d.status_masuk === null && 
        d.jam_pulang === null && 
        d.status_pulang === null
      ).length,
      belum_pulang: data.filter(d => 
        (d.jam_masuk !== null && d.jam_pulang === null) ||
        d.status_pulang === 'Belum Pulang'
      ).length,
      bisa_diputihkan: data.length
    };

    // Format data
    const formattedData = data.map(item => {
      let kategori = '';
      let keterangan_pemutihan = '';
      let status_kehadiran = '';

      if (item.jam_masuk === null && item.status_masuk === null && 
          item.jam_pulang === null && item.status_pulang === null) {
        kategori = 'Alpha Total';
        status_kehadiran = 'Tanpa Data';
        keterangan_pemutihan = 'Tidak ada data presensi sama sekali';
      } else if ((item.jam_masuk !== null && item.jam_pulang === null) ||
                item.status_pulang === 'Belum Pulang') {
        kategori = 'Belum Pulang';
        status_kehadiran = item.status_masuk || 'Telah Masuk';
        keterangan_pemutihan = item.jam_masuk ? 
          `Sudah masuk pada ${item.jam_masuk.substring(0, 5)} tapi belum pulang` : 
          'Belum melakukan presensi pulang';
      }

      const sudah_diputihkan = item.keterangan && item.keterangan.includes('PEMUTIHAN:') && 
                                !item.keterangan.includes('PEMUTIHAN: Dibatalkan');
      const sudah_dibatalkan = item.keterangan && item.keterangan.includes('PEMUTIHAN: Dibatalkan');
      const bisa_diputihkan = !sudah_diputihkan && !sudah_dibatalkan && item.izin_id === null;

      return {
        ...item,
        kategori,
        status_kehadiran,
        keterangan_pemutihan,
        sudah_diputihkan,
        sudah_dibatalkan,
        bisa_diputihkan
      };
    });

    return {
      presensi: formattedData,
      stats,
      periode: {
        bulan: bulanNum,
        tahun: tahunNum,
        nama_bulan: DateTime.fromISO(startDate).setLocale('id').toFormat('MMMM yyyy'),
        start_date: startDate,
        end_date: endDate
      }
    };
  },

  prosesPemutihan: async (presensi_ids, catatan_pemutihan, jenis_pemutihan, user) => {
    const userRoles = user.roles || [];
    const userId = user.id;

    if (!presensi_ids || !Array.isArray(presensi_ids) || presensi_ids.length === 0) {
      throw new Error('Data presensi wajib dipilih');
    }

    if (!catatan_pemutihan || catatan_pemutihan.trim() === '') {
      throw new Error('Catatan pemutihan wajib diisi');
    }

    if (!userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      throw new Error('Hanya admin dan supervisor yang bisa melakukan pemutihan');
    }

    const existingPresensi = await PemutihanModel.getPresensiByIds(presensi_ids);

    if (existingPresensi.length === 0) {
      throw new Error('Data presensi tidak ditemukan');
    }

    // Cek data sudah diputihkan
    const sudahDiputihkan = existingPresensi.filter(p => 
      p.keterangan && p.keterangan.includes('PEMUTIHAN:') && 
      !p.keterangan.includes('PEMUTIHAN: Dibatalkan')
    );

    if (sudahDiputihkan.length > 0) {
      throw new Error('Beberapa data sudah pernah diputihkan');
    }

    // Cek hak akses supervisor
    if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      const wilayahSupervisor = user.wilayah_penugasan || '';
      const diluarWilayah = existingPresensi.filter(p => 
        p.wilayah_penugasan !== wilayahSupervisor
      );

      if (diluarWilayah.length > 0) {
        throw new Error('Supervisor hanya bisa memutihkan presensi di wilayahnya sendiri');
      }
    }

    // Filter data valid
    const validForPemutihan = existingPresensi.filter(p => {
      if (p.izin_id) return false;
      
      const isAlphaTotal = p.jam_masuk === null && 
                          p.status_masuk === null && 
                          p.jam_pulang === null && 
                          p.status_pulang === null;
      
      const isBelumPulang = (p.jam_masuk !== null && p.jam_pulang === null) ||
                           p.status_pulang === 'Belum Pulang';
      
      return isAlphaTotal || isBelumPulang;
    });

    if (validForPemutihan.length === 0) {
      throw new Error('Tidak ada data yang valid untuk diputihkan');
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const catatanFull = `PEMUTIHAN: ${catatan_pemutihan} (${jenis_pemutihan || 'manual'}) - ${timestamp} oleh ${user.nama || 'Admin'}`;

    let totalUpdated = 0;
    const updateDetails = [];

    for (const presensi of validForPemutihan) {
      const isAlphaTotal = presensi.jam_masuk === null && 
                          presensi.status_masuk === null && 
                          presensi.jam_pulang === null && 
                          presensi.status_pulang === null;
      
      const isBelumPulang = (presensi.jam_masuk !== null && presensi.jam_pulang === null) ||
                           presensi.status_pulang === 'Belum Pulang';

      if (isAlphaTotal) {
        await PemutihanModel.updateAlphaTotal(presensi.id, catatanFull);
        
        updateDetails.push({
          id: presensi.id,
          nama: presensi.nama,
          tipe: 'Alpha Total',
          status_sebelum: 'Data Kosong',
          status_setelah: 'Tepat Waktu',
          jam_masuk_sebelum: null,
          jam_masuk_setelah: '08:00',
          jam_pulang_sebelum: null,
          jam_pulang_setelah: '16:00'
        });
        totalUpdated++;
        
      } else if (isBelumPulang) {
        const jamPulangDefault = '16:00:00';
        await PemutihanModel.updateBelumPulang(presensi.id, jamPulangDefault, catatanFull);
        
        updateDetails.push({
          id: presensi.id,
          nama: presensi.nama,
          tipe: 'Belum Pulang',
          status_sebelum: presensi.status_pulang || 'Belum Pulang',
          status_setelah: 'Tepat Waktu',
          jam_masuk_sebelum: presensi.jam_masuk,
          jam_masuk_setelah: presensi.jam_masuk,
          jam_pulang_sebelum: presensi.jam_pulang,
          jam_pulang_setelah: jamPulangDefault.substring(0, 5)
        });
        totalUpdated++;
      }
    }

    await PemutihanModel.createLog(
      'PEMUTIHAN_PRESENSI',
      `Melakukan pemutihan ${totalUpdated} data presensi: ${catatan_pemutihan}`,
      userId,
      totalUpdated
    );

    return {
      affected_rows: totalUpdated,
      total_dipilih: presensi_ids.length,
      valid_diputihkan: validForPemutihan.length,
      catatan_pemutihan: catatanFull,
      tanggal_pemutihan: timestamp,
      details: updateDetails
    };
  },

  batalkanPemutihan: async (presensi_ids, alasan_pembatalan, user) => {
    const userRoles = user.roles || [];
    const userId = user.id;

    if (!presensi_ids || !Array.isArray(presensi_ids) || presensi_ids.length === 0) {
      throw new Error('Data presensi wajib dipilih');
    }

    if (!alasan_pembatalan || alasan_pembatalan.trim() === '') {
      throw new Error('Alasan pembatalan wajib diisi');
    }

    if (!userRoles.includes('admin')) {
      throw new Error('Hanya admin yang bisa membatalkan pemutihan');
    }

    const existingPresensi = await PemutihanModel.getPresensiByIds(presensi_ids);

    const sudahDiputihkan = existingPresensi.filter(p => 
      p.keterangan && p.keterangan.includes('PEMUTIHAN:') && 
      !p.keterangan.includes('PEMUTIHAN: Dibatalkan')
    );

    if (sudahDiputihkan.length === 0) {
      throw new Error('Tidak ada data pemutihan yang ditemukan atau data belum diputihkan');
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const alasanFull = `PEMUTIHAN: Dibatalkan - ${alasan_pembatalan} (${timestamp}) oleh ${user.nama || 'Admin'}`;

    let totalUpdated = 0;
    const results = [];

    for (const presensi of sudahDiputihkan) {
      let statusMasukSebelum = null;
      let statusPulangSebelum = null;
      let jamMasukSebelum = null;
      let jamPulangSebelum = null;

      if (presensi.keterangan) {
        if (presensi.keterangan.includes('Alpha Total') || 
            (presensi.status_masuk === 'Tepat Waktu' && presensi.jam_masuk === '08:00:00')) {
          statusMasukSebelum = null;
          statusPulangSebelum = null;
          jamMasukSebelum = null;
          jamPulangSebelum = null;
        } else {
          statusMasukSebelum = presensi.status_masuk;
          statusPulangSebelum = null;
          jamMasukSebelum = presensi.jam_masuk;
          jamPulangSebelum = null;
        }
      }

      const result = await PemutihanModel.cancelPemutihan(
        presensi.id, statusMasukSebelum, statusPulangSebelum,
        jamMasukSebelum, jamPulangSebelum, alasanFull
      );

      if (result.affectedRows > 0) {
        totalUpdated++;
        results.push({
          id: presensi.id,
          nama: presensi.nama,
          status_masuk_sebelum: presensi.status_masuk,
          status_masuk_setelah: statusMasukSebelum,
          status_pulang_sebelum: presensi.status_pulang,
          status_pulang_setelah: statusPulangSebelum
        });
      }
    }

    await PemutihanModel.createLog(
      'BATAL_PEMUTIHAN',
      `Membatalkan pemutihan ${totalUpdated} data presensi: ${alasan_pembatalan}`,
      userId,
      totalUpdated
    );

    return {
      affected_rows: totalUpdated,
      alasan_pembatalan: alasanFull,
      tanggal_pembatalan: timestamp,
      details: results
    };
  },

  getRiwayatPemutihan: async (start_date, end_date, wilayah, jenis, user) => {
    const userRoles = user.roles || [];
    const userId = user.id;

    let startDate = start_date;
    let endDate = end_date;

    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    const riwayat = await PemutihanModel.getRiwayatPemutihan(
      startDate, endDate, wilayah, jenis || 'all',
      userRoles, user.wilayah_penugasan, userId
    );

    // Format data riwayat
    const formattedRiwayat = riwayat.map(item => {
      let jenis_pemutihan = 'unknown';
      let catatan = '';
      let tipe_pemutihan = 'unknown';
      let status = item.status_pemutihan;

      if (item.keterangan) {
        const pemutihanMatch = item.keterangan.match(/PEMUTIHAN: ([^|(]+)/);
        if (pemutihanMatch) {
          catatan = pemutihanMatch[1].trim();
        }

        if (item.keterangan.includes('manual')) {
          jenis_pemutihan = 'manual';
        } else if (item.keterangan.includes('otomatis')) {
          jenis_pemutihan = 'otomatis';
        }

        if (item.keterangan.includes('Dibatalkan')) {
          status = 'dibatalkan';
        } else if (item.keterangan.includes('PEMUTIHAN:')) {
          status = 'diputihkan';
        }

        if (item.keterangan.includes('Alpha Total') || 
            (item.jam_masuk === '08:00:00' && item.jam_pulang === '16:00:00' && item.jenis_izin === null)) {
          tipe_pemutihan = 'Alpha Total';
        } else if (item.keterangan.includes('Belum Pulang') || 
                  (item.jam_masuk !== null && item.jam_pulang === '16:00:00' && item.jenis_izin === null)) {
          tipe_pemutihan = 'Belum Pulang';
        }
      }

      return {
        ...item,
        jenis_pemutihan,
        tipe_pemutihan,
        catatan_pemutihan: catatan,
        status_pemutihan: status,
        keterangan_asli: item.keterangan
      };
    });

    const stats = {
      total: formattedRiwayat.length,
      diputihkan: formattedRiwayat.filter(r => r.status_pemutihan === 'diputihkan').length,
      dibatalkan: formattedRiwayat.filter(r => r.status_pemutihan === 'dibatalkan').length,
      alpha_total: formattedRiwayat.filter(r => r.tipe_pemutihan === 'Alpha Total').length,
      belum_pulang: formattedRiwayat.filter(r => r.tipe_pemutihan === 'Belum Pulang').length
    };

    return {
      riwayat: formattedRiwayat,
      stats,
      periode: {
        start_date: startDate,
        end_date: endDate
      }
    };
  }
};

module.exports = PemutihanService;