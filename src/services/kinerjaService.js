const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');
const { 
  generateKinerjaPDF, 
  generateRekapWilayahPDF,
  generateWilayahAllPDFs 
} = require('../utils/pdfGenerator');
const KinerjaModel = require('../models/KinerjaModel');

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

const getDayName = (dayOfWeek) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[dayOfWeek];
};

const KinerjaService = {
  // CREATE KINERJA
  createKinerja: async (userId, body) => {
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
    } = body;

    if (!tanggal || !ruas_jalan || !kegiatan) {
      throw new Error('Tanggal, ruas jalan, dan kegiatan wajib diisi');
    }

    const finalPanjangKr = panjang_kr !== undefined && panjang_kr !== null ? panjang_kr : 0;
    const finalPanjangKn = panjang_kn !== undefined && panjang_kn !== null ? panjang_kn : 0;

    const { query: checkQuery, params: checkParams } = KinerjaModel.checkExistingQuery(userId, tanggal);
    const [existing] = await pool.execute(checkQuery, checkParams);

    if (existing.length > 0) {
      throw new Error('Data kinerja untuk tanggal ini sudah ada');
    }

    const sketImagePath = saveBase64Image(sket_image, 'sket');
    const foto0Path = saveBase64Image(foto_0, 'foto');
    const foto50Path = saveBase64Image(foto_50, 'foto');
    const foto100Path = saveBase64Image(foto_100, 'foto');

    const { query: insertQuery, params: insertParams } = KinerjaModel.createKinerjaQuery({
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
    });

    const [result] = await pool.execute(insertQuery, insertParams);

    const { query: logQuery, params: logParams } = KinerjaModel.insertLogQuery(
      'KINERJA_CREATE',
      `User membuat laporan kinerja harian - Ruas: ${ruas_jalan}`,
      userId
    );
    await pool.execute(logQuery, logParams);

    return { id: result.insertId };
  },

  // CREATE KINERJA WITH CAMERA
  createKinerjaWithCamera: async (userId, body) => {
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
    } = body;

    if (!tanggal || !ruas_jalan || !kegiatan) {
      throw new Error('Tanggal, ruas jalan, dan kegiatan wajib diisi');
    }

    if (!foto_0 && !foto_50 && !foto_100) {
      throw new Error('Minimal satu foto dokumentasi wajib diambil');
    }

    const finalPanjangKr = panjang_kr !== undefined && panjang_kr !== null ? parseFloat(panjang_kr) : 0;
    const finalPanjangKn = panjang_kn !== undefined && panjang_kn !== null ? parseFloat(panjang_kn) : 0;

    const { query: checkQuery, params: checkParams } = KinerjaModel.checkExistingQuery(userId, tanggal);
    const [existing] = await pool.execute(checkQuery, checkParams);

    if (existing.length > 0) {
      throw new Error('Data kinerja untuk tanggal ini sudah ada');
    }

    const sketImagePath = sket_image ? saveBase64Image(sket_image, 'sket') : null;
    const foto0Path = foto_0 ? saveBase64Image(foto_0, 'foto') : null;
    const foto50Path = foto_50 ? saveBase64Image(foto_50, 'foto') : null;
    const foto100Path = foto_100 ? saveBase64Image(foto_100, 'foto') : null;

    const { query: insertQuery, params: insertParams } = KinerjaModel.createKinerjaQuery({
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
    });

    const [result] = await pool.execute(insertQuery, insertParams);

    const { query: logQuery, params: logParams } = KinerjaModel.insertLogQuery(
      'KINERJA_CREATE_CAMERA',
      `User membuat laporan kinerja harian via kamera - Ruas: ${ruas_jalan}`,
      userId
    );
    await pool.execute(logQuery, logParams);

    return { id: result.insertId };
  },

  // GET KINERJA USER
  getKinerjaUser: async (userId, bulan, tahun) => {
    const { query, params } = KinerjaModel.getKinerjaUserQuery(userId, bulan, tahun);
    const [kinerja] = await pool.execute(query, params);

    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100)
    }));

    return parsedKinerja;
  },

  // GET KINERJA BY ID
  getKinerjaById: async (id) => {
    const { query, params } = KinerjaModel.getKinerjaByIdQuery(id);
    const [kinerja] = await pool.execute(query, params);

    if (kinerja.length === 0) {
      throw new Error('Data kinerja tidak ditemukan');
    }

    const data = {
      ...kinerja[0],
      sket_image: getBase64FromFile(kinerja[0].sket_image),
      foto_0: getBase64FromFile(kinerja[0].foto_0),
      foto_50: getBase64FromFile(kinerja[0].foto_50),
      foto_100: getBase64FromFile(kinerja[0].foto_100)
    };

    return data;
  },

  // UPDATE KINERJA
  updateKinerja: async (id, userId, userRole, body) => {
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
    } = body;

    const { query: existingQuery, params: existingParams } = KinerjaModel.getExistingKinerjaQuery(id);
    const [existing] = await pool.execute(existingQuery, existingParams);

    if (existing.length === 0) {
      throw new Error('Data kinerja tidak ditemukan');
    }

    if (existing[0].user_id !== userId && userRole !== 'admin') {
      throw new Error('Anda tidak memiliki akses untuk mengubah data ini');
    }

    const oldData = existing[0];

    const finalTanggal = tanggal || oldData.tanggal;
    const finalRuasJalan = ruas_jalan || oldData.ruas_jalan;
    const finalKegiatan = kegiatan || oldData.kegiatan;
    
    const finalPanjangKr = panjang_kr !== undefined && panjang_kr !== null 
      ? parseFloat(panjang_kr) 
      : oldData.panjang_kr;
    const finalPanjangKn = panjang_kn !== undefined && panjang_kn !== null 
      ? parseFloat(panjang_kn) 
      : oldData.panjang_kn;

    if (!finalTanggal || !finalRuasJalan || !finalKegiatan) {
      throw new Error('Tanggal, ruas jalan, dan kegiatan wajib diisi');
    }

    let sketImagePath = oldData.sket_image;
    let foto0Path = oldData.foto_0;
    let foto50Path = oldData.foto_50;
    let foto100Path = oldData.foto_100;

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

    const { query: updateQuery, params: updateParams } = KinerjaModel.updateKinerjaQuery({
      id,
      finalTanggal,
      finalRuasJalan,
      finalKegiatan,
      finalPanjangKr,
      finalPanjangKn,
      sketImagePath,
      foto0Path,
      foto50Path,
      foto100Path
    });

    await pool.execute(updateQuery, updateParams);

    const { query: logQuery, params: logParams } = KinerjaModel.insertLogQuery(
      'KINERJA_UPDATE',
      `User mengupdate laporan kinerja harian - ID: ${id}`,
      userId
    );
    await pool.execute(logQuery, logParams);

    return true;
  },

  // DELETE KINERJA
  deleteKinerja: async (id, userId, userRole) => {
    const { query: existingQuery, params: existingParams } = KinerjaModel.getKinerjaForDeleteQuery(id);
    const [existing] = await pool.execute(existingQuery, existingParams);

    if (existing.length === 0) {
      throw new Error('Data kinerja tidak ditemukan');
    }

    if (existing[0].user_id !== userId && userRole !== 'admin') {
      throw new Error('Anda tidak memiliki akses untuk menghapus data ini');
    }

    const fileFields = ['sket_image', 'foto_0', 'foto_50', 'foto_100'];
    fileFields.forEach(field => {
      if (existing[0][field]) {
        deleteFile(existing[0][field]);
      }
    });

    const { query: deleteQuery, params: deleteParams } = KinerjaModel.deleteKinerjaQuery(id);
    await pool.execute(deleteQuery, deleteParams);

    const { query: logQuery, params: logParams } = KinerjaModel.insertLogQuery(
      'KINERJA_DELETE',
      `User menghapus laporan kinerja harian - ID: ${id}`,
      userId
    );
    await pool.execute(logQuery, logParams);

    return true;
  },

  // GET ALL KINERJA
  getAllKinerja: async (start_date, end_date, wilayah, user_id) => {
    const { query, params } = KinerjaModel.getAllKinerjaQuery(start_date, end_date, wilayah, user_id);
    const [kinerja] = await pool.execute(query, params);

    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100)
    }));

    return parsedKinerja;
  },

  // GET KINERJA STATISTIK
  getKinerjaStatistik: async (bulan, tahun, wilayah) => {
    const targetBulan = bulan || new Date().getMonth() + 1;
    const targetTahun = tahun || new Date().getFullYear();

    const { query, params } = KinerjaModel.getKinerjaStatistikQuery(targetBulan, targetTahun, wilayah);
    const [statistik] = await pool.execute(query, params);

    return statistik;
  },

  // GENERATE PDF
  generatePDF: async (id, userId) => {
    const { query, params } = KinerjaModel.getKinerjaByIdQuery(id);
    const [kinerja] = await pool.execute(query, params);

    if (kinerja.length === 0) {
      throw new Error('Data kinerja tidak ditemukan');
    }

    const kinerjaData = kinerja[0];
    const pdfBuffer = await generateKinerjaPDF(kinerjaData);

    const { query: logQuery, params: logParams } = KinerjaModel.insertLogQuery(
      'PDF_GENERATE',
      `Generate PDF laporan kinerja - ID: ${id}`,
      userId
    );
    await pool.execute(logQuery, logParams);

    return { pdfBuffer, kinerjaData };
  },

  // GENERATE REKAP WILAYAH
  generateRekapWilayah: async (wilayah, start_date, end_date, userId) => {
    if (!wilayah) {
      throw new Error('Wilayah harus diisi');
    }

    const { query: statQuery, params: statParams } = KinerjaModel.getRekapWilayahStatistikQuery(wilayah, start_date, end_date);
    const [statistik] = await pool.execute(statQuery, statParams);

    if (statistik.length === 0) {
      throw new Error('Tidak ada data untuk wilayah ini');
    }

    const { query: laporanQuery, params: laporanParams } = KinerjaModel.getLaporanListForWilayahQuery(wilayah, start_date, end_date);
    const [laporanList] = await pool.execute(laporanQuery, laporanParams);

    const wilayahData = statistik[0];
    const periode = start_date && end_date 
      ? `${start_date} s/d ${end_date}`
      : 'Semua Periode';

    const pdfBuffer = await generateRekapWilayahPDF(wilayahData, periode, laporanList);

    const { query: logQuery, params: logParams } = KinerjaModel.insertLogQuery(
      'PDF_GENERATE_REKAP',
      `Generate rekap PDF wilayah ${wilayah}`,
      userId
    );
    await pool.execute(logQuery, logParams);

    return { pdfBuffer, wilayah };
  },

  // DOWNLOAD ALL WILAYAH
  downloadAllWilayah: async (wilayah, start_date, end_date, userId) => {
    if (!wilayah) {
      throw new Error('Wilayah harus diisi');
    }

    const { query: laporanQuery, params: laporanParams } = KinerjaModel.getLaporanListForDownloadQuery(wilayah, start_date, end_date);
    const [laporanList] = await pool.execute(laporanQuery, laporanParams);

    if (laporanList.length === 0) {
      throw new Error('Tidak ada data untuk wilayah ini');
    }

    const totalPegawai = new Set(laporanList.map(item => item.user_id)).size;
    
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

    const zipBuffer = await generateWilayahAllPDFs(wilayahData, periode, laporanList);

    const { query: logQuery, params: logParams } = KinerjaModel.insertLogQuery(
      'DOWNLOAD_ALL_WILAYAH',
      `Download semua laporan wilayah ${wilayah} (${laporanList.length} files)`,
      userId
    );
    await pool.execute(logQuery, logParams);

    return { zipBuffer, wilayah };
  },

  // GET KINERJA USER PER BULAN
  getKinerjaUserPerBulan: async (userId, bulan, tahun) => {
    const currentDate = DateTime.now().setZone('Asia/Jakarta');
    
    let targetBulan;
    if (bulan && bulan !== '' && !isNaN(parseInt(bulan))) {
      targetBulan = parseInt(bulan);
    } else {
      targetBulan = currentDate.month;
    }
    
    let targetTahun;
    if (tahun && tahun !== '' && !isNaN(parseInt(tahun))) {
      targetTahun = parseInt(tahun);
    } else {
      targetTahun = currentDate.year;
    }
    
    if (targetBulan < 1 || targetBulan > 12) {
      throw new Error('Bulan harus antara 1 dan 12');
    }
    
    if (targetTahun < 2000 || targetTahun > 2100) {
      throw new Error('Tahun tidak valid');
    }
    
    console.log(`📊 Getting kinerja for user ${userId} - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);
    
    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();
    
    const { query, params } = KinerjaModel.getKinerjaUserPerBulanQuery(userId, startDate, endDate);
    const [kinerja] = await pool.execute(query, params);
    
    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100)
    }));
    
    const totalLaporan = parsedKinerja.length;
    const totalPanjang = parsedKinerja.reduce((sum, item) => {
      const kr = parseFloat(item.panjang_kr) || 0;
      const kn = parseFloat(item.panjang_kn) || 0;
      return sum + kr + kn;
    }, 0);
    const avgPanjang = totalLaporan > 0 ? totalPanjang / totalLaporan : 0;
    
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
    
    return {
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
    };
  },

  // GET KINERJA PER TANGGAL (ADMIN)
  getKinerjaPerTanggal: async (userRoles, tanggal, wilayah, search) => {
    if (userRoles !== 'admin' && userRoles !== 'atasan') {
      throw new Error('Akses ditolak. Hanya admin dan atasan yang dapat mengakses.');
    }

    if (!tanggal) {
      throw new Error('Parameter tanggal wajib diisi dengan format YYYY-MM-DD');
    }

    const targetDate = DateTime.fromISO(tanggal);
    if (!targetDate.isValid) {
      throw new Error('Format tanggal tidak valid. Gunakan format: YYYY-MM-DD');
    }

    console.log(`📊 Getting kinerja for date: ${tanggal}`);
    console.log(`Filters - Wilayah: ${wilayah || 'semua'}, Search: ${search || 'tidak ada'}`);

    const { query, params } = KinerjaModel.getKinerjaPerTanggalQuery(tanggal, wilayah, search);
    console.log('📝 SQL Query:', query);
    console.log('📝 Parameters:', params);

    const [kinerja] = await pool.execute(query, params);
    console.log(`✅ Found ${kinerja.length} kinerja records for date ${tanggal}`);

    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100),
      panjang_kr_formatted: item.panjang_kr ? `${item.panjang_kr} meter` : '0 meter',
      panjang_kn_formatted: item.panjang_kn ? `${item.panjang_kn} meter` : '0 meter',
      total_panjang: (parseFloat(item.panjang_kr) || 0) + (parseFloat(item.panjang_kn) || 0)
    }));

    const totalLaporan = parsedKinerja.length;
    const uniquePegawai = [...new Set(parsedKinerja.map(item => item.user_id))].length;
    const totalPanjangKR = parsedKinerja.reduce((sum, item) => sum + (parseFloat(item.panjang_kr) || 0), 0);
    const totalPanjangKN = parsedKinerja.reduce((sum, item) => sum + (parseFloat(item.panjang_kn) || 0), 0);
    const avgPanjangKR = totalLaporan > 0 ? totalPanjangKR / totalLaporan : 0;
    const avgPanjangKN = totalLaporan > 0 ? totalPanjangKN / totalLaporan : 0;

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

    Object.keys(wilayahStatistik).forEach(wilayahName => {
      wilayahStatistik[wilayahName].total_pegawai = wilayahStatistik[wilayahName].pegawai.size;
      delete wilayahStatistik[wilayahName].pegawai;
    });

    const chartData = {
      labels: ['Panjang KR', 'Panjang KN'],
      datasets: [{
        data: [totalPanjangKR, totalPanjangKN],
        backgroundColor: ['#10B981', '#3B82F6'],
        borderColor: ['#0DA675', '#2563EB'],
        borderWidth: 1
      }]
    };

    return {
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
    };
  },

  // GET ALL KINERJA PER BULAN (ADMIN)
  getAllKinerjaPerBulan: async (userRoles, bulan, tahun, wilayah, search) => {
    if (userRoles !== 'admin' && userRoles !== 'atasan') {
      throw new Error('Akses ditolak. Hanya admin dan atasan yang dapat mengakses.');
    }

    if (!bulan || !tahun) {
      throw new Error('Parameter bulan dan tahun wajib diisi');
    }

    const targetBulan = parseInt(bulan);
    const targetTahun = parseInt(tahun);

    if (targetBulan < 1 || targetBulan > 12) {
      throw new Error('Bulan harus antara 1 dan 12');
    }

    if (targetTahun < 2000 || targetTahun > 2100) {
      throw new Error('Tahun tidak valid');
    }

    console.log(`📊 Getting all kinerja for admin - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);
    console.log(`Filters - Wilayah: ${wilayah || 'semua'}, Search: ${search || 'tidak ada'}`);

    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();

    const { query, params } = KinerjaModel.getAllKinerjaPerBulanQuery(startDate, endDate, wilayah, search);
    console.log('📝 SQL Query:', query);
    console.log('📝 Parameters:', params);

    const [kinerja] = await pool.execute(query, params);
    console.log(`✅ Found ${kinerja.length} kinerja records for period ${startDate} to ${endDate}`);

    const parsedKinerja = kinerja.map((item) => ({
      ...item,
      sket_image: getBase64FromFile(item.sket_image),
      foto_0: getBase64FromFile(item.foto_0),
      foto_50: getBase64FromFile(item.foto_50),
      foto_100: getBase64FromFile(item.foto_100),
      panjang_kr_formatted: item.panjang_kr ? `${item.panjang_kr} meter` : '0 meter',
      panjang_kn_formatted: item.panjang_kn ? `${item.panjang_kn} meter` : '0 meter',
      total_panjang: (parseFloat(item.panjang_kr) || 0) + (parseFloat(item.panjang_kn) || 0)
    }));

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

    const { query: pegawaiQuery, params: pegawaiParams } = KinerjaModel.getAllActivePegawaiQuery(wilayah, search);
    const [pegawaiList] = await pool.execute(pegawaiQuery, pegawaiParams);
    
    const kinerjaPerPegawai = {};
    
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
        target_kr_bulanan: totalHariKerja * 50,
        target_kn_bulanan: totalHariKerja * 50,
        laporan_harian: [],
        status: 'belum_lapor'
      };
    });
    
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
    
    const totalPegawai = pegawaiList.length;
    const rataKR = totalSudahLapor > 0 ? totalKR / totalSudahLapor : 0;
    const rataKN = totalSudahLapor > 0 ? totalKN / totalSudahLapor : 0;
    const rataPencapaianKR = totalSudahLapor > 0 ? totalPencapaianKR / totalSudahLapor : 0;
    const rataPencapaianKN = totalSudahLapor > 0 ? totalPencapaianKN / totalSudahLapor : 0;
    
    const statusCounts = {
      tercapai_target: Object.values(kinerjaPerPegawai).filter(p => p.status === 'tercapai_target').length,
      hampir_tercapai: Object.values(kinerjaPerPegawai).filter(p => p.status === 'hampir_tercapai').length,
      sedang: Object.values(kinerjaPerPegawai).filter(p => p.status === 'sedang').length,
      tidak_tercapai: Object.values(kinerjaPerPegawai).filter(p => p.status === 'tidak_tercapai').length,
      tidak_ada_laporan: Object.values(kinerjaPerPegawai).filter(p => p.status === 'tidak_ada_laporan').length
    };
    
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
    
    return {
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
    };
  },

  // GET REKAP LAPORAN KERJA BULANAN
  getRekapLaporanKerjaBulanan: async (userRoles, bulan, tahun) => {
    if (!userRoles.includes('admin') && !userRoles.includes('atasan')) {
      throw new Error('Akses ditolak. Hanya admin dan atasan yang dapat mengakses rekap ini.');
    }
    
    const currentDate = new Date();
    const targetBulan = bulan ? parseInt(bulan) : currentDate.getMonth() + 1;
    const targetTahun = tahun ? parseInt(tahun) : currentDate.getFullYear();
    
    if (targetBulan < 1 || targetBulan > 12) {
      throw new Error('Bulan harus antara 1 dan 12');
    }
    
    console.log(`📊 Generating rekap laporan kerja - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);
    
    const daysInMonth = new Date(targetTahun, targetBulan, 0).getDate();
    
    const { query: usersQuery, params: usersParams } = KinerjaModel.getAllUsersForRekapQuery();
    const [users] = await pool.execute(usersQuery, usersParams);
    
    const { query: laporanQuery, params: laporanParams } = KinerjaModel.getRekapLaporanKerjaBulananQuery(targetBulan, targetTahun);
    const [laporanList] = await pool.execute(laporanQuery, laporanParams);
    
    const laporanMap = {};
    laporanList.forEach(laporan => {
      const userId = laporan.user_id;
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
    
    const dates = [];
    let totalHariKerja = 0;
    
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(targetTahun, targetBulan - 1, i);
      const dayOfWeek = date.getDay();
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
        
        if (laporanMap[user.id] && laporanMap[user.id][tanggalStr]) {
          const laporan = laporanMap[user.id][tanggalStr];
          status = '✔️';
          panjangKR = laporan.panjang_kr;
          panjangKN = laporan.panjang_kn;
          userLaporanCount++;
          userHadir++;
          userKR += panjangKR;
          userKN += panjangKN;
        } else {
          if (isWeekend) {
            status = '';
          } else {
            status = '✘';
          }
        }
        
        dailyStatus.push(status);
        dailyKR.push(panjangKR);
        dailyKN.push(panjangKN);
      }
      
      const persenKehadiran = totalHariKerja > 0 ? Math.round((userHadir / totalHariKerja) * 100) : 0;
      const rataKR = userHadir > 0 ? userKR / userHadir : 0;
      const rataKN = userHadir > 0 ? userKN / userHadir : 0;
      
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
    
    const totalPegawai = users.length;
    const totalPotensiLaporan = totalHariKerja * totalPegawai;
    const persenLaporan = totalPotensiLaporan > 0 ? Math.round((totalLaporan / totalPotensiLaporan) * 100) : 0;
    const persenKehadiranKeseluruhan = totalPotensiLaporan > 0 ? Math.round((totalHadir / totalPotensiLaporan) * 100) : 0;
    
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const bulanNama = monthNames[targetBulan - 1];
    
    return {
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
    };
  },

  // EXPORT REKAP LAPORAN EXCEL
  exportRekapLaporanExcel: async (userRoles, bulan, tahun) => {
    if (!userRoles.includes('admin') && !userRoles.includes('atasan')) {
      throw new Error('Akses ditolak');
    }
    
    const currentDate = new Date();
    const targetBulan = bulan ? parseInt(bulan) : currentDate.getMonth() + 1;
    const targetTahun = tahun ? parseInt(tahun) : currentDate.getFullYear();
    
    const { query: usersQuery, params: usersParams } = KinerjaModel.getAllUsersForRekapQuery();
    const [users] = await pool.execute(usersQuery, usersParams);
    
    const { query: laporanQuery, params: laporanParams } = KinerjaModel.getLaporanListForExportQuery(targetBulan, targetTahun);
    const [laporanList] = await pool.execute(laporanQuery, laporanParams);
    
    const daysInMonth = new Date(targetTahun, targetBulan, 0).getDate();
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
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
    
    let totalHariKerja = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(targetTahun, targetBulan - 1, i);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        totalHariKerja++;
      }
    }
    
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
    
    const totalPotensiLaporan = totalHariKerja * users.length;
    const persenLaporanKeseluruhan = totalPotensiLaporan > 0 ? (totalSemuaLaporan / totalPotensiLaporan) * 100 : 0;
    
    csv = `${csv}\n"TOTAL KESELURUHAN",,,,`;
    for (let i = 1; i <= daysInMonth; i++) {
      csv = `${csv},`;
    }
    csv = `${csv}${totalSemuaLaporan},${totalSemuaKR.toFixed(2)},${totalSemuaKN.toFixed(2)},${(totalSemuaKR + totalSemuaKN).toFixed(2)},,,${persenLaporanKeseluruhan.toFixed(1)}%,\n`;
    
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csv;
    
    return {
      csvData: csvWithBOM,
      bulanNama: monthNames[targetBulan - 1],
      tahun: targetTahun
    };
  },

  // GET PEGAWAI DASHBOARD KINERJA
  getPegawaiDashboardKinerja: async (userId, bulan, tahun) => {
    const now = new Date();
    const targetBulan = bulan ? parseInt(bulan) : now.getMonth() + 1;
    const targetTahun = tahun ? parseInt(tahun) : now.getFullYear();
    
    if (targetBulan < 1 || targetBulan > 12) {
      throw new Error('Bulan harus antara 1 dan 12');
    }
    
    console.log(`📊 Generating pegawai dashboard for user ${userId} - ${targetBulan}/${targetTahun}`);
    
    const { query: pegawaiQuery, params: pegawaiParams } = KinerjaModel.getPegawaiDataQuery(userId);
    const [pegawai] = await pool.execute(pegawaiQuery, pegawaiParams);
    
    if (pegawai.length === 0) {
      throw new Error('Data pegawai tidak ditemukan');
    }
    
    const dataPegawai = pegawai[0];
    
    const startDateStr = `${targetTahun}-${String(targetBulan).padStart(2, '0')}-01`;
    const lastDay = new Date(targetTahun, targetBulan, 0).getDate();
    const endDateStr = `${targetTahun}-${String(targetBulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    console.log(`Date range: ${startDateStr} to ${endDateStr}`);
    
    const { query: laporanQuery, params: laporanParams } = KinerjaModel.getLaporanListForDashboardQuery(userId, startDateStr, endDateStr);
    const [laporanList] = await pool.execute(laporanQuery, laporanParams);
    
    console.log(`Laporan found: ${laporanList.length}`);
    console.log('Laporan dates:', laporanList.map(l => l.tanggal));
    
    const { query: presensiQuery, params: presensiParams } = KinerjaModel.getPresensiListForDashboardQuery(userId, startDateStr, endDateStr);
    const [presensiList] = await pool.execute(presensiQuery, presensiParams);
    
    console.log(`Presensi found: ${presensiList.length}`);
    console.log('Presensi dates:', presensiList.map(p => p.tanggal));
    
    const laporanMap = new Map();
    laporanList.forEach(l => {
      laporanMap.set(l.tanggal, l);
    });
    
    const presensiMap = new Map();
    presensiList.forEach(p => {
      presensiMap.set(p.tanggal, p);
    });
    
    console.log('Presensi map has 2026-04-23:', presensiMap.has('2026-04-23'));
    if (presensiMap.has('2026-04-23')) {
      console.log('Presensi 2026-04-23:', presensiMap.get('2026-04-23'));
    }
    console.log('Laporan map has 2026-04-23:', laporanMap.has('2026-04-23'));
    
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
    
    const grafikKehadiran = [
      { name: "Hadir", value: totalHadir, color: "#10B981" },
      { name: "Terlambat", value: totalTerlambat, color: "#F59E0B" },
      { name: "Izin", value: totalIzin, color: "#3B82F6" },
      { name: "Sakit", value: totalSakit, color: "#8B5CF6" },
      { name: "Cuti", value: totalCuti, color: "#EC4899" },
      { name: "Tanpa Keterangan", value: totalTanpaKeterangan, color: "#EF4444" }
    ].filter(item => item.value > 0);
    
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
    
    return {
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
    };
  }
};

module.exports = KinerjaService;