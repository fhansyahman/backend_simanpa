// src/controllers/kinerjaController.js
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');
const { 
  generateKinerjaPDF, 
  generateRekapWilayahPDF,
  generateWilayahAllPDFs 
} = require('../utils/pdfGenerator');

// File Utility Functions
const ensureUploadsDir = () => {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
};

const saveBase64Image = (base64String, subfolder = 'kinerja') => {
  if (!base64String) return null;
  
  try {
    // Handle both formats: with and without data:image prefix
    let imageData = base64String;
    let imageType = 'jpeg';
    
    if (base64String.includes(';base64,')) {
      const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        imageType = matches[1].split('/')[1] || 'jpeg';
        imageData = matches[2];
      }
    }
    
    const filename = `${subfolder}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${imageType}`;
    const uploadsDir = ensureUploadsDir();
    const subfolderDir = path.join(uploadsDir, subfolder);
    
    if (!fs.existsSync(subfolderDir)) {
      fs.mkdirSync(subfolderDir, { recursive: true });
    }
    
    const filePath = path.join(subfolderDir, filename);
    const buffer = Buffer.from(imageData, 'base64');
    
    fs.writeFileSync(filePath, buffer);
    
    return `/uploads/${subfolder}/${filename}`;
  } catch (error) {
    console.error('Error saving base64 image:', error);
    return null;
  }
};

const deleteFile = (filePath) => {
  if (!filePath) return;
  
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

const getBase64FromFile = (filePath) => {
  if (!filePath) return null;
  
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    
    const fileBuffer = fs.readFileSync(fullPath);
    const fileType = path.extname(filePath).substring(1);
    const base64 = fileBuffer.toString('base64');
    
    return `data:image/${fileType};base64,${base64}`;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
};

// Main Controller Functions
const createKinerja = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      tanggal,
      ruas_jalan,
      kegiatan,
      panjang_kr,
      panjang_kn,
      sket_image,
      foto_0,
      foto_50,
      foto_100
    } = req.body;

    // Validasi required fields
    if (!tanggal || !ruas_jalan || !kegiatan) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal, ruas jalan, dan kegiatan wajib diisi'
      });
    }

    // Set default value untuk panjang jika tidak ada
    const finalPanjangKr = panjang_kr !== undefined && panjang_kr !== null ? panjang_kr : 0;
    const finalPanjangKn = panjang_kn !== undefined && panjang_kn !== null ? panjang_kn : 0;

    // Cek apakah sudah ada data untuk tanggal dan user yang sama
    const [existing] = await pool.execute(
      'SELECT id FROM kinerja_harian WHERE user_id = ? AND tanggal = ?',
      [userId, tanggal]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Data kinerja untuk tanggal ini sudah ada'
      });
    }

    // Simpan gambar sebagai file
    const sketImagePath = saveBase64Image(sket_image, 'sket');
    const foto0Path = saveBase64Image(foto_0, 'foto');
    const foto50Path = saveBase64Image(foto_50, 'foto');
    const foto100Path = saveBase64Image(foto_100, 'foto');

    // Insert data kinerja
    const [result] = await pool.execute(
      `INSERT INTO kinerja_harian 
       (user_id, tanggal, ruas_jalan, kegiatan, panjang_kr, panjang_kn, 
        sket_image, foto_0, foto_50, foto_100) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        tanggal,
        ruas_jalan,
        kegiatan,
        finalPanjangKr,
        finalPanjangKn,
        sketImagePath,
        foto0Path,
        foto50Path,
        foto100Path
      ]
    );

    // Log activity
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['KINERJA_CREATE', `User membuat laporan kinerja harian - Ruas: ${ruas_jalan}`, userId]
    );

    res.status(201).json({
      success: true,
      message: 'Data kinerja harian berhasil disimpan',
      data: {
        id: result.insertId
      }
    });

  } catch (error) {
    console.error('Create kinerja error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

// NEW: Create kinerja with camera capture (accepts base64 images)
const createKinerjaWithCamera = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      tanggal,
      ruas_jalan,
      kegiatan,
      panjang_kr,
      panjang_kn,
      sket_image,
      foto_0,
      foto_50,
      foto_100
    } = req.body;

    // Validasi required fields
    if (!tanggal || !ruas_jalan || !kegiatan) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal, ruas jalan, dan kegiatan wajib diisi'
      });
    }

    // Validasi minimal satu foto dari kamera
    if (!foto_0 && !foto_50 && !foto_100) {
      return res.status(400).json({
        success: false,
        message: 'Minimal satu foto dokumentasi wajib diambil'
      });
    }

    // Set default value untuk panjang jika tidak ada
    const finalPanjangKr = panjang_kr !== undefined && panjang_kr !== null ? parseFloat(panjang_kr) : 0;
    const finalPanjangKn = panjang_kn !== undefined && panjang_kn !== null ? parseFloat(panjang_kn) : 0;

    // Cek apakah sudah ada data untuk tanggal dan user yang sama
    const [existing] = await pool.execute(
      'SELECT id FROM kinerja_harian WHERE user_id = ? AND tanggal = ?',
      [userId, tanggal]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Data kinerja untuk tanggal ini sudah ada'
      });
    }

    // Simpan gambar dari base64 (dari kamera)
    const sketImagePath = sket_image ? saveBase64Image(sket_image, 'sket') : null;
    const foto0Path = foto_0 ? saveBase64Image(foto_0, 'foto') : null;
    const foto50Path = foto_50 ? saveBase64Image(foto_50, 'foto') : null;
    const foto100Path = foto_100 ? saveBase64Image(foto_100, 'foto') : null;

    // Insert data kinerja
    const [result] = await pool.execute(
      `INSERT INTO kinerja_harian 
       (user_id, tanggal, ruas_jalan, kegiatan, panjang_kr, panjang_kn, 
        sket_image, foto_0, foto_50, foto_100) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        tanggal,
        ruas_jalan,
        kegiatan,
        finalPanjangKr,
        finalPanjangKn,
        sketImagePath,
        foto0Path,
        foto50Path,
        foto100Path
      ]
    );

    // Log activity with camera flag
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['KINERJA_CREATE_CAMERA', `User membuat laporan kinerja harian via kamera - Ruas: ${ruas_jalan}`, userId]
    );

    res.status(201).json({
      success: true,
      message: 'Data kinerja harian berhasil disimpan (via kamera)',
      data: {
        id: result.insertId
      }
    });

  } catch (error) {
    console.error('Create kinerja with camera error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server saat menyimpan data dari kamera'
    });
  }
};

const getKinerjaUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bulan, tahun } = req.query;

    let query = `
      SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE k.user_id = ?
    `;
    const params = [userId];

    if (bulan && tahun) {
      query += ' AND MONTH(k.tanggal) = ? AND YEAR(k.tanggal) = ?';
      params.push(bulan, tahun);
    }

    query += ' ORDER BY k.tanggal DESC';

    const [kinerja] = await pool.execute(query, params);

    // Convert file paths back to base64 untuk response
    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100)
    }));

    res.json({
      success: true,
      data: parsedKinerja
    });

  } catch (error) {
    console.error('Get kinerja user error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const getKinerjaById = async (req, res) => {
  try {
    const { id } = req.params;

    const [kinerja] = await pool.execute(
      `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM kinerja_harian k
       JOIN users u ON k.user_id = u.id
       WHERE k.id = ?`,
      [id]
    );

    if (kinerja.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Data kinerja tidak ditemukan'
      });
    }

    // Convert file paths back to base64
    const data = {
      ...kinerja[0],
      sket_image: getBase64FromFile(kinerja[0].sket_image),
      foto_0: getBase64FromFile(kinerja[0].foto_0),
      foto_50: getBase64FromFile(kinerja[0].foto_50),
      foto_100: getBase64FromFile(kinerja[0].foto_100)
    };

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Get kinerja by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const updateKinerja = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      tanggal,
      ruas_jalan,
      kegiatan,
      panjang_kr,
      panjang_kn,
      sket_image,
      foto_0,
      foto_50,
      foto_100
    } = req.body;

    // Cek kepemilikan data dan dapatkan data lama
    const [existing] = await pool.execute(
      'SELECT * FROM kinerja_harian WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Data kinerja tidak ditemukan'
      });
    }

    // Cek akses (user sendiri atau admin)
    if (existing[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses untuk mengubah data ini'
      });
    }

    const oldData = existing[0];

    // Gunakan data lama jika field tidak dikirim atau null/undefined
    const finalTanggal = tanggal || oldData.tanggal;
    const finalRuasJalan = ruas_jalan || oldData.ruas_jalan;
    const finalKegiatan = kegiatan || oldData.kegiatan;
    
    // Untuk panjang, jika tidak dikirim atau null, gunakan data lama
    const finalPanjangKr = panjang_kr !== undefined && panjang_kr !== null 
      ? parseFloat(panjang_kr) 
      : oldData.panjang_kr;
    const finalPanjangKn = panjang_kn !== undefined && panjang_kn !== null 
      ? parseFloat(panjang_kn) 
      : oldData.panjang_kn;

    // Validasi hanya untuk field yang wajib
    if (!finalTanggal || !finalRuasJalan || !finalKegiatan) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal, ruas jalan, dan kegiatan wajib diisi'
      });
    }

    // Handle gambar - simpan yang baru, hapus yang lama jika diupdate
    let sketImagePath = oldData.sket_image;
    let foto0Path = oldData.foto_0;
    let foto50Path = oldData.foto_50;
    let foto100Path = oldData.foto_100;

    // Jika ada gambar baru (bukan 'keep' dan berbeda dari yang lama)
    if (sket_image && sket_image !== 'keep' && sket_image !== oldData.sket_image) {
      if (sketImagePath) {
        deleteFile(sketImagePath);
      }
      sketImagePath = saveBase64Image(sket_image, 'sket');
    }

    if (foto_0 && foto_0 !== 'keep' && foto_0 !== oldData.foto_0) {
      if (foto0Path) {
        deleteFile(foto0Path);
      }
      foto0Path = saveBase64Image(foto_0, 'foto');
    }

    if (foto_50 && foto_50 !== 'keep' && foto_50 !== oldData.foto_50) {
      if (foto50Path) {
        deleteFile(foto50Path);
      }
      foto50Path = saveBase64Image(foto_50, 'foto');
    }

    if (foto_100 && foto_100 !== 'keep' && foto_100 !== oldData.foto_100) {
      if (foto100Path) {
        deleteFile(foto100Path);
      }
      foto100Path = saveBase64Image(foto_100, 'foto');
    }

    // Update data
    await pool.execute(
      `UPDATE kinerja_harian SET 
        tanggal = ?, ruas_jalan = ?, kegiatan = ?, 
        panjang_kr = ?, panjang_kn = ?,
        sket_image = ?, foto_0 = ?, foto_50 = ?, foto_100 = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        finalTanggal,
        finalRuasJalan,
        finalKegiatan,
        finalPanjangKr,
        finalPanjangKn,
        sketImagePath,
        foto0Path,
        foto50Path,
        foto100Path,
        id
      ]
    );

    // Log activity
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['KINERJA_UPDATE', `User mengupdate laporan kinerja harian - ID: ${id}`, userId]
    );

    res.json({
      success: true,
      message: 'Data kinerja berhasil diupdate'
    });

  } catch (error) {
    console.error('Update kinerja error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const deleteKinerja = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Cek kepemilikan data dan dapatkan path file
    const [existing] = await pool.execute(
      'SELECT user_id, sket_image, foto_0, foto_50, foto_100 FROM kinerja_harian WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Data kinerja tidak ditemukan'
      });
    }

    if (existing[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses untuk menghapus data ini'
      });
    }

    // Hapus file-file gambar
    const fileFields = ['sket_image', 'foto_0', 'foto_50', 'foto_100'];
    fileFields.forEach(field => {
      if (existing[0][field]) {
        deleteFile(existing[0][field]);
      }
    });

    // Delete data dari database
    await pool.execute('DELETE FROM kinerja_harian WHERE id = ?', [id]);

    // Log activity
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['KINERJA_DELETE', `User menghapus laporan kinerja harian - ID: ${id}`, userId]
    );

    res.json({
      success: true,
      message: 'Data kinerja berhasil dihapus'
    });

  } catch (error) {
    console.error('Delete kinerja error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const getAllKinerja = async (req, res) => {
  try {
    const { start_date, end_date, wilayah, user_id } = req.query;

    let query = `
      SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date && end_date) {
      query += ' AND k.tanggal BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    if (wilayah) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    if (user_id) {
      query += ' AND k.user_id = ?';
      params.push(user_id);
    }

    query += ' ORDER BY k.tanggal DESC, u.nama ASC';

    const [kinerja] = await pool.execute(query, params);

    // Convert file paths ke base64
    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100)
    }));

    res.json({
      success: true,
      data: parsedKinerja
    });

  } catch (error) {
    console.error('Get all kinerja error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const getKinerjaStatistik = async (req, res) => {
  try {
    const { bulan, tahun, wilayah } = req.query;

    const targetBulan = bulan || new Date().getMonth() + 1;
    const targetTahun = tahun || new Date().getFullYear();

    let query = `
      SELECT 
        u.wilayah_penugasan,
        COUNT(k.id) as total_laporan,
        COUNT(DISTINCT k.user_id) as total_pegawai,
        AVG(k.panjang_kr) as avg_panjang_kr,
        AVG(k.panjang_kn) as avg_panjang_kn
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE MONTH(k.tanggal) = ? AND YEAR(k.tanggal) = ?
    `;
    const params = [targetBulan, targetTahun];

    if (wilayah) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    query += ' GROUP BY u.wilayah_penugasan ORDER BY total_laporan DESC';

    const [statistik] = await pool.execute(query, params);

    res.json({
      success: true,
      data: statistik
    });

  } catch (error) {
    console.error('Get kinerja statistik error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const generatePDF = async (req, res) => {
  try {
    const { id } = req.params;

    // Get kinerja data
    const [kinerja] = await pool.execute(
      `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM kinerja_harian k
       JOIN users u ON k.user_id = u.id
       WHERE k.id = ?`,
      [id]
    );

    if (kinerja.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Data kinerja tidak ditemukan'
      });
    }

    const kinerjaData = kinerja[0];

    // Generate PDF
    const pdfBuffer = await generateKinerjaPDF(kinerjaData);

    // Log activity
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['PDF_GENERATE', `Generate PDF laporan kinerja - ID: ${id}`, req.user.id]
    );

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan_${kinerjaData.nama}_${kinerjaData.tanggal}.pdf"`);
    
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat generate PDF'
    });
  }
};

const generateRekapWilayah = async (req, res) => {
  try {
    const { wilayah, start_date, end_date } = req.body;

    if (!wilayah) {
      return res.status(400).json({
        success: false,
        message: 'Wilayah harus diisi'
      });
    }

    // Get statistik wilayah
    const [statistik] = await pool.execute(
      `SELECT 
        u.wilayah_penugasan as wilayah,
        COUNT(k.id) as total_laporan,
        COUNT(DISTINCT k.user_id) as total_pegawai,
        AVG(k.panjang_kr) as avg_panjang_kr,
        AVG(k.panjang_kn) as avg_panjang_kn
       FROM kinerja_harian k
       JOIN users u ON k.user_id = u.id
       WHERE u.wilayah_penugasan = ?
       ${start_date && end_date ? ' AND k.tanggal BETWEEN ? AND ?' : ''}
       GROUP BY u.wilayah_penugasan`,
      start_date && end_date ? [wilayah, start_date, end_date] : [wilayah]
    );

    if (statistik.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ada data untuk wilayah ini'
      });
    }

    // Get detail laporan
    const [laporanList] = await pool.execute(
      `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM kinerja_harian k
       JOIN users u ON k.user_id = u.id
       WHERE u.wilayah_penugasan = ?
       ${start_date && end_date ? ' AND k.tanggal BETWEEN ? AND ?' : ''}
       ORDER BY k.tanggal DESC, u.nama ASC`,
      start_date && end_date ? [wilayah, start_date, end_date] : [wilayah]
    );

    const wilayahData = statistik[0];
    const periode = start_date && end_date 
      ? `${start_date} s/d ${end_date}`
      : 'Semua Periode';

    // Generate PDF
    const pdfBuffer = await generateRekapWilayahPDF(wilayahData, periode, laporanList);

    // Log activity
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['PDF_GENERATE_REKAP', `Generate rekap PDF wilayah ${wilayah}`, req.user.id]
    );

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Rekap_Wilayah_${wilayah}.pdf"`);
    
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Generate rekap wilayah error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat generate rekap PDF'
    });
  }
};

const downloadAllWilayah = async (req, res) => {
  try {
    const { wilayah, start_date, end_date } = req.query;

    if (!wilayah) {
      return res.status(400).json({
        success: false,
        message: 'Wilayah harus diisi'
      });
    }

    // Get detail laporan
    const [laporanList] = await pool.execute(
      `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM kinerja_harian k
       JOIN users u ON k.user_id = u.id
       WHERE u.wilayah_penugasan = ?
       ${start_date && end_date ? ' AND k.tanggal BETWEEN ? AND ?' : ''}
       ORDER BY k.tanggal DESC, u.nama ASC`,
      start_date && end_date ? [wilayah, start_date, end_date] : [wilayah]
    );

    if (laporanList.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ada data untuk wilayah ini'
      });
    }

    // Calculate statistics
    const totalPegawai = new Set(laporanList.map(item => item.user_id)).size;
    
    // Calculate averages
    let totalPanjangKr = 0;
    let totalPanjangKn = 0;
    let countValidKr = 0;
    let countValidKn = 0;

    laporanList.forEach(item => {
      const kr = parseFloat(item.panjang_kr) || 0;
      const kn = parseFloat(item.panjang_kn) || 0;
      
      if (kr > 0) {
        totalPanjangKr += kr;
        countValidKr++;
      }
      
      if (kn > 0) {
        totalPanjangKn += kn;
        countValidKn++;
      }
    });

    const wilayahData = {
      wilayah: wilayah,
      total_laporan: laporanList.length,
      total_pegawai: totalPegawai,
      avg_panjang_kr: countValidKr > 0 ? totalPanjangKr / countValidKr : 0,
      avg_panjang_kn: countValidKn > 0 ? totalPanjangKn / countValidKn : 0
    };

    const periode = start_date && end_date 
      ? `${start_date}_sampai_${end_date}`
      : 'semua_periode';

    // Generate ZIP dengan semua file PDF
    const zipBuffer = await generateWilayahAllPDFs(wilayahData, periode, laporanList);

    // Log activity
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['DOWNLOAD_ALL_WILAYAH', `Download semua laporan wilayah ${wilayah} (${laporanList.length} files)`, req.user.id]
    );

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Semua_Laporan_Wilayah_${wilayah}.zip"`);
    
    res.send(zipBuffer);

  } catch (error) {
    console.error('Download all wilayah error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat download semua laporan'
    });
  }
};
// ============ FUNGSI GET KINERJA USER PER BULAN (EFISIEN) ============

/**
 * FUNGSI BARU: Get kinerja user per bulan (lebih efisien)
 * Endpoint: GET /kinerja/perbulan
 * Query params: bulan, tahun (optional, default ke bulan/tahun saat ini)
 */
// ============ FUNGSI GET KINERJA USER PER BULAN (EFISIEN) ============

/**
 * FUNGSI BARU: Get kinerja user per bulan (lebih efisien)
 * Endpoint: GET /kinerja/perbulan
 * Query params: bulan, tahun (optional, default ke bulan/tahun saat ini)
 */
const getKinerjaUserPerBulan = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Ambil parameter bulan dan tahun dari query string
    let { bulan, tahun } = req.query;
    
    // Default ke bulan dan tahun saat ini
    const currentDate = DateTime.now().setZone('Asia/Jakarta');
    
    // Validasi dan parsing bulan
    let targetBulan;
    if (bulan && bulan !== '' && !isNaN(parseInt(bulan))) {
      targetBulan = parseInt(bulan);
    } else {
      targetBulan = currentDate.month;
    }
    
    // Validasi dan parsing tahun
    let targetTahun;
    if (tahun && tahun !== '' && !isNaN(parseInt(tahun))) {
      targetTahun = parseInt(tahun);
    } else {
      targetTahun = currentDate.year;
    }
    
    // Validasi bulan (1-12)
    if (targetBulan < 1 || targetBulan > 12) {
      return res.status(400).json({
        success: false,
        message: 'Bulan harus antara 1 dan 12'
      });
    }
    
    // Validasi tahun (minimal 2000)
    if (targetTahun < 2000 || targetTahun > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Tahun tidak valid'
      });
    }
    
    console.log(`📊 Getting kinerja for user ${userId} - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);
    
    // Hitung tanggal awal dan akhir bulan
    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();
    
    // Query untuk mengambil data kinerja (sama persis dengan getKinerjaUser)
    const [kinerja] = await pool.execute(
      `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM kinerja_harian k
       JOIN users u ON k.user_id = u.id
       WHERE k.user_id = ? AND k.tanggal BETWEEN ? AND ?
       ORDER BY k.tanggal DESC`,
      [userId, startDate, endDate]
    );
    
    // Convert file paths back to base64 (sama persis dengan getKinerjaUser)
    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100)
    }));
    
    // Hitung statistik (sama persis dengan getKinerjaUser)
    const totalLaporan = parsedKinerja.length;
    const totalPanjang = parsedKinerja.reduce((sum, item) => {
      const kr = parseFloat(item.panjang_kr) || 0;
      const kn = parseFloat(item.panjang_kn) || 0;
      return sum + kr + kn;
    }, 0);
    const avgPanjang = totalLaporan > 0 ? totalPanjang / totalLaporan : 0;
    
    // Hitung total hari kerja dalam bulan (Senin-Jumat)
    let totalHariKerja = 0;
    const startDateObj = DateTime.fromISO(startDate);
    const endDateObj = DateTime.fromISO(endDate);
    let currentDateLoop = startDateObj;
    
    while (currentDateLoop <= endDateObj) {
      const dayOfWeek = currentDateLoop.weekday;
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        totalHariKerja++;
      }
      currentDateLoop = currentDateLoop.plus({ days: 1 });
    }
    
    const presentaseKehadiran = totalHariKerja > 0 ? Math.round((totalLaporan / totalHariKerja) * 100) : 0;
    
    res.json({
      success: true,
      data: {
        periode: {
          bulan: targetBulan,
          tahun: targetTahun,
          nama_bulan: DateTime.fromObject({ month: targetBulan }).setLocale('id').toFormat('MMMM'),
          start_date: startDate,
          end_date: endDate,
          total_hari_kerja: totalHariKerja
        },
        stats: {
          total_laporan: totalLaporan,
          total_panjang: totalPanjang,
          avg_panjang: avgPanjang,
          presentase_kehadiran: presentaseKehadiran
        },
        kinerja: parsedKinerja
      }
    });
    
  } catch (error) {
    console.error('❌ Get kinerja per bulan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ FUNGSI GET KINERJA PER TANGGAL (UNTUK ADMIN) ============

/**
 * FUNGSI BARU: Get kinerja per tanggal (untuk admin)
 * Endpoint: GET /kinerja/admin/per-tanggal
 * Query params: tanggal (wajib), wilayah (optional), search (optional)
 */
const getKinerjaPerTanggal = async (req, res) => {
  try {
    // Hanya admin dan atasan yang bisa akses
    if (req.user.roles !== 'admin' && req.user.roles !== 'atasan') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin dan atasan yang dapat mengakses.'
      });
    }

    const { tanggal, wilayah, search } = req.query;

    // Validasi tanggal wajib
    if (!tanggal) {
      return res.status(400).json({
        success: false,
        message: 'Parameter tanggal wajib diisi dengan format YYYY-MM-DD'
      });
    }

    // Validasi format tanggal
    const targetDate = DateTime.fromISO(tanggal);
    if (!targetDate.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Format tanggal tidak valid. Gunakan format: YYYY-MM-DD'
      });
    }

    console.log(`📊 Getting kinerja for date: ${tanggal}`);
    console.log(`Filters - Wilayah: ${wilayah || 'semua'}, Search: ${search || 'tidak ada'}`);

    let query = `
      SELECT 
        k.*, 
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        DATE_FORMAT(k.tanggal, '%d %M %Y') as tanggal_formatted,
        DATE_FORMAT(k.tanggal, '%W') as hari
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE DATE(k.tanggal) = ?
        AND u.is_active = 1
    `;
    
    const params = [tanggal];

    // Filter wilayah
    if (wilayah && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    // Filter search (nama pegawai, ruas jalan, atau kegiatan)
    if (search && search !== '') {
      query += ` AND (
        u.nama LIKE ? OR 
        k.ruas_jalan LIKE ? OR 
        k.kegiatan LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY u.nama ASC, k.tanggal DESC';

    console.log('📝 SQL Query:', query);
    console.log('📝 Parameters:', params);

    const [kinerja] = await pool.execute(query, params);

    console.log(`✅ Found ${kinerja.length} kinerja records for date ${tanggal}`);

    // Convert file paths ke base64 (sama seperti getAllKinerja)
    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100),
      // Tambahkan formatted fields
      panjang_kr_formatted: item.panjang_kr ? `${item.panjang_kr} meter` : '0 meter',
      panjang_kn_formatted: item.panjang_kn ? `${item.panjang_kn} meter` : '0 meter',
      total_panjang: (parseFloat(item.panjang_kr) || 0) + (parseFloat(item.panjang_kn) || 0)
    }));

    // Hitung statistik
    const totalLaporan = parsedKinerja.length;
    const uniquePegawai = [...new Set(parsedKinerja.map(item => item.user_id))].length;
    const totalPanjangKR = parsedKinerja.reduce((sum, item) => sum + (parseFloat(item.panjang_kr) || 0), 0);
    const totalPanjangKN = parsedKinerja.reduce((sum, item) => sum + (parseFloat(item.panjang_kn) || 0), 0);
    const avgPanjangKR = totalLaporan > 0 ? totalPanjangKR / totalLaporan : 0;
    const avgPanjangKN = totalLaporan > 0 ? totalPanjangKN / totalLaporan : 0;

    // Statistik per wilayah
    const wilayahStatistik = {};
    parsedKinerja.forEach(item => {
      const wilayahName = item.wilayah_penugasan || 'Unknown';
      if (!wilayahStatistik[wilayahName]) {
        wilayahStatistik[wilayahName] = {
          total: 0,
          total_kr: 0,
          total_kn: 0,
          pegawai: new Set()
        };
      }
      wilayahStatistik[wilayahName].total++;
      wilayahStatistik[wilayahName].total_kr += parseFloat(item.panjang_kr) || 0;
      wilayahStatistik[wilayahName].total_kn += parseFloat(item.panjang_kn) || 0;
      wilayahStatistik[wilayahName].pegawai.add(item.user_id);
    });

    // Konversi Set ke jumlah untuk response
    Object.keys(wilayahStatistik).forEach(wilayahName => {
      wilayahStatistik[wilayahName].total_pegawai = wilayahStatistik[wilayahName].pegawai.size;
      delete wilayahStatistik[wilayahName].pegawai;
    });

    // Data untuk chart
    const chartData = {
      labels: ['Panjang KR', 'Panjang KN'],
      datasets: [{
        data: [totalPanjangKR, totalPanjangKN],
        backgroundColor: ['#10B981', '#3B82F6'],
        borderColor: ['#0DA675', '#2563EB'],
        borderWidth: 1
      }]
    };

    res.json({
      success: true,
      data: {
        tanggal: tanggal,
        tanggal_formatted: targetDate.toFormat('dd MMMM yyyy'),
        hari: targetDate.toFormat('EEEE'),
        statistik: {
          total_laporan: totalLaporan,
          total_pegawai: uniquePegawai,
          total_panjang_kr: parseFloat(totalPanjangKR.toFixed(2)),
          total_panjang_kn: parseFloat(totalPanjangKN.toFixed(2)),
          avg_panjang_kr: parseFloat(avgPanjangKR.toFixed(2)),
          avg_panjang_kn: parseFloat(avgPanjangKN.toFixed(2)),
          wilayah: wilayahStatistik
        },
        charts: {
          pie: chartData
        },
        kinerja: parsedKinerja
      }
    });

  } catch (error) {
    console.error('❌ Get kinerja per tanggal error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ FUNGSI GET ALL KINERJA PER BULAN (UNTUK ADMIN) ============

/**
 * FUNGSI BARU: Get semua kinerja per bulan untuk admin
 * Endpoint: GET /kinerja/admin/perbulan
 * Query params: bulan, tahun (wajib), wilayah (optional), search (optional)
 */
const getAllKinerjaPerBulan = async (req, res) => {
  try {
    // Hanya admin dan atasan yang bisa akses
    if (req.user.roles !== 'admin' && req.user.roles !== 'atasan') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin dan atasan yang dapat mengakses.'
      });
    }

    let { bulan, tahun, wilayah, search } = req.query;

    // Validasi bulan dan tahun wajib
    if (!bulan || !tahun) {
      return res.status(400).json({
        success: false,
        message: 'Parameter bulan dan tahun wajib diisi'
      });
    }

    const targetBulan = parseInt(bulan);
    const targetTahun = parseInt(tahun);

    // Validasi bulan (1-12)
    if (targetBulan < 1 || targetBulan > 12) {
      return res.status(400).json({
        success: false,
        message: 'Bulan harus antara 1 dan 12'
      });
    }

    // Validasi tahun (minimal 2000)
    if (targetTahun < 2000 || targetTahun > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Tahun tidak valid'
      });
    }

    console.log(`📊 Getting all kinerja for admin - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);
    console.log(`Filters - Wilayah: ${wilayah || 'semua'}, Search: ${search || 'tidak ada'}`);

    // Hitung tanggal awal dan akhir bulan
    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();

    let query = `
      SELECT 
        k.*, 
        u.id as user_id,
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        DATE_FORMAT(k.tanggal, '%Y-%m-%d') as tanggal,
        DATE_FORMAT(k.tanggal, '%d %M %Y') as tanggal_formatted,
        DATE_FORMAT(k.tanggal, '%W') as hari
      FROM kinerja_harian k
      JOIN users u ON k.user_id = u.id
      WHERE DATE(k.tanggal) BETWEEN ? AND ?
        AND u.is_active = 1
        AND u.roles = 'pegawai'
    `;
    
    const params = [startDate, endDate];

    // Filter wilayah
    if (wilayah && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    // Filter search (nama pegawai, ruas jalan, atau kegiatan)
    if (search && search !== '') {
      query += ` AND (
        u.nama LIKE ? OR 
        k.ruas_jalan LIKE ? OR 
        k.kegiatan LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY u.nama ASC, k.tanggal ASC';

    console.log('📝 SQL Query:', query);
    console.log('📝 Parameters:', params);

    const [kinerja] = await pool.execute(query, params);

    console.log(`✅ Found ${kinerja.length} kinerja records for period ${startDate} to ${endDate}`);

    // Convert file paths ke base64
    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100),
      // Tambahkan formatted fields
      panjang_kr_formatted: item.panjang_kr ? `${item.panjang_kr} meter` : '0 meter',
      panjang_kn_formatted: item.panjang_kn ? `${item.panjang_kn} meter` : '0 meter',
      total_panjang: (parseFloat(item.panjang_kr) || 0) + (parseFloat(item.panjang_kn) || 0)
    }));

    // Hitung total hari kerja dalam bulan
    let totalHariKerja = 0;
    const startDateObj = DateTime.fromISO(startDate);
    const endDateObj = DateTime.fromISO(endDate);
    let currentDateLoop = startDateObj;
    
    while (currentDateLoop <= endDateObj) {
      const dayOfWeek = currentDateLoop.weekday;
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        totalHariKerja++;
      }
      currentDateLoop = currentDateLoop.plus({ days: 1 });
    }

    // Dapatkan semua pegawai aktif
    let pegawaiQuery = `
      SELECT id, nama, jabatan, wilayah_penugasan
      FROM users 
      WHERE is_active = 1 AND roles = 'pegawai'
    `;
    
    let pegawaiParams = [];
    
    if (wilayah && wilayah !== '') {
      pegawaiQuery += ' AND wilayah_penugasan = ?';
      pegawaiParams.push(wilayah);
    }
    
    if (search && search !== '') {
      pegawaiQuery += ` AND (nama LIKE ? OR jabatan LIKE ?)`;
      const searchPattern = `%${search}%`;
      pegawaiParams.push(searchPattern, searchPattern);
    }
    
    pegawaiQuery += ' ORDER BY nama ASC';
    
    const [pegawaiList] = await pool.execute(pegawaiQuery, pegawaiParams);
    
    // Kelompokkan kinerja per pegawai
    const kinerjaPerPegawai = {};
    
    // Inisialisasi semua pegawai
    pegawaiList.forEach(pegawai => {
      kinerjaPerPegawai[pegawai.id] = {
        id: pegawai.id,
        nama: pegawai.nama,
        jabatan: pegawai.jabatan,
        wilayah: pegawai.wilayah_penugasan,
        total_hari_lapor: 0,
        total_kr: 0,
        total_kn: 0,
        rata_harian_kr: 0,
        rata_harian_kn: 0,
        persen_kehadiran: 0,
        target_kr_bulanan: totalHariKerja * 50, // Target 50 meter per hari
        target_kn_bulanan: totalHariKerja * 50, // Target 50 meter per hari
        laporan_harian: [],
        status: 'belum_lapor'
      };
    });
    
    // Isi data kinerja
    parsedKinerja.forEach(item => {
      if (kinerjaPerPegawai[item.user_id]) {
        const pegawai = kinerjaPerPegawai[item.user_id];
        pegawai.total_hari_lapor++;
        pegawai.total_kr += parseFloat(item.panjang_kr) || 0;
        pegawai.total_kn += parseFloat(item.panjang_kn) || 0;
        pegawai.laporan_harian.push({
          tanggal: item.tanggal,
          tanggal_formatted: item.tanggal_formatted,
          hari: item.hari,
          ruas_jalan: item.ruas_jalan,
          kegiatan: item.kegiatan,
          panjang_kr: item.panjang_kr,
          panjang_kn: item.panjang_kn,
          total_panjang: item.total_panjang
        });
      }
    });
    
    // Hitung statistik per pegawai
    let totalSudahLapor = 0;
    let totalKR = 0;
    let totalKN = 0;
    let totalPencapaianKR = 0;
    let totalPencapaianKN = 0;
    
    Object.values(kinerjaPerPegawai).forEach(pegawai => {
      if (pegawai.total_hari_lapor > 0) {
        totalSudahLapor++;
        pegawai.rata_harian_kr = pegawai.total_kr / pegawai.total_hari_lapor;
        pegawai.rata_harian_kn = pegawai.total_kn / pegawai.total_hari_lapor;
        pegawai.persen_kehadiran = (pegawai.total_hari_lapor / totalHariKerja) * 100;
        
        const pencapaianKR = (pegawai.total_kr / pegawai.target_kr_bulanan) * 100;
        const pencapaianKN = (pegawai.total_kn / pegawai.target_kn_bulanan) * 100;
        
        pegawai.pencapaian_kr = parseFloat(pencapaianKR.toFixed(1));
        pegawai.pencapaian_kn = parseFloat(pencapaianKN.toFixed(1));
        
        if (pegawai.pencapaian_kr >= 100 && pegawai.pencapaian_kn >= 100) {
          pegawai.status = 'tercapai_target';
        } else if (pegawai.pencapaian_kr >= 80 && pegawai.pencapaian_kn >= 80) {
          pegawai.status = 'hampir_tercapai';
        } else if (pegawai.pencapaian_kr >= 60 && pegawai.pencapaian_kn >= 60) {
          pegawai.status = 'sedang';
        } else {
          pegawai.status = 'tidak_tercapai';
        }
        
        totalKR += pegawai.total_kr;
        totalKN += pegawai.total_kn;
        totalPencapaianKR += pegawai.pencapaian_kr;
        totalPencapaianKN += pegawai.pencapaian_kn;
      } else {
        pegawai.pencapaian_kr = 0;
        pegawai.pencapaian_kn = 0;
        pegawai.persen_kehadiran = 0;
        pegawai.status = 'tidak_ada_laporan';
      }
    });
    
    // Hitung statistik keseluruhan
    const totalPegawai = pegawaiList.length;
    const rataKR = totalSudahLapor > 0 ? totalKR / totalSudahLapor : 0;
    const rataKN = totalSudahLapor > 0 ? totalKN / totalSudahLapor : 0;
    const rataPencapaianKR = totalSudahLapor > 0 ? totalPencapaianKR / totalSudahLapor : 0;
    const rataPencapaianKN = totalSudahLapor > 0 ? totalPencapaianKN / totalSudahLapor : 0;
    
    // Hitung status counts
    const statusCounts = {
      tercapai_target: Object.values(kinerjaPerPegawai).filter(p => p.status === 'tercapai_target').length,
      hampir_tercapai: Object.values(kinerjaPerPegawai).filter(p => p.status === 'hampir_tercapai').length,
      sedang: Object.values(kinerjaPerPegawai).filter(p => p.status === 'sedang').length,
      tidak_tercapai: Object.values(kinerjaPerPegawai).filter(p => p.status === 'tidak_tercapai').length,
      tidak_ada_laporan: Object.values(kinerjaPerPegawai).filter(p => p.status === 'tidak_ada_laporan').length
    };
    
    // Data untuk chart
    const chartData = {
      labels: Object.values(kinerjaPerPegawai).map(p => p.nama),
      datasets: [
        {
          label: 'Pencapaian KR (%)',
          data: Object.values(kinerjaPerPegawai).map(p => p.pencapaian_kr || 0),
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 1
        },
        {
          label: 'Pencapaian KN (%)',
          data: Object.values(kinerjaPerPegawai).map(p => p.pencapaian_kn || 0),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1
        }
      ]
    };
    
    res.json({
      success: true,
      data: {
        periode: {
          bulan: targetBulan,
          tahun: targetTahun,
          nama_bulan: DateTime.fromObject({ month: targetBulan }).setLocale('id').toFormat('MMMM'),
          start_date: startDate,
          end_date: endDate,
          total_hari_kerja: totalHariKerja
        },
        statistik: {
          total_pegawai: totalPegawai,
          total_sudah_lapor: totalSudahLapor,
          total_belum_lapor: totalPegawai - totalSudahLapor,
          total_kr: parseFloat(totalKR.toFixed(2)),
          total_kn: parseFloat(totalKN.toFixed(2)),
          rata_kr: parseFloat(rataKR.toFixed(2)),
          rata_kn: parseFloat(rataKN.toFixed(2)),
          rata_pencapaian_kr: parseFloat(rataPencapaianKR.toFixed(1)),
          rata_pencapaian_kn: parseFloat(rataPencapaianKN.toFixed(1)),
          persen_sudah_lapor: totalPegawai > 0 ? parseFloat(((totalSudahLapor / totalPegawai) * 100).toFixed(1)) : 0,
          status_counts: statusCounts
        },
        charts: chartData,
        pegawai_kinerja: Object.values(kinerjaPerPegawai),
        all_kinerja: parsedKinerja
      }
    });

  } catch (error) {
    console.error('❌ Get all kinerja per bulan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// src/controllers/kinerjaController.js

// Tambahkan fungsi helper getDayName di bagian atas file (setelah imports)
const getDayName = (dayOfWeek) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[dayOfWeek];
};

// ============ FUNGSI REKAP LAPORAN KERJA PER BULAN ============

/**
 * Get rekap laporan kerja per bulan untuk admin
 * Endpoint: GET /kinerja/admin/rekap-bulanan
 * Query params: bulan, tahun (optional, default ke bulan/tahun saat ini)
 */
const getRekapLaporanKerjaBulanan = async (req, res) => {
  try {
    const userRoles = req.user.roles || [];
    
    // Cek hak akses (hanya admin dan atasan)
    if (!userRoles.includes('admin') && !userRoles.includes('atasan')) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin dan atasan yang dapat mengakses rekap ini.'
      });
    }
    
    // Ambil parameter bulan dan tahun
    let { bulan, tahun } = req.query;
    
    // Default ke bulan dan tahun saat ini
    const currentDate = new Date();
    const targetBulan = bulan ? parseInt(bulan) : currentDate.getMonth() + 1;
    const targetTahun = tahun ? parseInt(tahun) : currentDate.getFullYear();
    
    // Validasi bulan
    if (targetBulan < 1 || targetBulan > 12) {
      return res.status(400).json({
        success: false,
        message: 'Bulan harus antara 1 dan 12'
      });
    }
    
    console.log(`📊 Generating rekap laporan kerja - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);
    
    // Hitung jumlah hari dalam bulan
    const daysInMonth = new Date(targetTahun, targetBulan, 0).getDate();
    
    // Dapatkan semua user aktif dengan role pegawai
    const [users] = await pool.execute(
      `SELECT id, nama, jabatan, wilayah_penugasan 
       FROM users 
       WHERE is_active = 1 AND roles = 'pegawai'
       ORDER BY nama ASC`
    );
    
    // Dapatkan semua laporan kerja dalam bulan tersebut
    const [laporanList] = await pool.execute(
      `SELECT user_id, tanggal, panjang_kr, panjang_kn, kegiatan, ruas_jalan
       FROM kinerja_harian 
       WHERE MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
      [targetBulan, targetTahun]
    );
    
    // Buat mapping laporan per user per tanggal
    const laporanMap = {};
    laporanList.forEach(laporan => {
      const userId = laporan.user_id;
      // Handle tanggal yang mungkin dalam format berbeda
      let tanggalStr;
      if (laporan.tanggal instanceof Date) {
        tanggalStr = laporan.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = new Date(laporan.tanggal).toISOString().split('T')[0];
      }
      
      if (!laporanMap[userId]) laporanMap[userId] = {};
      
      laporanMap[userId][tanggalStr] = {
        panjang_kr: parseFloat(laporan.panjang_kr) || 0,
        panjang_kn: parseFloat(laporan.panjang_kn) || 0,
        kegiatan: laporan.kegiatan,
        ruas_jalan: laporan.ruas_jalan
      };
    });
    
    // Buat array tanggal (1 - daysInMonth)
    const dates = [];
    let totalHariKerja = 0;
    
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(targetTahun, targetBulan - 1, i);
      const dayOfWeek = date.getDay(); // 0=Minggu, 6=Sabtu
      
      // Tentukan apakah hari libur (Sabtu/Minggu) atau hari kerja
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      if (!isWeekend) {
        totalHariKerja++;
      }
      
      dates.push({
        date: i,
        dayName: getDayName(dayOfWeek),
        isWeekend: isWeekend
      });
    }
    
    // Proses setiap user untuk membuat rekap
    const rekapData = [];
    let totalLaporan = 0;
    let totalHadir = 0;
    let totalKR = 0;
    let totalKN = 0;
    
    for (const user of users) {
      const dailyStatus = [];
      const dailyKR = [];
      const dailyKN = [];
      let userLaporanCount = 0;
      let userHadir = 0;
      let userKR = 0;
      let userKN = 0;
      
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(targetTahun, targetBulan - 1, i);
        const tanggalStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        
        let status = '';
        let panjangKR = 0;
        let panjangKN = 0;
        
        // Cek laporan
        if (laporanMap[user.id] && laporanMap[user.id][tanggalStr]) {
          const laporan = laporanMap[user.id][tanggalStr];
          status = '✔️';
          panjangKR = laporan.panjang_kr;
          panjangKN = laporan.panjang_kn;
          userLaporanCount++;
          userHadir++;
          userKR += panjangKR;
          userKN += panjangKN;
        } 
        // Weekend atau tidak ada laporan
        else {
          if (isWeekend) {
            status = ''; // Weekend kosong
          } else {
            status = '✘';
          }
        }
        
        dailyStatus.push(status);
        dailyKR.push(panjangKR);
        dailyKN.push(panjangKN);
      }
      
      // Hitung persentase kehadiran
      const persenKehadiran = totalHariKerja > 0 ? Math.round((userHadir / totalHariKerja) * 100) : 0;
      
      // Hitung rata-rata panjang per hari kerja
      const rataKR = userHadir > 0 ? userKR / userHadir : 0;
      const rataKN = userHadir > 0 ? userKN / userHadir : 0;
      
      // Tentukan status kehadiran
      let statusKehadiran = '';
      if (persenKehadiran >= 80) {
        statusKehadiran = 'Baik';
      } else if (persenKehadiran >= 60) {
        statusKehadiran = 'Cukup';
      } else {
        statusKehadiran = 'Kurang';
      }
      
      rekapData.push({
        no: rekapData.length + 1,
        id: user.id,
        nama: user.nama,
        jabatan: user.jabatan,
        wilayah: user.wilayah_penugasan,
        daily: dailyStatus,
        dailyKR: dailyKR,
        dailyKN: dailyKN,
        total_laporan: userLaporanCount,
        total_hadir: userHadir,
        total_kr: parseFloat(userKR.toFixed(2)),
        total_kn: parseFloat(userKN.toFixed(2)),
        total_panjang: parseFloat((userKR + userKN).toFixed(2)),
        rata_kr: parseFloat(rataKR.toFixed(2)),
        rata_kn: parseFloat(rataKN.toFixed(2)),
        persen_kehadiran: persenKehadiran,
        status_kehadiran: statusKehadiran
      });
      
      totalLaporan += userLaporanCount;
      totalHadir += userHadir;
      totalKR += userKR;
      totalKN += userKN;
    }
    
    // Hitung total keseluruhan
    const totalPegawai = users.length;
    const totalPotensiLaporan = totalHariKerja * totalPegawai;
    const persenLaporan = totalPotensiLaporan > 0 ? Math.round((totalLaporan / totalPotensiLaporan) * 100) : 0;
    const persenKehadiranKeseluruhan = totalPotensiLaporan > 0 ? Math.round((totalHadir / totalPotensiLaporan) * 100) : 0;
    
    // Nama bulan
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const bulanNama = monthNames[targetBulan - 1];
    
    res.json({
      success: true,
      data: {
        periode: {
          bulan: targetBulan,
          tahun: targetTahun,
          nama_bulan: bulanNama,
          total_hari: daysInMonth,
          total_hari_kerja: totalHariKerja
        },
        summary: {
          total_pegawai: totalPegawai,
          total_laporan: totalLaporan,
          total_hadir: totalHadir,
          total_kr: parseFloat(totalKR.toFixed(2)),
          total_kn: parseFloat(totalKN.toFixed(2)),
          total_panjang: parseFloat((totalKR + totalKN).toFixed(2)),
          persen_laporan: persenLaporan,
          persen_kehadiran: persenKehadiranKeseluruhan
        },
        dates: dates,
        rekap: rekapData
      }
    });
    
  } catch (error) {
    console.error('❌ Get rekap laporan kerja bulanan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Export rekap laporan kerja ke Excel/CSV
 */
const exportRekapLaporanExcel = async (req, res) => {
  try {
    const userRoles = req.user.roles || [];
    
    if (!userRoles.includes('admin') && !userRoles.includes('atasan')) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }
    
    let { bulan, tahun } = req.query;
    const currentDate = new Date();
    const targetBulan = bulan ? parseInt(bulan) : currentDate.getMonth() + 1;
    const targetTahun = tahun ? parseInt(tahun) : currentDate.getFullYear();
    
    // Dapatkan data rekap
    const [users] = await pool.execute(
      `SELECT id, nama, jabatan, wilayah_penugasan 
       FROM users 
       WHERE is_active = 1 AND roles = 'pegawai'
       ORDER BY nama ASC`
    );
    
    const [laporanList] = await pool.execute(
      `SELECT user_id, tanggal, panjang_kr, panjang_kn, kegiatan, ruas_jalan
       FROM kinerja_harian 
       WHERE MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
      [targetBulan, targetTahun]
    );
    
    const daysInMonth = new Date(targetTahun, targetBulan, 0).getDate();
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    // Buat map laporan
    const laporanMap = {};
    laporanList.forEach(l => {
      const userId = l.user_id;
      let tanggalStr;
      if (l.tanggal instanceof Date) {
        tanggalStr = l.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = new Date(l.tanggal).toISOString().split('T')[0];
      }
      
      if (!laporanMap[userId]) laporanMap[userId] = {};
      laporanMap[userId][tanggalStr] = {
        kr: parseFloat(l.panjang_kr) || 0,
        kn: parseFloat(l.panjang_kn) || 0
      };
    });
    
    // Hitung total hari kerja
    let totalHariKerja = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(targetTahun, targetBulan - 1, i);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        totalHariKerja++;
      }
    }
    
    // Generate CSV
    let csv = `No,Nama,Jabatan,Wilayah`;
    for (let i = 1; i <= daysInMonth; i++) {
      csv = `${csv},"${i}"`;
    }
    csv = `${csv},Total Laporan,Total KR (m),Total KN (m),Total Panjang (m),Rata KR (m),Rata KN (m),Persen Kehadiran,Status\n`;
    
    let no = 1;
    let totalSemuaLaporan = 0;
    let totalSemuaKR = 0;
    let totalSemuaKN = 0;
    
    for (const user of users) {
      let userLaporanCount = 0;
      let userKR = 0;
      let userKN = 0;
      
      csv = `${csv}${no},"${user.nama}","${user.jabatan || '-'}","${user.wilayah_penugasan || '-'}"`;
      
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(targetTahun, targetBulan - 1, i);
        const tanggalStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        
        let status = '';
        if (laporanMap[user.id] && laporanMap[user.id][tanggalStr]) {
          const laporan = laporanMap[user.id][tanggalStr];
          status = `KR:${laporan.kr}m KN:${laporan.kn}m`;
          userLaporanCount++;
          userKR += laporan.kr;
          userKN += laporan.kn;
        } else if (!isWeekend) {
          status = 'Tidak Lapor';
        } else {
          status = 'Libur';
        }
        
        csv = `${csv},"${status}"`;
      }
      
      const totalPanjang = userKR + userKN;
      const rataKR = userLaporanCount > 0 ? userKR / userLaporanCount : 0;
      const rataKN = userLaporanCount > 0 ? userKN / userLaporanCount : 0;
      const persenKehadiran = totalHariKerja > 0 ? (userLaporanCount / totalHariKerja) * 100 : 0;
      const statusKehadiran = persenKehadiran >= 80 ? 'Baik' : (persenKehadiran >= 60 ? 'Cukup' : 'Kurang');
      
      csv = `${csv},${userLaporanCount},${userKR.toFixed(2)},${userKN.toFixed(2)},${totalPanjang.toFixed(2)},${rataKR.toFixed(2)},${rataKN.toFixed(2)},${persenKehadiran.toFixed(1)}%,${statusKehadiran}\n`;
      
      totalSemuaLaporan += userLaporanCount;
      totalSemuaKR += userKR;
      totalSemuaKN += userKN;
      no++;
    }
    
    // Hitung total keseluruhan
    const totalPotensiLaporan = totalHariKerja * users.length;
    const persenLaporanKeseluruhan = totalPotensiLaporan > 0 ? (totalSemuaLaporan / totalPotensiLaporan) * 100 : 0;
    
    // Tambahkan baris total
    csv = `${csv}\n"TOTAL KESELURUHAN",,,,`;
    for (let i = 1; i <= daysInMonth; i++) {
      csv = `${csv},`;
    }
    csv = `${csv}${totalSemuaLaporan},${totalSemuaKR.toFixed(2)},${totalSemuaKN.toFixed(2)},${(totalSemuaKR + totalSemuaKN).toFixed(2)},,,${persenLaporanKeseluruhan.toFixed(1)}%,\n`;
    
    // Set response headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rekap_laporan_kerja_${monthNames[targetBulan-1]}_${targetTahun}.csv"`);
    
    // Add BOM for UTF-8
    const BOM = '\uFEFF';
    res.send(BOM + csv);
    
  } catch (error) {
    console.error('Export rekap laporan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * GET Dashboard Kinerja untuk Pegawai
 * Endpoint: GET /api/kinerja/pegawai/dashboard
 */
// ============ GET PEGAWAI DASHBOARD KINERJA (DENGAN TABEL PRESENSI) ============

// ============ GET PEGAWAI DASHBOARD KINERJA (FIX TIMEZONE) ============

// ============ GET PEGAWAI DASHBOARD KINERJA (FULL CODE FIX TIMEZONE) ============

const getPegawaiDashboardKinerja = async (req, res) => {
  try {
    const userId = req.user.id;
    let { bulan, tahun } = req.query;
    
    // Default ke bulan dan tahun saat ini
    const now = new Date();
    const targetBulan = bulan ? parseInt(bulan) : now.getMonth() + 1;
    const targetTahun = tahun ? parseInt(tahun) : now.getFullYear();
    
    // Validasi
    if (targetBulan < 1 || targetBulan > 12) {
      return res.status(400).json({
        success: false,
        message: 'Bulan harus antara 1 dan 12'
      });
    }
    
    console.log(`📊 Generating pegawai dashboard for user ${userId} - ${targetBulan}/${targetTahun}`);
    
    // Dapatkan data pegawai
    const [pegawai] = await pool.execute(
      `SELECT id, nama, jabatan, wilayah_penugasan 
       FROM users 
       WHERE id = ? AND is_active = 1`,
      [userId]
    );
    
    if (pegawai.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Data pegawai tidak ditemukan'
      });
    }
    
    const dataPegawai = pegawai[0];
    
    // Format tanggal untuk query (YYYY-MM-DD)
    const startDateStr = `${targetTahun}-${String(targetBulan).padStart(2, '0')}-01`;
    const lastDay = new Date(targetTahun, targetBulan, 0).getDate();
    const endDateStr = `${targetTahun}-${String(targetBulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    console.log(`Date range: ${startDateStr} to ${endDateStr}`);
    
    // ============ QUERY DATABASE ============
    
    // 1. Ambil laporan kinerja - gunakan DATE_FORMAT untuk konsistensi
    const [laporanList] = await pool.execute(`
      SELECT 
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        ruas_jalan,
        kegiatan,
        panjang_kr,
        panjang_kn
      FROM kinerja_harian
      WHERE user_id = ?
        AND tanggal >= ? 
        AND tanggal <= ?
      ORDER BY tanggal ASC
    `, [userId, startDateStr, endDateStr]);
    
    console.log(`Laporan found: ${laporanList.length}`);
    console.log('Laporan dates:', laporanList.map(l => l.tanggal));
    
    // 2. Ambil data presensi - gunakan DATE_FORMAT untuk konsistensi
    const [presensiList] = await pool.execute(`
      SELECT 
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        status_masuk,
        jam_masuk,
        jam_pulang,
        keterangan,
        izin_id
      FROM presensi
      WHERE user_id = ?
        AND tanggal >= ? 
        AND tanggal <= ?
      ORDER BY tanggal ASC
    `, [userId, startDateStr, endDateStr]);
    
    console.log(`Presensi found: ${presensiList.length}`);
    console.log('Presensi dates:', presensiList.map(p => p.tanggal));
    
    // Buat mapping laporan per tanggal
    const laporanMap = new Map();
    laporanList.forEach(l => {
      laporanMap.set(l.tanggal, l);
    });
    
    // Buat mapping presensi per tanggal
    const presensiMap = new Map();
    presensiList.forEach(p => {
      presensiMap.set(p.tanggal, p);
    });
    
    // Debug: cek tanggal 2026-04-23
    console.log('Presensi map has 2026-04-23:', presensiMap.has('2026-04-23'));
    if (presensiMap.has('2026-04-23')) {
      console.log('Presensi 2026-04-23:', presensiMap.get('2026-04-23'));
    }
    console.log('Laporan map has 2026-04-23:', laporanMap.has('2026-04-23'));
    
    // ============ HITUNG HARI KERJA ============
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNamesLong = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    
    let totalHariKerja = 0;
    let hariKerjaBerlalu = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const daftarTanggalKerja = [];
    
    for (let i = 1; i <= lastDay; i++) {
      const currentDate = new Date(targetTahun, targetBulan - 1, i);
      const dayOfWeek = currentDate.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      if (!isWeekend) {
        totalHariKerja++;
        const tanggalStr = `${targetTahun}-${String(targetBulan).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        daftarTanggalKerja.push({
          tanggal: tanggalStr,
          tglObj: currentDate,
          hariKe: totalHariKerja,
          dayName: dayNames[dayOfWeek]
        });
        
        if (currentDate <= today) {
          hariKerjaBerlalu++;
        }
      }
    }
    
    console.log(`Total hari kerja: ${totalHariKerja}, Berlalu: ${hariKerjaBerlalu}`);
    
    // ============ HITUNG STATISTIK KEHADIRAN ============
    let totalHadir = 0;
    let totalHadirTepatWaktu = 0;
    let totalTerlambat = 0;
    let totalIzin = 0;
    let totalSakit = 0;
    let totalCuti = 0;
    let totalHadirDariLaporan = 0;
    let totalTanpaKeterangan = 0;
    
    for (const tgl of daftarTanggalKerja) {
      const presensi = presensiMap.get(tgl.tanggal);
      const laporan = laporanMap.get(tgl.tanggal);
      
      if (presensi) {
        if (presensi.jam_masuk) {
          totalHadir++;
          if (presensi.status_masuk === 'Tepat Waktu') {
            totalHadirTepatWaktu++;
          } else if (presensi.status_masuk === 'Terlambat') {
            totalTerlambat++;
          }
        } else if (presensi.izin_id) {
          const ket = (presensi.keterangan || '').toLowerCase();
          if (ket.includes('sakit')) {
            totalSakit++;
          } else if (ket.includes('cuti')) {
            totalCuti++;
          } else {
            totalIzin++;
          }
        }
      } else if (laporan) {
        totalHadir++;
        totalHadirDariLaporan++;
      } else if (tgl.tglObj <= today) {
        totalTanpaKeterangan++;
      }
    }
    
    const totalKehadiran = totalHadir + totalIzin + totalSakit + totalCuti;
    const persenKehadiran = totalHariKerja > 0 ? (totalKehadiran / totalHariKerja) * 100 : 0;
    
    console.log(`Statistik kehadiran - Hadir: ${totalHadir}, Terlambat: ${totalTerlambat}, Izin: ${totalIzin}, Sakit: ${totalSakit}, Cuti: ${totalCuti}, Tanpa Keterangan: ${totalTanpaKeterangan}`);
    
    // Status kehadiran
    let statusKehadiran = "Perlu Perhatian";
    let warnaKehadiran = "red";
    if (persenKehadiran >= 90) {
      statusKehadiran = "Sangat Baik";
      warnaKehadiran = "green";
    } else if (persenKehadiran >= 75) {
      statusKehadiran = "Baik";
      warnaKehadiran = "blue";
    } else if (persenKehadiran >= 60) {
      statusKehadiran = "Cukup";
      warnaKehadiran = "yellow";
    }
    
    // Grafik kehadiran untuk pie chart
    const grafikKehadiran = [
      { name: "Hadir", value: totalHadir, color: "#10B981" },
      { name: "Terlambat", value: totalTerlambat, color: "#F59E0B" },
      { name: "Izin", value: totalIzin, color: "#3B82F6" },
      { name: "Sakit", value: totalSakit, color: "#8B5CF6" },
      { name: "Cuti", value: totalCuti, color: "#EC4899" },
      { name: "Tanpa Keterangan", value: totalTanpaKeterangan, color: "#EF4444" }
    ].filter(item => item.value > 0);
    
    // ============ HITUNG STATISTIK KINERJA ============
    const totalLaporan = laporanList.length;
    const totalKR = laporanList.reduce((sum, l) => sum + (parseFloat(l.panjang_kr) || 0), 0);
    const totalKN = laporanList.reduce((sum, l) => sum + (parseFloat(l.panjang_kn) || 0), 0);
    const totalPanjang = totalKR + totalKN;
    
    const targetHarian = 50;
    const targetKRBulanan = targetHarian * totalHariKerja;
    const targetKNBulanan = targetHarian * totalHariKerja;
    const targetTotalBulanan = targetKRBulanan + targetKNBulanan;
    
    const pencapaianKR = totalHariKerja > 0 ? (totalKR / targetKRBulanan) * 100 : 0;
    const pencapaianKN = totalHariKerja > 0 ? (totalKN / targetKNBulanan) * 100 : 0;
    const pencapaianTotal = totalHariKerja > 0 ? (totalPanjang / targetTotalBulanan) * 100 : 0;
    
    const rataHarianKR = totalLaporan > 0 ? totalKR / totalLaporan : 0;
    const rataHarianKN = totalLaporan > 0 ? totalKN / totalLaporan : 0;
    
    // Status kinerja
    let statusKinerja = "Perlu Ditingkatkan";
    let warnaKinerja = "orange";
    if (pencapaianTotal >= 100) {
      statusKinerja = "Excellent! 🎉";
      warnaKinerja = "green";
    } else if (pencapaianTotal >= 80) {
      statusKinerja = "Baik 👍";
      warnaKinerja = "blue";
    } else if (pencapaianTotal >= 60) {
      statusKinerja = "Cukup 📊";
      warnaKinerja = "yellow";
    }
    
    // ============ GRAFIK PERFORMA HARIAN ============
    const grafikPerformaHarian = [];
    
    for (const tgl of daftarTanggalKerja) {
      const laporan = laporanMap.get(tgl.tanggal);
      const presensi = presensiMap.get(tgl.tanggal);
      
      const kr = laporan ? parseFloat(laporan.panjang_kr) || 0 : 0;
      const kn = laporan ? parseFloat(laporan.panjang_kn) || 0 : 0;
      
      let statusKehadiranHari = 'Tidak Hadir';
      let statusWarna = 'red';
      
      if (presensi) {
        if (presensi.jam_masuk) {
          if (presensi.status_masuk === 'Terlambat') {
            statusKehadiranHari = 'Terlambat';
            statusWarna = 'yellow';
          } else {
            statusKehadiranHari = 'Hadir';
            statusWarna = 'green';
          }
        } else if (presensi.izin_id) {
          const ket = (presensi.keterangan || '').toLowerCase();
          if (ket.includes('sakit')) {
            statusKehadiranHari = 'Sakit';
            statusWarna = 'purple';
          } else if (ket.includes('cuti')) {
            statusKehadiranHari = 'Cuti';
            statusWarna = 'pink';
          } else {
            statusKehadiranHari = 'Izin';
            statusWarna = 'blue';
          }
        }
      } else if (laporan) {
        statusKehadiranHari = 'Hadir (Tidak Absen)';
        statusWarna = 'orange';
      }
      
      // Ambil tanggal dalam format "DD MMM"
      const dayNum = parseInt(tgl.tanggal.split('-')[2]);
      
      grafikPerformaHarian.push({
        hari_ke: tgl.hariKe,
        tanggal: `${dayNum} ${monthNamesShort[targetBulan - 1]}`,
        kr: kr,
        kn: kn,
        target: targetHarian,
        is_lapor: !!laporan,
        total: kr + kn,
        status_kehadiran: statusKehadiranHari,
        status_warna: statusWarna
      });
    }
    
    // ============ DETAIL KEHADIRAN HARIAN ============
    const detailKehadiranHarian = [];
    
    for (let i = 1; i <= lastDay; i++) {
      const currentDate = new Date(targetTahun, targetBulan - 1, i);
      const dayOfWeek = currentDate.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const tanggalStr = `${targetTahun}-${String(targetBulan).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      
      const presensi = presensiMap.get(tanggalStr);
      const laporan = laporanMap.get(tanggalStr);
      
      let status = '';
      let warna = '';
      let keterangan = '';
      
      if (isWeekend) {
        status = 'Libur';
        warna = 'gray';
        keterangan = 'Hari Libur Akhir Pekan';
      } else if (presensi) {
        if (presensi.jam_masuk) {
          if (presensi.status_masuk === 'Tepat Waktu') {
            status = 'Hadir Tepat Waktu';
            warna = 'green';
          } else if (presensi.status_masuk === 'Terlambat') {
            status = 'Terlambat';
            warna = 'yellow';
            keterangan = `Jam datang: ${presensi.jam_masuk}`;
          } else {
            status = 'Hadir';
            warna = 'green';
          }
        } else if (presensi.izin_id) {
          const ket = (presensi.keterangan || '').toLowerCase();
          if (ket.includes('sakit')) {
            status = 'Sakit';
            warna = 'purple';
          } else if (ket.includes('cuti')) {
            status = 'Cuti';
            warna = 'pink';
          } else {
            status = 'Izin';
            warna = 'blue';
          }
          keterangan = presensi.keterangan || '';
        }
      } else if (laporan) {
        status = 'Hadir (Laporan Kinerja)';
        warna = 'orange';
        keterangan = 'Hadir berdasarkan laporan kinerja';
      } else if (currentDate <= today) {
        status = 'Tanpa Keterangan';
        warna = 'red';
        keterangan = 'Tidak ada catatan kehadiran';
      } else {
        status = 'Belum Terjadi';
        warna = 'gray';
        keterangan = 'Hari yang akan datang';
      }
      
      detailKehadiranHarian.push({
        tanggal: tanggalStr,
        hari: dayNames[dayOfWeek],
        tanggal_formatted: `${i} ${monthNamesLong[targetBulan - 1]} ${targetTahun}`,
        status: status,
        warna: warna,
        keterangan: keterangan,
        is_weekend: isWeekend,
        is_future: currentDate > today
      });
    }
    
    // ============ DETAIL LAPORAN HARIAN ============
    const detailLaporanHarian = [...laporanList]
      .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
      .slice(0, 5)
      .map(laporan => {
        const tglParts = laporan.tanggal.split('-');
        const tglDate = new Date(parseInt(tglParts[0]), parseInt(tglParts[1]) - 1, parseInt(tglParts[2]));
        const total = (parseFloat(laporan.panjang_kr) || 0) + (parseFloat(laporan.panjang_kn) || 0);
        const pencapaianHarian = (targetHarian * 2) > 0 ? (total / (targetHarian * 2)) * 100 : 0;
        
        let statusHarian = "Tercapai";
        if (pencapaianHarian >= 100) statusHarian = "Tercapai";
        else if (pencapaianHarian >= 80) statusHarian = "Baik";
        else if (pencapaianHarian >= 60) statusHarian = "Cukup";
        else statusHarian = "Kurang";
        
        const presensiHari = presensiMap.get(laporan.tanggal);
        let statusHadir = 'Tidak Terdata';
        
        if (presensiHari) {
          if (presensiHari.jam_masuk) {
            statusHadir = presensiHari.status_masuk === 'Terlambat' ? 'Terlambat' : 'Hadir';
          } else if (presensiHari.izin_id) {
            const ket = (presensiHari.keterangan || '').toLowerCase();
            if (ket.includes('sakit')) statusHadir = 'Sakit';
            else if (ket.includes('cuti')) statusHadir = 'Cuti';
            else statusHadir = 'Izin';
          }
        } else {
          statusHadir = 'Hadir (Tidak Absen)';
        }
        
        return {
          tanggal: laporan.tanggal,
          hari: dayNames[tglDate.getDay()],
          ruas_jalan: laporan.ruas_jalan || '-',
          kegiatan: laporan.kegiatan || '-',
          panjang_kr: parseFloat(laporan.panjang_kr) || 0,
          panjang_kn: parseFloat(laporan.panjang_kn) || 0,
          total: total,
          status: statusHarian,
          status_kehadiran: statusHadir
        };
      });
    
    // ============ REKOMENDASI ============
    const rekomendasi = [];
    
    if (pencapaianKR < 60) {
      rekomendasi.push({
        icon: "📈",
        pesan: "Anda perlu meningkatkan volume pekerjaan KR",
        target: 60,
        current: Math.round(pencapaianKR)
      });
    }
    
    if (pencapaianTotal < 80) {
      rekomendasi.push({
        icon: "🎯",
        pesan: `Target harian Anda adalah ${targetHarian}m KR + ${targetHarian}m KN`,
        target: 100,
        current: Math.round(pencapaianTotal)
      });
    }
    
    if (persenKehadiran < 80) {
      rekomendasi.push({
        icon: "📅",
        pesan: "Tingkatkan konsistensi kehadiran Anda",
        target: 80,
        current: Math.round(persenKehadiran)
      });
    }
    
    if (totalTerlambat > 3) {
      rekomendasi.push({
        icon: "⏰",
        pesan: "Usahakan datang tepat waktu untuk menghindari keterlambatan",
        target: 0,
        current: totalTerlambat
      });
    }
    
    if (rekomendasi.length === 0) {
      rekomendasi.push({
        icon: "🏆",
        pesan: "Pertahankan prestasi Anda!",
        target: 100,
        current: Math.round(pencapaianTotal)
      });
    }
    
    // ============ RESPONSE ============
    return res.status(200).json({
      success: true,
      data: {
        profil_pegawai: {
          nama: dataPegawai.nama,
          jabatan: dataPegawai.jabatan || "Pegawai",
          wilayah: dataPegawai.wilayah_penugasan || "-"
        },
        periode_info: {
          nama_bulan: monthNamesLong[targetBulan - 1],
          tahun: targetTahun,
          total_hari_kerja: totalHariKerja,
          hari_kerja_berlalu: hariKerjaBerlalu
        },
        ringkasan_kinerja: {
          total_hari_lapor: totalLaporan,
          total_kr: Math.round(totalKR),
          total_kn: Math.round(totalKN),
          total_panjang: Math.round(totalPanjang),
          target_kr_bulanan: targetKRBulanan,
          target_kn_bulanan: targetKNBulanan,
          pencapaian_kr: Math.round(pencapaianKR * 10) / 10,
          pencapaian_kn: Math.round(pencapaianKN * 10) / 10,
          pencapaian_total: Math.round(pencapaianTotal * 10) / 10,
          rata_harian_kr: Math.round(rataHarianKR * 10) / 10,
          rata_harian_kn: Math.round(rataHarianKN * 10) / 10,
          status: statusKinerja,
          warna_status: warnaKinerja
        },
        ringkasan_kehadiran: {
          total_hadir: totalHadir,
          total_hadir_tepat_waktu: totalHadirTepatWaktu,
          total_terlambat: totalTerlambat,
          total_izin: totalIzin,
          total_sakit: totalSakit,
          total_cuti: totalCuti,
          total_tanpa_keterangan: totalTanpaKeterangan,
          persen_kehadiran: Math.round(persenKehadiran),
          status: statusKehadiran,
          warna_status: warnaKehadiran
        },
        grafik_performa_harian: grafikPerformaHarian,
        grafik_kehadiran: grafikKehadiran,
        target_vs_realisasi: {
          kr: { 
            realisasi: Math.round(totalKR), 
            target: targetKRBulanan, 
            persen: Math.round(pencapaianKR) 
          },
          kn: { 
            realisasi: Math.round(totalKN), 
            target: targetKNBulanan, 
            persen: Math.round(pencapaianKN) 
          },
          total: { 
            realisasi: Math.round(totalPanjang), 
            target: targetTotalBulanan, 
            persen: Math.round(pencapaianTotal) 
          }
        },
        detail_laporan_harian: detailLaporanHarian,
        detail_kehadiran_harian: detailKehadiranHarian,
        rekomendasi: rekomendasi
      }
    });
    
  } catch (error) {
    console.error('❌ Pegawai dashboard error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};



// Update module.exports untuk menyertakan fungsi baru
module.exports = {
  createKinerja,
  createKinerjaWithCamera,
  getKinerjaUser,
  getKinerjaUserPerBulan,
  getKinerjaPerTanggal,
  getAllKinerjaPerBulan,
  getRekapLaporanKerjaBulanan, // TAMBAHKAN INI
  exportRekapLaporanExcel, // TAMBAHKAN INI
  getKinerjaById,
  updateKinerja,
  deleteKinerja,
  getAllKinerja,
  getKinerjaStatistik,
  generatePDF,
  getPegawaiDashboardKinerja,
  generateRekapWilayah,
  downloadAllWilayah
};