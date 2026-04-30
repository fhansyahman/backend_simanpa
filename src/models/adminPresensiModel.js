// models/presensiModel.js
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

class adminPresensiModel {
  static ensureUploadsDir() {
    const uploadsDir = path.join(__dirname, '../uploads/presensi');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    return uploadsDir;
  }

  static saveBase64Image(base64String, jenis = 'masuk', userId = null, tanggal = null) {
    if (!base64String) return null;
    
    try {
      const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Invalid base64 string');
      }

      const imageType = matches[1];
      const imageData = matches[2];
      
      const ext = imageType.split('/')[1] || 'jpg';
      
      const timestamp = Date.now();
      const filename = `${jenis}_${userId || 'unknown'}_${tanggal || new Date().toISOString().split('T')[0]}_${timestamp}.${ext}`;
      
      const uploadsDir = this.ensureUploadsDir();
      const filePath = path.join(uploadsDir, filename);
      const buffer = Buffer.from(imageData, 'base64');
      
      fs.writeFileSync(filePath, buffer);
      
      return filename;
    } catch (error) {
      console.error('Error saving base64 image:', error);
      return null;
    }
  }

  static deleteFile(filename) {
    if (!filename) return;
    
    try {
      const uploadsDir = path.join(__dirname, '../uploads/presensi');
      const filePath = path.join(uploadsDir, filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }

  static getBase64FromFile(filename) {
    if (!filename) return null;
    
    try {
      const uploadsDir = path.join(__dirname, '../uploads/presensi');
      const filePath = path.join(uploadsDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const fileBuffer = fs.readFileSync(filePath);
      const fileType = path.extname(filePath).substring(1) || 'jpg';
      const base64 = fileBuffer.toString('base64');
      
      return `data:image/${fileType};base64,${base64}`;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  }

  static async findAllWithFilters(filters = {}, user) {
    const { tanggal, bulan, tahun, user_id } = filters;
    const userRoles = user.roles || [];
    const userId = user.id;
    
    let query = `
      SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan,
             pg.nama_penugasan, pg.tipe_penugasan,
             pg.jam_masuk as jam_masuk_standar, pg.jam_pulang as jam_pulang_standar
      FROM presensi p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE 1=1
    `;
    const params = [];

    // Filter berdasarkan roles
    if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND p.user_id = ?';
      params.push(userId);
    } else if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }

    if (tanggal) {
      query += ' AND p.tanggal = ?';
      params.push(tanggal);
    }

    if (bulan && tahun) {
      query += ' AND MONTH(p.tanggal) = ? AND YEAR(p.tanggal) = ?';
      params.push(bulan, tahun);
    }

    if (user_id && (userRoles.includes('admin') || userRoles.includes('supervisor'))) {
      query += ' AND p.user_id = ?';
      params.push(user_id);
    }

    query += ' ORDER BY p.tanggal DESC, u.nama ASC';

    const [presensi] = await pool.execute(query, params);
    return presensi;
  }

  static async findById(id) {
    const [presensi] = await pool.execute(
      `SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan,
              pg.nama_penugasan, pg.tipe_penugasan,
              pg.jam_masuk as jam_masuk_standar, pg.jam_pulang as jam_pulang_standar
       FROM presensi p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
       WHERE p.id = ?`,
      [id]
    );
    
    return presensi[0] || null;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    });

    values.push(id);
    
    const [result] = await pool.execute(
      `UPDATE presensi SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
    
    return result;
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM presensi WHERE id = ?', [id]);
    return result;
  }

  static async findByIdWithWilayah(id) {
    const [presensi] = await pool.execute(
      `SELECT p.*, u.wilayah_penugasan 
       FROM presensi p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
      [id]
    );
    
    return presensi[0] || null;
  }

  static async findExistingPresensi(userId, tanggal) {
    const [existing] = await pool.execute(
      'SELECT id FROM presensi WHERE user_id = ? AND tanggal = ?',
      [userId, tanggal]
    );
    
    return existing[0] || null;
  }

  static async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO presensi 
       (user_id, tanggal, status_pulang, is_system_generated) 
       VALUES (?, ?, 'Belum Pulang', 1)`,
      [data.user_id, data.tanggal]
    );
    
    return result;
  }

  static async getStatistikPerUser(bulan, tahun, user) {
    const userRoles = user.roles || [];
    const userId = user.id;
    
    let query = `
      SELECT 
        u.id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        COUNT(p.id) as total_hari,
        SUM(CASE WHEN p.jam_masuk IS NOT NULL AND p.izin_id IS NULL THEN 1 ELSE 0 END) as total_hadir,
        SUM(CASE WHEN p.status_masuk IN ('Terlambat', 'Terlambat Berat') THEN 1 ELSE 0 END) as total_terlambat,
        SUM(CASE WHEN p.status_masuk = 'Tanpa Keterangan' AND p.izin_id IS NULL THEN 1 ELSE 0 END) as total_tanpa_keterangan,
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as total_lembur
       FROM users u
       LEFT JOIN presensi p ON u.id = p.user_id 
         AND MONTH(p.tanggal) = ? 
         AND YEAR(p.tanggal) = ?
       WHERE u.is_active = 1 AND u.roles = 'pegawai'
    `;
    
    const params = [bulan, tahun];
    
    if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND u.id = ?';
      params.push(userId);
    } else if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }
    
    query += ' GROUP BY u.id, u.nama, u.jabatan, u.wilayah_penugasan ORDER BY u.nama ASC';
    
    const [statistik] = await pool.execute(query, params);
    return statistik;
  }

  static async getOverallStatistik(bulan, tahun) {
    const [overallData] = await pool.execute(
      `SELECT 
        COUNT(DISTINCT p.user_id) as total_pegawai,
        COUNT(p.id) as total_presensi,
        SUM(CASE WHEN p.jam_masuk IS NOT NULL AND p.izin_id IS NULL THEN 1 ELSE 0 END) as total_hadir,
        SUM(CASE WHEN p.status_masuk IN ('Terlambat', 'Terlambat Berat') THEN 1 ELSE 0 END) as total_terlambat,
        SUM(CASE WHEN p.status_masuk = 'Tanpa Keterangan' AND p.izin_id IS NULL THEN 1 ELSE 0 END) as total_tanpa_keterangan,
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as total_lembur
       FROM presensi p
       WHERE MONTH(p.tanggal) = ? AND YEAR(p.tanggal) = ?`,
      [bulan, tahun]
    );
    
    return overallData[0] || {};
  }

  static async getStatistikHarian(tanggal, user) {
    const userRoles = user.roles || [];
    const userId = user.id;
    
    let query = `
      SELECT 
        COUNT(*) as total_presensi,
        SUM(CASE WHEN p.jam_masuk IS NOT NULL AND p.izin_id IS NULL THEN 1 ELSE 0 END) as hadir,
        SUM(CASE WHEN p.status_masuk IN ('Terlambat', 'Terlambat Berat') AND p.izin_id IS NULL THEN 1 ELSE 0 END) as terlambat,
        SUM(CASE WHEN p.status_masuk = 'Tepat Waktu' AND p.izin_id IS NULL THEN 1 ELSE 0 END) as tepat_waktu,
        SUM(CASE WHEN (p.status_masuk = 'Tanpa Keterangan' OR p.jam_masuk IS NULL) AND p.izin_id IS NULL THEN 1 ELSE 0 END) as tanpa_keterangan,
        SUM(CASE WHEN p.izin_id IS NOT NULL THEN 1 ELSE 0 END) as izin,
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as lembur
       FROM presensi p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.tanggal = ?
    `;
    
    const params = [tanggal];
    
    if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND p.user_id = ?';
      params.push(userId);
    } else if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }
    
    const [statistik] = await pool.execute(query, params);
    return statistik[0] || {
      total_presensi: 0,
      hadir: 0,
      terlambat: 0,
      tepat_waktu: 0,
      tanpa_keterangan: 0,
      izin: 0,
      lembur: 0
    };
  }

  static async getStatistikPerWilayah(tanggal, user) {
    const userRoles = user.roles || [];
    
    let query = `
      SELECT 
        u.wilayah_penugasan,
        COUNT(p.id) as total,
        SUM(CASE WHEN p.jam_masuk IS NOT NULL AND p.izin_id IS NULL THEN 1 ELSE 0 END) as hadir,
        SUM(CASE WHEN p.status_masuk IN ('Terlambat', 'Terlambat Berat') AND p.izin_id IS NULL THEN 1 ELSE 0 END) as terlambat,
        SUM(CASE WHEN p.status_masuk = 'Tepat Waktu' AND p.izin_id IS NULL THEN 1 ELSE 0 END) as tepat_waktu,
        SUM(CASE WHEN (p.status_masuk = 'Tanpa Keterangan' OR p.jam_masuk IS NULL) AND p.izin_id IS NULL THEN 1 ELSE 0 END) as tanpa_keterangan,
        SUM(CASE WHEN p.izin_id IS NOT NULL THEN 1 ELSE 0 END) as izin,
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as lembur
       FROM presensi p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.tanggal = ?
    `;
    
    const params = [tanggal];
    
    if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }
    
    query += ' GROUP BY u.wilayah_penugasan ORDER BY u.wilayah_penugasan';
    
    const [wilayahData] = await pool.execute(query, params);
    return wilayahData;
  }

  static async getStatistikPerHariBulanan(bulan, tahun, user) {
    const userRoles = user.roles || [];
    const userId = user.id;
    
    let query = `
      SELECT 
        DAY(p.tanggal) as hari,
        COUNT(*) as total,
        SUM(CASE WHEN p.jam_masuk IS NOT NULL AND p.izin_id IS NULL THEN 1 ELSE 0 END) as hadir,
        SUM(CASE WHEN p.status_masuk IN ('Terlambat', 'Terlambat Berat') AND p.izin_id IS NULL THEN 1 ELSE 0 END) as terlambat,
        SUM(CASE WHEN p.status_masuk = 'Tepat Waktu' AND p.izin_id IS NULL THEN 1 ELSE 0 END) as tepat_waktu,
        SUM(CASE WHEN (p.status_masuk = 'Tanpa Keterangan' OR p.jam_masuk IS NULL) AND p.izin_id IS NULL THEN 1 ELSE 0 END) as tanpa_keterangan,
        SUM(CASE WHEN p.izin_id IS NOT NULL THEN 1 ELSE 0 END) as izin,
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as lembur
       FROM presensi p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE MONTH(p.tanggal) = ? AND YEAR(p.tanggal) = ?
    `;
    
    const params = [bulan, tahun];
    
    if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND p.user_id = ?';
      params.push(userId);
    } else if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }
    
    query += ' GROUP BY DAY(p.tanggal) ORDER BY hari';
    
    const [statistikPerHari] = await pool.execute(query, params);
    return statistikPerHari;
  }

  static async getTotalPegawaiAktif(user) {
    const userRoles = user.roles || [];
    const userId = user.id;
    
    let query = `SELECT COUNT(*) as total FROM users WHERE is_active = 1 AND roles = 'pegawai'`;
    const params = [];
    
    if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND id = ?';
      params.push(userId);
    } else if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }
    
    const [totalUsers] = await pool.execute(query, params);
    return totalUsers[0]?.total || 0;
  }

  static async getPresensiByDate(tanggal, user) {
    const userRoles = user.roles || [];
    const userId = user.id;
    
    let query = `
      SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan,
             pg.nama_penugasan, pg.tipe_penugasan,
             pg.jam_masuk as jam_masuk_standar, pg.jam_pulang as jam_pulang_standar
      FROM presensi p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE p.tanggal = ?
    `;
    
    const params = [tanggal];
    
    if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND p.user_id = ?';
      params.push(userId);
    } else if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }
    
    query += ' ORDER BY u.nama ASC';
    
    const [data] = await pool.execute(query, params);
    return data;
  }

  static async getPresensiByMonth(bulan, tahun, user) {
    const userRoles = user.roles || [];
    const userId = user.id;
    
    let query = `
      SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan,
             pg.nama_penugasan, pg.tipe_penugasan,
             pg.jam_masuk as jam_masuk_standar, pg.jam_pulang as jam_pulang_standar
      FROM presensi p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE MONTH(p.tanggal) = ? AND YEAR(p.tanggal) = ?
    `;
    
    const params = [bulan, tahun];
    
    if (userRoles.includes('pegawai') && !userRoles.includes('admin') && !userRoles.includes('supervisor')) {
      query += ' AND p.user_id = ?';
      params.push(userId);
    } else if (userRoles.includes('supervisor') && !userRoles.includes('admin')) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(user.wilayah_penugasan || '');
    }
    
    query += ' ORDER BY p.tanggal DESC, u.nama ASC';
    
    const [data] = await pool.execute(query, params);
    return data;
  }

  static async getAllActivePegawai() {
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE is_active = 1 AND roles = "pegawai"'
    );
    return users;
  }

  static async createLog(event_type, description, user_id, records_affected = null) {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id, records_affected) VALUES (?, ?, ?, ?)',
      [event_type, description, user_id, records_affected]
    );
  }

  static async getRekapKehadiranBulanan(bulan, tahun) {
    // Get all active pegawai
    const [users] = await pool.execute(
      `SELECT id, nama, jabatan, wilayah_penugasan 
       FROM users 
       WHERE is_active = 1 AND roles = 'pegawai'
       ORDER BY nama ASC`
    );
    
    // Get all presensi in the month
    const [presensiList] = await pool.execute(
      `SELECT user_id, tanggal, status_masuk, status_pulang, izin_id, is_lembur
       FROM presensi 
       WHERE MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
      [bulan, tahun]
    );
    
    // Get all approved izin in the month
    const [izinList] = await pool.execute(
      `SELECT user_id, tanggal_mulai, tanggal_selesai, jenis
       FROM izin 
       WHERE status = 'Disetujui'
         AND (
           (MONTH(tanggal_mulai) = ? AND YEAR(tanggal_mulai) = ?) OR
           (MONTH(tanggal_selesai) = ? AND YEAR(tanggal_selesai) = ?) OR
           (DATE(?) BETWEEN tanggal_mulai AND tanggal_selesai)
         )`,
      [bulan, tahun, bulan, tahun, `${tahun}-${bulan.toString().padStart(2, '0')}-15`]
    );
    
    return { users, presensiList, izinList };
  }
}

module.exports = adminPresensiModel;