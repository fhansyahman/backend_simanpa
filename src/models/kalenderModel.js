const { pool } = require('../config/database');

// ==================== HARI KERJA MODEL ====================
const HariKerjaModel = {
  // Get all hari kerja with filters
  getAll: async (filters = {}) => {
    let query = 'SELECT * FROM hari_kerja WHERE 1=1';
    const params = [];

    if (filters.tahun) {
      query += ' AND YEAR(tanggal) = ?';
      params.push(filters.tahun);
    }

    if (filters.bulan) {
      query += ' AND MONTH(tanggal) = ?';
      params.push(filters.bulan);
    }

    query += ' ORDER BY tanggal DESC';

    const [hariKerja] = await pool.execute(query, params);
    return hariKerja;
  },

  // Get hari kerja by ID
  getById: async (id) => {
    const [existing] = await pool.execute(
      'SELECT tanggal, is_hari_kerja, keterangan FROM hari_kerja WHERE id = ?',
      [id]
    );
    return existing.length ? existing[0] : null;
  },

  // Check if tanggal exists
  isTanggalExists: async (tanggal, excludeId = null) => {
    let query = 'SELECT id FROM hari_kerja WHERE tanggal = ?';
    let params = [tanggal];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [existing] = await pool.execute(query, params);
    return existing.length > 0;
  },

  // Create hari kerja
  create: async (tanggal, is_hari_kerja, keterangan) => {
    const [result] = await pool.execute(
      'INSERT INTO hari_kerja (tanggal, is_hari_kerja, keterangan) VALUES (?, ?, ?)',
      [tanggal, is_hari_kerja ? 1 : 0, keterangan]
    );
    return result.insertId;
  },

  // Update hari kerja
  update: async (id, tanggal, is_hari_kerja, keterangan) => {
    const [result] = await pool.execute(
      'UPDATE hari_kerja SET tanggal = ?, is_hari_kerja = ?, keterangan = ? WHERE id = ?',
      [tanggal, is_hari_kerja ? 1 : 0, keterangan, id]
    );
    return result;
  },

  // Delete hari kerja
  delete: async (id) => {
    const [result] = await pool.execute('DELETE FROM hari_kerja WHERE id = ?', [id]);
    return result;
  },

  // Upsert for bulk operation
  upsert: async (tanggal, is_hari_kerja, keterangan) => {
    const [existing] = await pool.execute(
      'SELECT id FROM hari_kerja WHERE tanggal = ?',
      [tanggal]
    );

    if (existing.length > 0) {
      await pool.execute(
        'UPDATE hari_kerja SET is_hari_kerja = ?, keterangan = ? WHERE tanggal = ?',
        [is_hari_kerja ? 1 : 0, keterangan, tanggal]
      );
      return { action: 'updated' };
    } else {
      const [result] = await pool.execute(
        'INSERT INTO hari_kerja (tanggal, is_hari_kerja, keterangan) VALUES (?, ?, ?)',
        [tanggal, is_hari_kerja ? 1 : 0, keterangan]
      );
      return { action: 'created', id: result.insertId };
    }
  },

  // Get hari kerja by month
  getByMonth: async (tahun, bulan) => {
    const [hariKerja] = await pool.execute(
      `SELECT tanggal, is_hari_kerja, keterangan 
       FROM hari_kerja 
       WHERE YEAR(tanggal) = ? AND MONTH(tanggal) = ?
       ORDER BY tanggal ASC`,
      [tahun, bulan]
    );
    return hariKerja;
  }
};

// ==================== HARI LIBUR MODEL ====================
const HariLiburModel = {
  // Get all hari libur with filters
  getAll: async (filters = {}) => {
    let query = 'SELECT * FROM hari_libur WHERE 1=1';
    const params = [];

    if (filters.tahun) {
      query += ' AND (tahun = ? OR is_tahunan = 1)';
      params.push(filters.tahun);
    }

    if (filters.is_tahunan !== undefined) {
      query += ' AND is_tahunan = ?';
      params.push(filters.is_tahunan ? 1 : 0);
    }

    query += ' ORDER BY tanggal ASC';

    const [hariLibur] = await pool.execute(query, params);
    return hariLibur;
  },

  // Get hari libur by ID
  getById: async (id) => {
    const [existing] = await pool.execute(
      'SELECT tanggal, nama_libur, is_tahunan, tahun FROM hari_libur WHERE id = ?',
      [id]
    );
    return existing.length ? existing[0] : null;
  },

  // Check if tanggal exists
  isTanggalExists: async (tanggal, excludeId = null) => {
    let query = 'SELECT id FROM hari_libur WHERE tanggal = ?';
    let params = [tanggal];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [existing] = await pool.execute(query, params);
    return existing.length > 0;
  },

  // Create hari libur
  create: async (tanggal, nama_libur, is_tahunan, tahun) => {
    const targetTahun = is_tahunan ? null : (tahun || new Date().getFullYear());
    const [result] = await pool.execute(
      'INSERT INTO hari_libur (tanggal, nama_libur, is_tahunan, tahun) VALUES (?, ?, ?, ?)',
      [tanggal, nama_libur, is_tahunan ? 1 : 0, targetTahun]
    );
    return result.insertId;
  },

  // Update hari libur
  update: async (id, tanggal, nama_libur, is_tahunan, tahun) => {
    const targetTahun = is_tahunan ? null : (tahun || new Date().getFullYear());
    const [result] = await pool.execute(
      'UPDATE hari_libur SET tanggal = ?, nama_libur = ?, is_tahunan = ?, tahun = ? WHERE id = ?',
      [tanggal, nama_libur, is_tahunan ? 1 : 0, targetTahun, id]
    );
    return result;
  },

  // Delete hari libur
  delete: async (id) => {
    const [result] = await pool.execute('DELETE FROM hari_libur WHERE id = ?', [id]);
    return result;
  },

  // Get hari libur by month
  getByMonth: async (tahun, bulan) => {
    const [hariLibur] = await pool.execute(
      `SELECT tanggal, nama_libur, is_tahunan
       FROM hari_libur 
       WHERE (YEAR(tanggal) = ? OR is_tahunan = 1) AND MONTH(tanggal) = ?
       ORDER BY tanggal ASC`,
      [tahun, bulan]
    );
    return hariLibur;
  }
};

// ==================== LOG MODEL ====================
const KalenderLogModel = {
  create: async (event_type, description, user_id) => {
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      [event_type, description, user_id]
    );
  }
};

module.exports = { HariKerjaModel, HariLiburModel, KalenderLogModel };