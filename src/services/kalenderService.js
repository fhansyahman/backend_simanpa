const { HariKerjaModel, HariLiburModel, KalenderLogModel } = require('../models/kalenderModel');

const KalenderService = {
  // ========== HARI KERJA SERVICES ==========
  getAllHariKerja: async (filters) => {
    return await HariKerjaModel.getAll(filters);
  },

  createHariKerja: async (data, userId) => {
    const { tanggal, is_hari_kerja, keterangan } = data;

    if (!tanggal) {
      throw new Error('Tanggal wajib diisi');
    }

    const exists = await HariKerjaModel.isTanggalExists(tanggal);
    if (exists) {
      throw new Error('Tanggal sudah ada dalam database');
    }

    const insertId = await HariKerjaModel.create(tanggal, is_hari_kerja, keterangan);

    await KalenderLogModel.create(
      'HARI_KERJA_CREATE',
      `Admin mengatur hari kerja: ${tanggal} - ${is_hari_kerja ? 'Hari Kerja' : 'Bukan Hari Kerja'}`,
      userId
    );

    return insertId;
  },

  updateHariKerja: async (id, data, userId) => {
    const { tanggal, is_hari_kerja, keterangan } = data;

    const existing = await HariKerjaModel.getById(id);
    if (!existing) {
      throw new Error('Data hari kerja tidak ditemukan');
    }

    if (tanggal !== existing.tanggal) {
      const duplicate = await HariKerjaModel.isTanggalExists(tanggal, id);
      if (duplicate) {
        throw new Error('Tanggal sudah ada dalam database');
      }
    }

    await HariKerjaModel.update(id, tanggal, is_hari_kerja, keterangan);

    await KalenderLogModel.create(
      'HARI_KERJA_UPDATE',
      `Admin mengupdate hari kerja: ${tanggal} - ${is_hari_kerja ? 'Hari Kerja' : 'Bukan Hari Kerja'}`,
      userId
    );
  },

  deleteHariKerja: async (id, userId) => {
    const existing = await HariKerjaModel.getById(id);
    if (!existing) {
      throw new Error('Data hari kerja tidak ditemukan');
    }

    await HariKerjaModel.delete(id);

    await KalenderLogModel.create(
      'HARI_KERJA_DELETE',
      `Admin menghapus hari kerja: ${existing.tanggal}`,
      userId
    );
  },

  bulkCreateHariKerja: async (data, userId) => {
    const { start_date, end_date, is_hari_kerja, keterangan } = data;

    if (!start_date || !end_date) {
      throw new Error('Start date dan end date wajib diisi');
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    let createdCount = 0;
    let updatedCount = 0;

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const currentDate = new Date(date).toISOString().split('T')[0];
      const result = await HariKerjaModel.upsert(currentDate, is_hari_kerja, keterangan);
      
      if (result.action === 'created') {
        createdCount++;
      } else {
        updatedCount++;
      }
    }

    await KalenderLogModel.create(
      'HARI_KERJA_BULK_CREATE',
      `Admin bulk update hari kerja: ${start_date} hingga ${end_date} - ${is_hari_kerja ? 'Hari Kerja' : 'Bukan Hari Kerja'}`,
      userId
    );

    return { createdCount, updatedCount };
  },

  // ========== HARI LIBUR SERVICES ==========
  getAllHariLibur: async (filters) => {
    return await HariLiburModel.getAll(filters);
  },

  createHariLibur: async (data, userId) => {
    const { tanggal, nama_libur, is_tahunan, tahun } = data;

    if (!tanggal || !nama_libur) {
      throw new Error('Tanggal dan nama libur wajib diisi');
    }

    const exists = await HariLiburModel.isTanggalExists(tanggal);
    if (exists) {
      throw new Error('Tanggal sudah ada dalam database');
    }

    const insertId = await HariLiburModel.create(tanggal, nama_libur, is_tahunan, tahun);

    await KalenderLogModel.create(
      'HARI_LIBUR_CREATE',
      `Admin menambahkan hari libur: ${nama_libur} - ${tanggal}`,
      userId
    );

    return insertId;
  },

  updateHariLibur: async (id, data, userId) => {
    const { tanggal, nama_libur, is_tahunan, tahun } = data;

    const existing = await HariLiburModel.getById(id);
    if (!existing) {
      throw new Error('Data hari libur tidak ditemukan');
    }

    if (tanggal !== existing.tanggal) {
      const duplicate = await HariLiburModel.isTanggalExists(tanggal, id);
      if (duplicate) {
        throw new Error('Tanggal sudah ada dalam database');
      }
    }

    await HariLiburModel.update(id, tanggal, nama_libur, is_tahunan, tahun);

    await KalenderLogModel.create(
      'HARI_LIBUR_UPDATE',
      `Admin mengupdate hari libur: ${nama_libur} - ${tanggal}`,
      userId
    );
  },

  deleteHariLibur: async (id, userId) => {
    const existing = await HariLiburModel.getById(id);
    if (!existing) {
      throw new Error('Data hari libur tidak ditemukan');
    }

    await HariLiburModel.delete(id);

    await KalenderLogModel.create(
      'HARI_LIBUR_DELETE',
      `Admin menghapus hari libur: ${existing.nama_libur} - ${existing.tanggal}`,
      userId
    );
  },

  // ========== KALENDER SERVICES ==========
  getKalender: async (filters) => {
    const targetTahun = filters.tahun || new Date().getFullYear();
    const targetBulan = filters.bulan || new Date().getMonth() + 1;

    const hariKerja = await HariKerjaModel.getByMonth(targetTahun, targetBulan);
    const hariLibur = await HariLiburModel.getByMonth(targetTahun, targetBulan);

    const kalender = [];
    const startDate = new Date(targetTahun, targetBulan - 1, 1);
    const endDate = new Date(targetTahun, targetBulan, 0);

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const currentDate = new Date(date).toISOString().split('T')[0];
      const dayOfWeek = date.getDay();

      let isHariKerjaDefault = dayOfWeek >= 1 && dayOfWeek <= 5;
      let keterangan = isHariKerjaDefault ? 'Hari kerja normal' : 'Weekend';

      const customHariKerja = hariKerja.find(hk => {
        const hkDate = new Date(hk.tanggal).toISOString().split('T')[0];
        return hkDate === currentDate;
      });

      if (customHariKerja) {
        isHariKerjaDefault = customHariKerja.is_hari_kerja === 1;
        keterangan = customHariKerja.keterangan || keterangan;
      }

      const libur = hariLibur.find(hl => {
        const liburDate = new Date(hl.tanggal).toISOString().split('T')[0];
        if (hl.is_tahunan) {
          return liburDate.substring(5) === currentDate.substring(5);
        }
        return liburDate === currentDate;
      });

      kalender.push({
        tanggal: currentDate,
        hari: date.toLocaleDateString('id-ID', { weekday: 'long' }),
        tanggal_format: date.toLocaleDateString('id-ID', { 
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        is_hari_kerja: libur ? false : isHariKerjaDefault,
        is_weekend: dayOfWeek === 0 || dayOfWeek === 6,
        is_libur: !!libur,
        nama_libur: libur ? libur.nama_libur : null,
        keterangan: libur ? `Libur: ${libur.nama_libur}` : keterangan,
        is_custom: !!customHariKerja
      });
    }

    return kalender;
  }
};

module.exports = KalenderService;