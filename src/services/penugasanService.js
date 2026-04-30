const { DateTime } = require('luxon');
const PenugasanModel = require('../models/penugasanModel');
const { extractCoordinatesFromMapsLink, calculateDistance } = require('../utils/mapsHelper');

const PenugasanService = {
  // ============ GET ALL PENUGASAN ============
  getAllPenugasan: async (jenis) => {
    return await PenugasanModel.getAllPenugasan(jenis);
  },

  // ============ GET PENUGASAN DEFAULT ============
  getPenugasanDefault: async () => {
    const penugasan = await PenugasanModel.getPenugasanDefaultAktif();
    if (!penugasan) {
      throw new Error('Tidak ada penugasan default yang aktif');
    }
    return penugasan;
  },

  // ============ GET PENUGASAN BY ID ============
  getPenugasanById: async (id) => {
    const penugasan = await PenugasanModel.getPenugasanDetailWithAssignment(id);
    if (!penugasan) {
      throw new Error('Penugasan tidak ditemukan');
    }
    
    const assignedUsers = await PenugasanModel.getAssignedUsersWithDetail(id);
    
    return {
      ...penugasan,
      assigned_users: assignedUsers,
      selected_users: assignedUsers.map(u => u.id),
      selected_wilayah: [...new Set(assignedUsers.map(u => u.wilayah_penugasan).filter(w => w))]
    };
  },

  // ============ CREATE PENUGASAN ============
  createPenugasan: async (data, userId) => {
    const {
      nama_penugasan,
      tipe_penugasan,
      maps_link,
      alamat,
      tanggal_mulai,
      tanggal_selesai,
      jam_masuk,
      jam_pulang,
      batas_terlambat,
      toleransi_keterlambatan,
      radius = 100,
      tipe_assign = 'semua_pekerja',
      selected_users = [],
      selected_wilayah = [],
      is_active = true
    } = data;

    if (!nama_penugasan || !jam_masuk || !jam_pulang) {
      throw new Error('Nama penugasan, jam masuk, dan jam pulang wajib diisi');
    }

    let coordinates = null;
    let kodePenugasan = null;
    let isPenugasanActive = is_active ? 1 : 0;

    if (tipe_penugasan === 'default') {
      kodePenugasan = 'DEFAULT-SYSTEM';
      await PenugasanModel.nonaktifkanDefaultLainnya();
    } else {
      if (!maps_link) {
        throw new Error('Penugasan khusus wajib menyertakan link Google Maps');
      }
      if (!tanggal_mulai || !tanggal_selesai) {
        throw new Error('Penugasan khusus wajib menyertakan tanggal mulai dan selesai');
      }

      const tglMulai = DateTime.fromISO(tanggal_mulai);
      const tglSelesai = DateTime.fromISO(tanggal_selesai);

      if (tglSelesai < tglMulai) {
        throw new Error('Tanggal selesai tidak boleh lebih kecil dari tanggal mulai');
      }

      coordinates = await extractCoordinatesFromMapsLink(maps_link);
      if (!coordinates) {
        throw new Error('Tidak dapat mengekstrak koordinat dari link Google Maps');
      }

      kodePenugasan = `PEN-${DateTime.now().toFormat('yyyyMMddHHmmss')}`;
    }

    const penugasanId = await PenugasanModel.createPenugasan(
      {
        kodePenugasan, nama_penugasan, tipe_penugasan,
        jam_masuk, jam_pulang, toleransi_keterlambatan, batas_terlambat,
        maps_link, alamat, radius, tanggal_mulai, tanggal_selesai
      },
      coordinates,
      isPenugasanActive,
      userId
    );

    let assignedCount = 0;
    let usersToAssign = [];

    if (tipe_penugasan === 'khusus') {
      if (tipe_assign === 'individu' && selected_users.length > 0) {
        usersToAssign = selected_users;
        await PenugasanModel.nonaktifkanAssignmentLamaUntukUser(selected_users);
      } else if (tipe_assign === 'per_wilayah' && selected_wilayah.length > 0) {
        const users = await PenugasanModel.getUsersByWilayah(selected_wilayah);
        usersToAssign = users.map(u => u.id);
        if (usersToAssign.length > 0) {
          await PenugasanModel.nonaktifkanAssignmentLamaUntukUser(usersToAssign);
        }
      } else if (tipe_assign === 'semua_pekerja') {
        await PenugasanModel.nonaktifkanSemuaAssignmentKhusus();
        const allUsers = await PenugasanModel.getAllPegawaiAktif();
        usersToAssign = allUsers.map(u => u.id);
      }

      for (const userId of usersToAssign) {
        const result = await PenugasanModel.createAssignmentPekerja(penugasanId, userId, tipe_assign);
        if (result) assignedCount++;
      }
    }

    return {
      id: penugasanId,
      kode_penugasan: kodePenugasan,
      tipe_penugasan: tipe_penugasan,
      assigned_count: assignedCount
    };
  },

  // ============ UPDATE PENUGASAN ============
  updatePenugasan: async (id, data) => {
    const {
      nama_penugasan,
      maps_link,
      alamat,
      tanggal_mulai,
      tanggal_selesai,
      jam_masuk,
      jam_pulang,
      batas_terlambat,
      toleransi_keterlambatan,
      radius = 100,
      tipe_assign = 'semua_pekerja',
      selected_users = [],
      selected_wilayah = [],
      is_active = true
    } = data;

    if (!nama_penugasan || !jam_masuk || !jam_pulang) {
      throw new Error('Nama penugasan, jam masuk, dan jam pulang wajib diisi');
    }

    const existing = await PenugasanModel.getPenugasanKhususById(id);
    if (!existing) {
      throw new Error('Penugasan tidak ditemukan');
    }

    let coordinates = null;
    if (maps_link) {
      coordinates = await extractCoordinatesFromMapsLink(maps_link);
      if (!coordinates) {
        throw new Error('Tidak dapat mengekstrak koordinat dari link Google Maps');
      }
    }

    await PenugasanModel.updatePenugasan(id, {
      nama_penugasan, maps_link, alamat, tanggal_mulai, tanggal_selesai,
      jam_masuk, jam_pulang, batas_terlambat, toleransi_keterlambatan,
      radius, is_active
    }, coordinates);

    await PenugasanModel.deleteAssignmentByPenugasanId(id);

    let assignedCount = 0;
    let usersToAssign = [];

    if (tipe_assign === 'semua_pekerja') {
      const allUsers = await PenugasanModel.getAllPegawaiAktif();
      usersToAssign = allUsers.map(u => u.id);
    } else if (tipe_assign === 'per_wilayah' && selected_wilayah.length > 0) {
      const users = await PenugasanModel.getUsersByWilayah(selected_wilayah);
      usersToAssign = users.map(u => u.id);
    } else if (tipe_assign === 'individu' && selected_users.length > 0) {
      usersToAssign = selected_users;
    }

    for (const userId of usersToAssign) {
      const result = await PenugasanModel.createAssignmentPekerja(id, userId, tipe_assign);
      if (result) assignedCount++;
    }

    return { id: parseInt(id), assigned_count: assignedCount };
  },

  // ============ UPDATE PENUGASAN STATUS ============
  updatePenugasanStatus: async (id, status) => {
    const penugasan = await PenugasanModel.getPenugasanKhususById(id);
    if (!penugasan) {
      throw new Error('Penugasan tidak ditemukan');
    }

    await PenugasanModel.updatePenugasanStatus(id, status);
    return { message: `Penugasan berhasil di${status === 'selesai' ? 'selesaikan' : 'batalkan'}` };
  },

  // ============ UPDATE DEFAULT PENUGASAN ============
  updateDefaultPenugasan: async (id, data) => {
    const existing = await PenugasanModel.getPenugasanById(id);
    if (!existing || existing.tipe_penugasan !== 'default') {
      throw new Error('Penugasan default tidak ditemukan');
    }

    const { is_active } = data;
    if (is_active) {
      await PenugasanModel.nonaktifkanDefaultLainnya(id);
    }

    await PenugasanModel.updateDefaultPenugasan(id, data);
    return { message: 'Penugasan default berhasil diupdate' };
  },

  // ============ DELETE PENUGASAN (HARD DELETE) ============
  deletePenugasan: async (id) => {
    const penugasan = await PenugasanModel.getPenugasanById(id);
    if (!penugasan) {
      throw new Error('Penugasan tidak ditemukan');
    }

    if (penugasan.tipe_penugasan === 'default' && penugasan.is_active === 1) {
      throw new Error('Tidak dapat menghapus penugasan default yang sedang aktif. Nonaktifkan terlebih dahulu.');
    }

    if (penugasan.tipe_penugasan === 'khusus' && penugasan.status === 'aktif') {
      throw new Error('Tidak dapat menghapus penugasan khusus yang masih aktif. Selesaikan atau batalkan terlebih dahulu.');
    }

    await PenugasanModel.deleteAssignmentByPenugasanId(id);
    await PenugasanModel.deletePenugasan(id);

    return {
      id: parseInt(id),
      tipe_penugasan: penugasan.tipe_penugasan,
      nama_penugasan: penugasan.nama_penugasan
    };
  },

  // ============ SOFT DELETE PENUGASAN ============
  softDeletePenugasan: async (id) => {
    const penugasan = await PenugasanModel.getPenugasanById(id);
    if (!penugasan) {
      throw new Error('Penugasan tidak ditemukan');
    }

    await PenugasanModel.softDeletePenugasan(id, penugasan.tipe_penugasan);
    await PenugasanModel.deleteAssignmentByPenugasanId(id);

    return {
      id: parseInt(id),
      tipe_penugasan: penugasan.tipe_penugasan,
      nama_penugasan: penugasan.nama_penugasan,
      is_active: false
    };
  },

  // ============ DELETE COMPLETED PENUGASAN ============
  deleteCompletedPenugasan: async (tipe) => {
    const penugasanList = await PenugasanModel.getPenugasanSelesai(tipe);
    
    if (penugasanList.length === 0) {
      throw new Error('Tidak ada penugasan yang dapat dihapus');
    }

    let totalDeleted = 0;
    let deletedNames = [];

    for (const penugasan of penugasanList) {
      await PenugasanModel.deleteAssignmentByPenugasanId(penugasan.id);
      await PenugasanModel.deletePenugasan(penugasan.id);
      totalDeleted++;
      deletedNames.push(penugasan.nama_penugasan);
    }

    return { total_deleted: totalDeleted, tipe, deleted_penugasan: deletedNames };
  },

  // ============ GET MONITORING PENUGASAN ============
  getMonitoringPenugasan: async (id, tanggal) => {
    const targetDate = tanggal || DateTime.now().setZone('Asia/Jakarta').toISODate();
    
    const penugasan = await PenugasanModel.getPenugasanKhususById(id);
    if (!penugasan) {
      throw new Error('Penugasan tidak ditemukan');
    }

    const assignedUsers = await PenugasanModel.getAssignedUsersByPenugasanId(id);
    const presensiList = await PenugasanModel.getPresensiByPenugasanAndTanggal(id, targetDate);

    const monitoring = assignedUsers.map(user => {
      const presensi = presensiList.find(p => p.user_id === user.user_id);
      return {
        ...user,
        status_presensi: presensi?.jam_masuk ? 'Hadir' : 'Belum Presensi',
        jam_masuk: presensi?.jam_masuk,
        jam_pulang: presensi?.jam_pulang,
        jarak: presensi?.jarak || null
      };
    });

    return {
      penugasan: penugasan,
      tanggal: targetDate,
      monitoring,
      total_pekerja: assignedUsers.length,
      total_hadir: monitoring.filter(m => m.status_presensi === 'Hadir').length
    };
  },

  // ============ GET USER PENUGASAN ============
  getUserPenugasan: async (userId, tanggal = null) => {
    const targetDate = tanggal || DateTime.now().setZone('Asia/Jakarta').toISODate();
    
    const penugasanKhusus = await PenugasanModel.getPenugasanKhususAktifForUser(userId, targetDate);
    
    if (penugasanKhusus) {
      console.log(`✅ User ${userId} menggunakan penugasan KHUSUS: ${penugasanKhusus.nama_penugasan} (radius: ${penugasanKhusus.radius}m)`);
      return penugasanKhusus;
    }
    
    const defaultSystem = await PenugasanModel.getPenugasanDefaultAktifSistem();
    
    if (defaultSystem) {
      console.log(`✅ User ${userId} menggunakan penugasan DEFAULT (tanpa radius)`);
      return defaultSystem;
    }
    
    console.log(`⚠️ User ${userId} tidak memiliki penugasan apapun`);
    return null;
  },

  // ============ CEK PENUGASAN KHUSUS AKTIF ============
  cekPenugasanKhususAktif: async (userId, tanggal = null) => {
    const targetDate = tanggal || DateTime.now().setZone('Asia/Jakarta').toISODate();
    return await PenugasanModel.cekPenugasanKhususAktif(userId, targetDate);
  },

  // ============ VALIDASI RADIUS UNTUK PRESENSI ============
  validatePresensiRadius: async (userId, latitude, longitude, tanggal = null) => {
    if (!latitude || !longitude) {
      return {
        valid: false,
        message: 'Lokasi tidak ditemukan. Silakan aktifkan GPS.'
      };
    }

    const penugasan = await PenugasanService.getUserPenugasan(userId, tanggal);
    
    if (!penugasan) {
      return {
        valid: false,
        message: 'Anda tidak memiliki penugasan aktif untuk hari ini. Hubungi admin.'
      };
    }
    
    if (!penugasan.is_penugasan_khusus) {
      console.log(`📍 User ${userId} menggunakan DEFAULT, tidak ada pengecekan radius`);
      return {
        valid: true,
        penugasan: penugasan,
        is_default: true,
        message: 'Menggunakan penugasan default (tanpa batasan lokasi)'
      };
    }
    
    if (!penugasan.latitude || !penugasan.longitude) {
      return {
        valid: false,
        message: 'Konfigurasi lokasi penugasan tidak lengkap. Hubungi admin.'
      };
    }
    
    if (!penugasan.radius || penugasan.radius <= 0) {
      return {
        valid: false,
        message: 'Konfigurasi radius penugasan tidak valid. Hubungi admin.'
      };
    }
    
    const distance = calculateDistance(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(penugasan.latitude),
      parseFloat(penugasan.longitude)
    );
    
    const radius = parseFloat(penugasan.radius);
    
    console.log(`📍 User ${userId} - Jarak ke lokasi penugasan: ${distance.toFixed(2)}m (radius: ${radius}m)`);
    
    if (distance > radius) {
      return {
        valid: false,
        message: `Anda berada di luar radius presensi (${distance.toFixed(0)}m dari radius ${radius}m)`,
        distance: distance,
        radius: radius,
        penugasan: penugasan,
        is_default: false
      };
    }
    
    return {
      valid: true,
      distance: distance,
      radius: radius,
      penugasan: penugasan,
      is_default: false,
      message: 'Berada dalam radius presensi'
    };
  },

  // ============ CALCULATE DISTANCE ============
  calculateDistance: (lat1, lon1, lat2, lon2) => {
    return calculateDistance(lat1, lon1, lat2, lon2);
  }
};

module.exports = PenugasanService;