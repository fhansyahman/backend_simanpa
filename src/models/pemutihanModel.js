const { pool } = require('../config/database');
const { DateTime } = require('luxon');

const PemutihanModel = {
  // Get data presensi untuk pemutihan
  getDataForPemutihan: async (startDate, endDate, wilayah = null, userId = null, userWilayah = null, userRoles = [], currentUserId = null) => {
    let query = `
      SELECT 
        p.id as presensi_id,
        p.tanggal,
        p.jam_masuk,
        p.jam_pulang,
        p.status_masuk,
        p.status_pulang,
        p.keterangan,
        p.is_lembur,
        p.jam_lembur,
        p.izin_id,
        p.created_at,
        p.updated_at,
        p.user_id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        i.jenis as jenis_izin,
        i.status as status_izin,
        jk.jam_masuk_standar,
        jk.jam_pulang_standar,
        p.foto_masuk,
        p.foto_pulang,
        p.latitude_masuk,
        p.longitude_masuk,
        p.latitude_pulang,
        p.longitude_pulang
      FROM presensi p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN izin i ON p.izin_id = i.id
      LEFT JOIN jam_kerja jk ON u.jam_kerja_id = jk.id
      WHERE p.tanggal BETWEEN ? AND ?
        AND u.is_active = 1 
        AND u.roles LIKE '%pegawai%'
        AND p.izin_id IS NULL
        AND (
          (
            p.jam_masuk IS NULL 
            AND p.status_masuk IS NULL 
            AND p.jam_pulang IS NULL 
            AND p.status_pulang IS NULL
          )
          OR
          (
            p.jam_masuk IS NOT NULL 
            AND p.jam_pulang IS NULL 
          )
          OR
          (
            p.jam_masuk IS NOT NULL 
            AND p.status_pulang = 'Belum Pulang'
          )
        )
        AND (p.keterangan IS NULL OR p.keterangan NOT LIKE '%PEMUTIHAN: Dibatalkan%')
    `;

    const params = [startDate, endDate];

    if (wilayah && wilayah !== 'all' && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(userWilayah || '');
    } else if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND p.user_id = ?';
      params.push(currentUserId);
    }

    query += ' ORDER BY p.tanggal DESC, u.nama ASC';

    const [data] = await pool.execute(query, params);
    return data;
  },

  // Get existing presensi by IDs
  getPresensiByIds: async (ids) => {
    const placeholders = ids.map(() => '?').join(',');
    const [presensi] = await pool.execute(
      `SELECT p.id, p.tanggal, u.nama, p.status_masuk, p.jam_masuk, p.jam_pulang, 
              p.status_pulang, p.izin_id, p.keterangan, u.wilayah_penugasan,
              p.foto_masuk, p.foto_pulang
       FROM presensi p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.id IN (${placeholders})`,
      ids
    );
    return presensi;
  },

  // Update presensi for alpha total
  updateAlphaTotal: async (id, catatanFull) => {
    const [result] = await pool.execute(
      `UPDATE presensi 
       SET 
         status_masuk = 'Tepat Waktu',
         status_pulang = 'Tepat Waktu',
         jam_masuk = COALESCE(jam_masuk, '08:00:00'),
         jam_pulang = COALESCE(jam_pulang, '16:00:00'),
         keterangan = CONCAT(
           COALESCE(keterangan, ''),
           CASE WHEN keterangan IS NOT NULL AND keterangan != '' THEN ' | ' ELSE '' END,
           ?
         ),
         updated_at = NOW()
       WHERE id = ?`,
      [catatanFull, id]
    );
    return result;
  },

  // Update presensi for belum pulang
  updateBelumPulang: async (id, jamPulangDefault, catatanFull) => {
    const [result] = await pool.execute(
      `UPDATE presensi 
       SET 
         status_pulang = 'Tepat Waktu',
         jam_pulang = COALESCE(jam_pulang, ?),
         keterangan = CONCAT(
           COALESCE(keterangan, ''),
           CASE WHEN keterangan IS NOT NULL AND keterangan != '' THEN ' | ' ELSE '' END,
           ?
         ),
         updated_at = NOW()
       WHERE id = ?`,
      [jamPulangDefault, catatanFull, id]
    );
    return result;
  },

  // Cancel pemutihan
  cancelPemutihan: async (id, statusMasuk, statusPulang, jamMasuk, jamPulang, alasanFull) => {
    const [result] = await pool.execute(
      `UPDATE presensi 
       SET 
         status_masuk = ?,
         status_pulang = ?,
         jam_masuk = ?,
         jam_pulang = ?,
         keterangan = CONCAT(
           COALESCE(keterangan, ''),
           ' | ',
           ?
         ),
         updated_at = NOW()
       WHERE id = ?`,
      [statusMasuk, statusPulang, jamMasuk, jamPulang, alasanFull, id]
    );
    return result;
  },

  // Get riwayat pemutihan
  getRiwayatPemutihan: async (startDate, endDate, wilayah = null, jenis = 'all', userRoles = [], userWilayah = null, currentUserId = null) => {
    let query = `
      SELECT 
        p.id as presensi_id,
        p.tanggal,
        p.jam_masuk,
        p.jam_pulang,
        p.status_masuk as status_sebelum,
        p.status_pulang as status_pulang_sebelum,
        p.keterangan,
        p.updated_at as tanggal_pemutihan,
        u.id as user_id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        i.jenis as jenis_izin,
        CASE 
          WHEN p.keterangan LIKE '%PEMUTIHAN: Dibatalkan%' THEN 'dibatalkan'
          WHEN p.keterangan LIKE '%PEMUTIHAN:%' THEN 'diputihkan'
          ELSE 'normal'
        END as status_pemutihan
      FROM presensi p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN izin i ON p.izin_id = i.id
      WHERE p.keterangan LIKE '%PEMUTIHAN:%'
        AND u.is_active = 1
        AND p.tanggal BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (wilayah && wilayah !== 'all' && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    if (jenis === 'diputihkan') {
      query += ' AND p.keterangan LIKE "%PEMUTIHAN:%" AND p.keterangan NOT LIKE "%PEMUTIHAN: Dibatalkan%"';
    } else if (jenis === 'dibatalkan') {
      query += ' AND p.keterangan LIKE "%PEMUTIHAN: Dibatalkan%"';
    }

    if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(userWilayah || '');
    } else if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND p.user_id = ?';
      params.push(currentUserId);
    }

    query += ' ORDER BY p.updated_at DESC, p.tanggal DESC';

    const [riwayat] = await pool.execute(query, params);
    return riwayat;
  },

  // Log activity
  createLog: async (eventType, description, userId, recordsAffected = null) => {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id, records_affected) VALUES (?, ?, ?, ?)',
      [eventType, description, userId, recordsAffected]
    );
  },

  // Validate date
  isValidDate: (year, month) => {
    const bulanNum = parseInt(month);
    const tahunNum = parseInt(year);
    return bulanNum >= 1 && bulanNum <= 12 && tahunNum >= 2000 && tahunNum <= 2100;
  }
};

module.exports = PemutihanModel;