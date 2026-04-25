const { pool } = require('../config/database');
const { DateTime } = require('luxon');
const axios = require('axios');

// ============ HELPER FUNCTIONS ============

const extractCoordinatesFromMapsLink = async (mapsLink) => {
    try {
        console.log('📍 Original URL:', mapsLink);
        
        let finalUrl = mapsLink;
        
        // STEP 1: Handle Google Maps shortlink
        if (mapsLink.includes('maps.app.goo.gl')) {
            try {
                const response = await axios.get(mapsLink, { 
                    maxRedirects: 5, 
                    validateStatus: false,
                    timeout: 10000,
                    // Important: Follow redirects manually if needed
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                // Try different ways to get final URL
                if (response.request && response.request.res && response.request.res.responseUrl) {
                    finalUrl = response.request.res.responseUrl;
                } else if (response.request && response.request.path) {
                    finalUrl = response.request.path;
                } else if (response.config && response.config.url) {
                    finalUrl = response.config.url;
                }
                
                console.log('🔄 Redirected URL:', finalUrl);
            } catch (redirectError) {
                console.warn('⚠️ Redirect gagal, lanjut dengan link asli:', redirectError.message);
            }
        }
        
        // STEP 2: Decode URL terlebih dahulu untuk menangani encoded characters
        try {
            finalUrl = decodeURIComponent(finalUrl);
            console.log('🔓 Decoded URL:', finalUrl);
        } catch (e) {
            console.log('URL tidak perlu di-decode');
        }
        
        // STEP 3: EKSTRAKSI KOORDINAT (dengan urutan prioritas yang lebih baik)
        let latitude = null;
        let longitude = null;
        
        // POLA 0: Format place dengan koordinat (Google Maps baru)
        let match = finalUrl.match(/place\/.*?\/@([-\d.]+),([-\d.]+)/);
        if (match) {
            latitude = parseFloat(match[1]);
            longitude = parseFloat(match[2]);
            console.log('✅ Pattern place/@ matched:', { latitude, longitude });
        }
        
        // POLA 1: Format !8m2!3dLATITUDE!4dLONGITUDE (most reliable for shared links)
        if (!latitude || !longitude) {
            match = finalUrl.match(/!8m2!3d([-\d.]+)!4d([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern !8m2!3d!4d matched:', { latitude, longitude });
            }
        }
        
        // POLA 2: Format !3dLATITUDE!4dLONGITUDE
        if (!latitude || !longitude) {
            match = finalUrl.match(/!3d([-\d.]+)!4d([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern !3d!4d matched:', { latitude, longitude });
            }
        }
        
        // POLA 3: Format @latitude,longitude (priority pattern)
        if (!latitude || !longitude) {
            match = finalUrl.match(/@([-\d.]+),([-\d.]+)(?:,|z|\/|$)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern @ matched:', { latitude, longitude });
            }
        }
        
        // POLA 4: Format /@latitude,longitude
        if (!latitude || !longitude) {
            match = finalUrl.match(/\/@([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern /@ matched:', { latitude, longitude });
            }
        }
        
        // POLA 5: Format ?q=latitude,longitude
        if (!latitude || !longitude) {
            match = finalUrl.match(/[?&]q=([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern q= matched:', { latitude, longitude });
            }
        }
        
        // POLA 6: Format /search/latitude,longitude
        if (!latitude || !longitude) {
            match = finalUrl.match(/\/search\/([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern search matched:', { latitude, longitude });
            }
        }
        
        // POLA 7: Format coordinate pairs with zoom level @lat,lng,z
        if (!latitude || !longitude) {
            match = finalUrl.match(/[?&]ll=([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern ll= matched:', { latitude, longitude });
            }
        }
        
        // POLA 8: Format coordinate pairs in path
        if (!latitude || !longitude) {
            match = finalUrl.match(/\/([-\d.]+),([-\d.]+)(?:\/|\?|&|$)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
                console.log('✅ Pattern path matched:', { latitude, longitude });
            }
        }
        
        // POLA 9: Extract from data parameter
        if (!latitude || !longitude) {
            match = finalUrl.match(/!1s([^!]*?)!2s([^!]*?)!3s?/);
            // Complex pattern for certain Google Maps formats
            const latMatch = finalUrl.match(/!3d([-\d.]+)/);
            const lngMatch = finalUrl.match(/!4d([-\d.]+)/);
            if (latMatch && lngMatch) {
                latitude = parseFloat(latMatch[1]);
                longitude = parseFloat(lngMatch[1]);
                console.log('✅ Pattern !3d and !4d separate matched:', { latitude, longitude });
            }
        }
        
        // VALIDASI dan KOREKSI
        if (latitude !== null && longitude !== null && !isNaN(latitude) && !isNaN(longitude)) {
            // Validasi range koordinat
            if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
                // Bulatkan ke 6 desimal untuk konsistensi
                latitude = parseFloat(latitude.toFixed(6));
                longitude = parseFloat(longitude.toFixed(6));
                console.log('🎉 Final valid coordinates:', { latitude, longitude });
                return { latitude, longitude };
            } 
            // Coba tukar jika latitude keluar range (common issue)
            else if (longitude >= -90 && longitude <= 90 && latitude >= -180 && latitude <= 180) {
                console.log('🔄 Mencoba menukar koordinat...');
                const swappedLat = parseFloat(longitude.toFixed(6));
                const swappedLng = parseFloat(latitude.toFixed(6));
                console.log('✅ Koordinat setelah ditukar valid:', { latitude: swappedLat, longitude: swappedLng });
                return { latitude: swappedLat, longitude: swappedLng };
            }
            else {
                console.error('❌ Koordinat tidak valid:', { latitude, longitude });
                return null;
            }
        }
        
        // Jika semua pola gagal, coba satu pendekatan terakhir
        console.log('⚠️ Mencoba pendekatan regex komprehensif...');
        const allNumbers = finalUrl.match(/-?\d+\.\d+/g);
        if (allNumbers && allNumbers.length >= 2) {
            // Coba pasangan angka pertama yang masuk akal sebagai koordinat
            for (let i = 0; i < allNumbers.length - 1; i++) {
                const lat = parseFloat(allNumbers[i]);
                const lng = parseFloat(allNumbers[i + 1]);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    console.log('✅ Found coordinates via fallback method:', { latitude: lat, longitude: lng });
                    return { latitude: lat, longitude: lng };
                }
            }
        }
        
        console.error('❌ Tidak ada pattern yang cocok untuk URL:', finalUrl);
        console.log('📝 URL structure:', finalUrl.split('').map(c => c.charCodeAt(0) > 127 ? `[${c}]` : c).join(''));
        throw new Error('Format link tidak dikenali');
        
    } catch (error) {
        console.error('❌ Error extracting coordinates:', error.message);
        return null;
    }
};

// Contoh penggunaan dengan berbagai format link
const testLinks = async () => {
    const links = [
        'https://maps.app.goo.gl/example', // Ganti dengan link real
        'https://www.google.com/maps/place/Jakarta/@-6.2088,106.8456,15z',
        'https://www.google.com/maps/search/-6.2088,106.8456',
        'https://www.google.com/maps?q=-6.2088,106.8456'
    ];
    
    for (const link of links) {
        console.log('\n' + '='.repeat(50));
        const coords = await extractCoordinatesFromMapsLink(link);
        if (coords) {
            console.log('✅ Success:', coords);
            console.log(`Google Maps URL: https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`);
        } else {
            console.log('❌ Failed to extract coordinates');
        }
    }
};

// ============ FUNGSI HITUNG JARAK (Haversine Formula) ============

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Radius bumi dalam meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
};

// ============ GET USER PENUGASAN (PRIORITAS KHUSUS > DEFAULT) ============
// DENGAN JAMINAN TIDAK ADA DUPLIKASI PRIORITAS

const getUserPenugasan = async (userId, tanggal = null) => {
    try {
        const targetDate = tanggal || DateTime.now().setZone('Asia/Jakarta').toISODate();
        
        // PRIORITAS 1: Cari penugasan khusus yang VALID dan AKTIF
        // Seorang user hanya bisa memiliki 1 penugasan khusus aktif dalam satu waktu
        const [penugasanKhusus] = await pool.execute(
            `SELECT 
                p.*, 
                true as is_penugasan_khusus,
                ap.tipe_assign,
                ap.id as assignment_id
             FROM penugasan p
             INNER JOIN assignment_pekerja ap ON ap.penugasan_id = p.id
             WHERE ap.user_id = ? 
               AND ap.status = 'aktif'
               AND p.tipe_penugasan = 'khusus'
               AND p.status = 'aktif'
               AND p.is_active = 1
               AND ? BETWEEN p.tanggal_mulai AND p.tanggal_selesai
             ORDER BY p.id DESC
             LIMIT 1`,
            [userId, targetDate]
        );
        
        // Jika ada penugasan khusus, KEMBALIKAN LANGSUNG
        // TIDAK AKAN PERNAH jatuh ke default selama masih ada penugasan khusus aktif
        if (penugasanKhusus.length > 0) {
            console.log(`✅ User ${userId} menggunakan penugasan KHUSUS: ${penugasanKhusus[0].nama_penugasan} (radius: ${penugasanKhusus[0].radius}m)`);
            console.log(`   Tanggal: ${targetDate}, Berlaku: ${penugasanKhusus[0].tanggal_mulai} s/d ${penugasanKhusus[0].tanggal_selesai}`);
            return penugasanKhusus[0];
        }
        
        // PRIORITAS 2: HANYA jika TIDAK ADA penugasan khusus sama sekali, baru pakai default
        const [defaultSystem] = await pool.execute(
            `SELECT 
                *, 
                false as is_penugasan_khusus,
                NULL as tipe_assign,
                NULL as assignment_id
             FROM penugasan 
             WHERE tipe_penugasan = 'default' 
               AND is_active = 1 
               AND status = 'aktif'
             LIMIT 1`
        );
        
        if (defaultSystem.length > 0) {
            console.log(`✅ User ${userId} menggunakan penugasan DEFAULT (tanpa radius)`);
            return defaultSystem[0];
        }
        
        console.log(`⚠️ User ${userId} tidak memiliki penugasan apapun`);
        return null;
        
    } catch (error) {
        console.error('❌ Error get user penugasan:', error);
        return null;
    }
};

// ============ VALIDASI RADIUS UNTUK PRESENSI ============
// DENGAN JAMINAN TIDAK ADA LOOPHOLE

const validatePresensiRadius = async (userId, latitude, longitude, tanggal = null) => {
    try {
        // Validasi input koordinat
        if (!latitude || !longitude) {
            return {
                valid: false,
                message: 'Lokasi tidak ditemukan. Silakan aktifkan GPS.'
            };
        }
        
        // Ambil penugasan user
        const penugasan = await getUserPenugasan(userId, tanggal);
        
        if (!penugasan) {
            return {
                valid: false,
                message: 'Anda tidak memiliki penugasan aktif untuk hari ini. Hubungi admin.'
            };
        }
        
        // JIKA PENUGASAN DEFAULT: LANGSUNG VALID, TANPA CEK RADIUS
        if (!penugasan.is_penugasan_khusus) {
            console.log(`📍 User ${userId} menggunakan DEFAULT, tidak ada pengecekan radius`);
            return {
                valid: true,
                penugasan: penugasan,
                is_default: true,
                message: 'Menggunakan penugasan default (tanpa batasan lokasi)'
            };
        }
        
        // JIKA PENUGASAN KHUSUS: WAJIB CEK RADIUS
        // Validasi kelengkapan data penugasan khusus
        if (!penugasan.latitude || !penugasan.longitude) {
            console.error(`❌ Penugasan khusus ${penugasan.id} tidak memiliki koordinat`);
            return {
                valid: false,
                message: 'Konfigurasi lokasi penugasan tidak lengkap. Hubungi admin.'
            };
        }
        
        if (!penugasan.radius || penugasan.radius <= 0) {
            console.error(`❌ Penugasan khusus ${penugasan.id} tidak memiliki radius yang valid`);
            return {
                valid: false,
                message: 'Konfigurasi radius penugasan tidak valid. Hubungi admin.'
            };
        }
        
        // Hitung jarak
        const distance = calculateDistance(
            parseFloat(latitude),
            parseFloat(longitude),
            parseFloat(penugasan.latitude),
            parseFloat(penugasan.longitude)
        );
        
        const radius = parseFloat(penugasan.radius);
        
        console.log(`📍 User ${userId} - Jarak ke lokasi penugasan: ${distance.toFixed(2)}m (radius: ${radius}m)`);
        console.log(`   Lokasi penugasan: (${penugasan.latitude}, ${penugasan.longitude})`);
        console.log(`   Lokasi user: (${latitude}, ${longitude})`);
        
        // VALIDASI RADIUS
        if (distance > radius) {
            console.log(`❌ User ${userId} BERADA DI LUAR RADIUS! Jarak: ${distance.toFixed(0)}m > Radius: ${radius}m`);
            return {
                valid: false,
                message: `Anda berada di luar radius presensi (${distance.toFixed(0)}m dari radius ${radius}m)`,
                distance: distance,
                radius: radius,
                penugasan: penugasan,
                is_default: false
            };
        }
        
        console.log(`✅ User ${userId} BERADA DALAM RADIUS! Jarak: ${distance.toFixed(0)}m <= Radius: ${radius}m`);
        return {
            valid: true,
            distance: distance,
            radius: radius,
            penugasan: penugasan,
            is_default: false,
            message: 'Berada dalam radius presensi'
        };
        
    } catch (error) {
        console.error('❌ Error validate presensi radius:', error);
        return {
            valid: false,
            message: 'Terjadi kesalahan validasi lokasi. Silakan coba lagi.'
        };
    }
};

// ============ CEK APAKAH USER MEMILIKI PENUGASAN KHUSUS AKTIF ============

const cekPenugasanKhususAktif = async (userId, tanggal = null) => {
    try {
        const targetDate = tanggal || DateTime.now().setZone('Asia/Jakarta').toISODate();
        
        const [result] = await pool.execute(
            `SELECT COUNT(*) as total 
             FROM penugasan p
             INNER JOIN assignment_pekerja ap ON ap.penugasan_id = p.id
             WHERE ap.user_id = ? 
               AND ap.status = 'aktif'
               AND p.tipe_penugasan = 'khusus'
               AND p.status = 'aktif'
               AND p.is_active = 1
               AND ? BETWEEN p.tanggal_mulai AND p.tanggal_selesai`,
            [userId, targetDate]
        );
        
        return result[0].total > 0;
    } catch (error) {
        console.error('Error cek penugasan khusus aktif:', error);
        return false;
    }
};

// ============ PENUGASAN CONTROLLERS ============

// Get semua penugasan
const getAllPenugasan = async (req, res) => {
    try {
        const { jenis = 'semua' } = req.query;
        
        let query = `
            SELECT 
                id,
                kode_penugasan,
                nama_penugasan,
                tipe_penugasan,
                jam_masuk,
                jam_pulang,
                toleransi_keterlambatan,
                batas_terlambat,
                maps_link,
                alamat,
                latitude,
                longitude,
                radius,
                tanggal_mulai,
                tanggal_selesai,
                status,
                is_active,
                created_at
            FROM penugasan 
            WHERE 1=1
        `;
        
        if (jenis === 'aktif') {
            query += ` AND status = 'aktif' AND is_active = 1`;
        } else if (jenis === 'selesai') {
            query += ` AND status IN ('selesai', 'dibatalkan')`;
        } else if (jenis === 'default') {
            query += ` AND tipe_penugasan = 'default'`;
        }
        
        query += ` ORDER BY 
            CASE WHEN tipe_penugasan = 'khusus' AND status = 'aktif' THEN 1 ELSE 2 END,
            is_active DESC, 
            created_at DESC`;
        
        const [penugasan] = await pool.execute(query);
        
        res.json({
            success: true,
            data: penugasan
        });
    } catch (error) {
        console.error('Get all penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// Get penugasan default yang aktif
const getPenugasanDefault = async (req, res) => {
    try {
        const [penugasan] = await pool.execute(
            `SELECT 
                id, 
                kode_penugasan,
                nama_penugasan, 
                jam_masuk, 
                jam_pulang,
                toleransi_keterlambatan, 
                batas_terlambat
             FROM penugasan 
             WHERE tipe_penugasan = 'default' AND is_active = 1 AND status = 'aktif'
             LIMIT 1`
        );
        
        if (penugasan.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ada penugasan default yang aktif'
            });
        }
        
        res.json({
            success: true,
            data: penugasan[0]
        });
    } catch (error) {
        console.error('Get penugasan default error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// Create penugasan (default atau khusus) - DENGAN JAMINAN TIDAK DUPLIKASI
const createPenugasan = async (req, res) => {
    try {
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
        } = req.body;
        
        // Validasi wajib
        if (!nama_penugasan || !jam_masuk || !jam_pulang) {
            return res.status(400).json({
                success: false,
                message: 'Nama penugasan, jam masuk, dan jam pulang wajib diisi'
            });
        }
        
        let coordinates = null;
        let kodePenugasan = null;
        let isPenugasanActive = is_active ? 1 : 0;
        
        if (tipe_penugasan === 'default') {
            kodePenugasan = 'DEFAULT-SYSTEM';
            
            // Nonaktifkan default lain
            await pool.execute(
                'UPDATE penugasan SET is_active = 0 WHERE tipe_penugasan = "default"'
            );
        } else {
            // Validasi untuk penugasan khusus
            if (!maps_link) {
                return res.status(400).json({
                    success: false,
                    message: 'Penugasan khusus wajib menyertakan link Google Maps'
                });
            }
            
            if (!tanggal_mulai || !tanggal_selesai) {
                return res.status(400).json({
                    success: false,
                    message: 'Penugasan khusus wajib menyertakan tanggal mulai dan selesai'
                });
            }
            
            // Validasi tanggal
            const tglMulai = DateTime.fromISO(tanggal_mulai);
            const tglSelesai = DateTime.fromISO(tanggal_selesai);
            const sekarang = DateTime.now().setZone('Asia/Jakarta');
            
            if (tglSelesai < tglMulai) {
                return res.status(400).json({
                    success: false,
                    message: 'Tanggal selesai tidak boleh lebih kecil dari tanggal mulai'
                });
            }
            
            coordinates = await extractCoordinatesFromMapsLink(maps_link);
            if (!coordinates) {
                return res.status(400).json({
                    success: false,
                    message: 'Tidak dapat mengekstrak koordinat dari link Google Maps'
                });
            }
            
            kodePenugasan = `PEN-${DateTime.now().toFormat('yyyyMMddHHmmss')}`;
        }
        
        // START TRANSACTION
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // Insert ke tabel penugasan
            const [result] = await connection.execute(
                `INSERT INTO penugasan 
                 (kode_penugasan, nama_penugasan, tipe_penugasan,
                  jam_masuk, jam_pulang, toleransi_keterlambatan, batas_terlambat,
                  maps_link, alamat, latitude, longitude, radius,
                  tanggal_mulai, tanggal_selesai, status, is_active, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?, ?)`,
                [
                    kodePenugasan, nama_penugasan, tipe_penugasan,
                    jam_masuk, jam_pulang, toleransi_keterlambatan || '00:15:00',
                    batas_terlambat || jam_masuk,
                    maps_link || null, alamat || null,
                    coordinates?.latitude || null, coordinates?.longitude || null,
                    tipe_penugasan === 'default' ? null : radius,
                    tanggal_mulai || null, tanggal_selesai || null,
                    isPenugasanActive, req.user?.id || null
                ]
            );
            
            const penugasanId = result.insertId;
            let assignedCount = 0;
            
            // Assign pekerja (hanya untuk penugasan khusus)
            if (tipe_penugasan === 'khusus') {
                // KRUSIAL: Hapus assignment LAMA untuk user yang akan diassign ulang
                // Ini mencegah user memiliki multiple penugasan khusus
                let usersToReassign = [];
                
                if (tipe_assign === 'individu' && selected_users.length > 0) {
                    usersToReassign = selected_users;
                    // Nonaktifkan assignment lama untuk user-user ini
                    const placeholders = selected_users.map(() => '?').join(',');
                    await connection.execute(
                        `UPDATE assignment_pekerja SET status = 'nonaktif' 
                         WHERE user_id IN (${placeholders}) 
                         AND penugasan_id IN (
                             SELECT id FROM penugasan 
                             WHERE tipe_penugasan = 'khusus' AND status = 'aktif'
                         )`,
                        selected_users
                    );
                } else if (tipe_assign === 'per_wilayah' && selected_wilayah.length > 0) {
                    const placeholders = selected_wilayah.map(() => '?').join(',');
                    // Ambil user berdasarkan wilayah
                    const [users] = await connection.execute(
                        `SELECT id FROM users 
                         WHERE is_active = 1 AND roles = "pegawai" 
                         AND wilayah_penugasan IN (${placeholders})`,
                        selected_wilayah
                    );
                    usersToReassign = users.map(u => u.id);
                    
                    if (usersToReassign.length > 0) {
                        const userPlaceholders = usersToReassign.map(() => '?').join(',');
                        await connection.execute(
                            `UPDATE assignment_pekerja SET status = 'nonaktif' 
                             WHERE user_id IN (${userPlaceholders}) 
                             AND penugasan_id IN (
                                 SELECT id FROM penugasan 
                                 WHERE tipe_penugasan = 'khusus' AND status = 'aktif'
                             )`,
                            usersToReassign
                        );
                    }
                } else if (tipe_assign === 'semua_pekerja') {
                    // Nonaktifkan SEMUA assignment khusus yang aktif
                    await connection.execute(
                        `UPDATE assignment_pekerja SET status = 'nonaktif' 
                         WHERE penugasan_id IN (
                             SELECT id FROM penugasan 
                             WHERE tipe_penugasan = 'khusus' AND status = 'aktif'
                         )`
                    );
                    
                    const [allUsers] = await connection.execute(
                        'SELECT id FROM users WHERE is_active = 1 AND roles = "pegawai"'
                    );
                    usersToReassign = allUsers.map(u => u.id);
                }
                
                // Assign ulang dengan penugasan baru
                for (const userId of usersToReassign) {
                    // Cek apakah sudah ada assignment aktif untuk user ini ke penugasan baru
                    const [existing] = await connection.execute(
                        `SELECT id FROM assignment_pekerja 
                         WHERE penugasan_id = ? AND user_id = ? AND status = 'aktif'`,
                        [penugasanId, userId]
                    );
                    
                    if (existing.length === 0) {
                        await connection.execute(
                            `INSERT INTO assignment_pekerja (penugasan_id, user_id, tipe_assign, status, assigned_at) 
                             VALUES (?, ?, ?, 'aktif', NOW())`,
                            [penugasanId, userId, tipe_assign]
                        );
                        assignedCount++;
                    }
                }
            }
            
            await connection.commit();
            
            res.json({
                success: true,
                message: `Penugasan berhasil dibuat${assignedCount > 0 ? ` dengan ${assignedCount} pekerja` : ''}`,
                data: {
                    id: penugasanId,
                    kode_penugasan: kodePenugasan,
                    tipe_penugasan: tipe_penugasan,
                    assigned_count: assignedCount
                }
            });
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
    } catch (error) {
        console.error('Create penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server: ' + error.message
        });
    }
};

// Get monitoring penugasan
const getMonitoringPenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        const { tanggal } = req.query;
        
        const targetDate = tanggal || DateTime.now().setZone('Asia/Jakarta').toISODate();
        
        const [penugasan] = await pool.execute(
            `SELECT * FROM penugasan WHERE id = ? AND tipe_penugasan = 'khusus'`,
            [id]
        );
        
        if (penugasan.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Penugasan tidak ditemukan'
            });
        }
        
        const [assignedUsers] = await pool.execute(
            `SELECT ap.*, u.nama, u.jabatan, u.wilayah_penugasan
             FROM assignment_pekerja ap
             JOIN users u ON ap.user_id = u.id
             WHERE ap.penugasan_id = ? AND ap.status = 'aktif'`,
            [id]
        );
        
        const [presensiList] = await pool.execute(
            `SELECT pr.*, u.nama as user_nama
             FROM presensi pr
             JOIN users u ON pr.user_id = u.id
             WHERE pr.penugasan_id = ? AND pr.tanggal = ?`,
            [id, targetDate]
        );
        
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
        
        res.json({
            success: true,
            data: {
                penugasan: penugasan[0],
                tanggal: targetDate,
                monitoring,
                total_pekerja: assignedUsers.length,
                total_hadir: monitoring.filter(m => m.status_presensi === 'Hadir').length
            }
        });
    } catch (error) {
        console.error('Get monitoring penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// Update status penugasan
const updatePenugasanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const [penugasan] = await pool.execute(
            'SELECT nama_penugasan FROM penugasan WHERE id = ? AND tipe_penugasan = "khusus"',
            [id]
        );
        
        if (penugasan.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Penugasan tidak ditemukan'
            });
        }
        
        await pool.execute(
            'UPDATE penugasan SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );
        
        res.json({
            success: true,
            message: `Penugasan berhasil di${status === 'selesai' ? 'selesaikan' : 'batalkan'}`
        });
    } catch (error) {
        console.error('Update penugasan status error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// Update default penugasan
const updateDefaultPenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nama_penugasan,
            jam_masuk,
            jam_pulang,
            toleransi_keterlambatan,
            batas_terlambat,
            is_active
        } = req.body;
        
        const [existing] = await pool.execute(
            'SELECT id FROM penugasan WHERE id = ? AND tipe_penugasan = "default"',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Penugasan default tidak ditemukan'
            });
        }
        
        if (is_active) {
            await pool.execute(
                'UPDATE penugasan SET is_active = 0 WHERE tipe_penugasan = "default" AND id != ?',
                [id]
            );
        }
        
        await pool.execute(
            `UPDATE penugasan SET 
                nama_penugasan = ?,
                jam_masuk = ?,
                jam_pulang = ?,
                toleransi_keterlambatan = ?,
                batas_terlambat = ?,
                is_active = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [nama_penugasan, jam_masuk, jam_pulang, 
             toleransi_keterlambatan, batas_terlambat, is_active ? 1 : 0, id]
        );
        
        res.json({
            success: true,
            message: 'Penugasan default berhasil diupdate'
        });
    } catch (error) {
        console.error('Update default penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// Hapus penugasan (hard delete)
const deletePenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [existing] = await pool.execute(
            'SELECT id, tipe_penugasan, status, is_active, nama_penugasan FROM penugasan WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Penugasan tidak ditemukan'
            });
        }
        
        const penugasan = existing[0];
        
        if (penugasan.tipe_penugasan === 'default' && penugasan.is_active === 1) {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus penugasan default yang sedang aktif. Nonaktifkan terlebih dahulu.'
            });
        }
        
        if (penugasan.tipe_penugasan === 'khusus' && penugasan.status === 'aktif') {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus penugasan khusus yang masih aktif. Selesaikan atau batalkan terlebih dahulu.'
            });
        }
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            await connection.execute(
                'DELETE FROM assignment_pekerja WHERE penugasan_id = ?',
                [id]
            );
            
            await connection.execute(
                'DELETE FROM penugasan WHERE id = ?',
                [id]
            );
            
            await connection.commit();
            
            res.json({
                success: true,
                message: `Penugasan "${penugasan.nama_penugasan}" berhasil dihapus`,
                data: {
                    id: parseInt(id),
                    tipe_penugasan: penugasan.tipe_penugasan,
                    nama_penugasan: penugasan.nama_penugasan
                }
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
    } catch (error) {
        console.error('Delete penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server saat menghapus penugasan'
        });
    }
};

// Soft delete penugasan
const softDeletePenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [existing] = await pool.execute(
            'SELECT id, tipe_penugasan, is_active, status, nama_penugasan FROM penugasan WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Penugasan tidak ditemukan'
            });
        }
        
        const penugasan = existing[0];
        
        if (penugasan.tipe_penugasan === 'default') {
            await pool.execute(
                'UPDATE penugasan SET is_active = 0, status = "nonaktif", updated_at = NOW() WHERE id = ?',
                [id]
            );
        } else {
            await pool.execute(
                'UPDATE penugasan SET status = "dibatalkan", is_active = 0, updated_at = NOW() WHERE id = ?',
                [id]
            );
        }
        
        await pool.execute(
            'UPDATE assignment_pekerja SET status = "nonaktif" WHERE penugasan_id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: `Penugasan "${penugasan.nama_penugasan}" berhasil dinonaktifkan`,
            data: {
                id: parseInt(id),
                tipe_penugasan: penugasan.tipe_penugasan,
                nama_penugasan: penugasan.nama_penugasan,
                is_active: false
            }
        });
        
    } catch (error) {
        console.error('Soft delete penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// Hapus semua penugasan yang sudah selesai
const deleteCompletedPenugasan = async (req, res) => {
    try {
        const { tipe = 'semua' } = req.query;
        
        let query = `
            SELECT id, tipe_penugasan, nama_penugasan FROM penugasan 
            WHERE status IN ('selesai', 'dibatalkan', 'nonaktif')
            AND is_active = 0
        `;
        
        if (tipe === 'default') {
            query += ` AND tipe_penugasan = 'default'`;
        } else if (tipe === 'khusus') {
            query += ` AND tipe_penugasan = 'khusus'`;
        }
        
        const [penugasanList] = await pool.execute(query);
        
        if (penugasanList.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ada penugasan yang dapat dihapus'
            });
        }
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            let totalDeleted = 0;
            let deletedNames = [];
            
            for (const penugasan of penugasanList) {
                await connection.execute(
                    'DELETE FROM assignment_pekerja WHERE penugasan_id = ?',
                    [penugasan.id]
                );
                
                await connection.execute(
                    'DELETE FROM penugasan WHERE id = ?',
                    [penugasan.id]
                );
                
                totalDeleted++;
                deletedNames.push(penugasan.nama_penugasan);
            }
            
            await connection.commit();
            
            res.json({
                success: true,
                message: `${totalDeleted} penugasan berhasil dihapus`,
                data: {
                    total_deleted: totalDeleted,
                    tipe: tipe,
                    deleted_penugasan: deletedNames
                }
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
    } catch (error) {
        console.error('Delete completed penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// Update penugasan khusus
// Update penugasan khusus (ALTERNATIF: DELETE + INSERT)
const updatePenugasan = async (req, res) => {
    try {
        const { id } = req.params;
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
        } = req.body;
        
        if (!nama_penugasan || !jam_masuk || !jam_pulang) {
            return res.status(400).json({
                success: false,
                message: 'Nama penugasan, jam masuk, dan jam pulang wajib diisi'
            });
        }
        
        const [existing] = await pool.execute(
            'SELECT * FROM penugasan WHERE id = ? AND tipe_penugasan = "khusus"',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Penugasan tidak ditemukan'
            });
        }
        
        let coordinates = null;
        
        if (maps_link) {
            coordinates = await extractCoordinatesFromMapsLink(maps_link);
            if (!coordinates) {
                return res.status(400).json({
                    success: false,
                    message: 'Tidak dapat mengekstrak koordinat dari link Google Maps'
                });
            }
        }
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // Update penugasan
            await connection.execute(
                `UPDATE penugasan SET 
                    nama_penugasan = ?,
                    maps_link = ?,
                    alamat = ?,
                    latitude = ?,
                    longitude = ?,
                    radius = ?,
                    tanggal_mulai = ?,
                    tanggal_selesai = ?,
                    jam_masuk = ?,
                    jam_pulang = ?,
                    batas_terlambat = ?,
                    toleransi_keterlambatan = ?,
                    is_active = ?,
                    updated_at = NOW()
                 WHERE id = ?`,
                [
                    nama_penugasan,
                    maps_link || null,
                    alamat || null,
                    coordinates?.latitude || null,
                    coordinates?.longitude || null,
                    radius,
                    tanggal_mulai,
                    tanggal_selesai,
                    jam_masuk,
                    jam_pulang,
                    batas_terlambat || jam_masuk,
                    toleransi_keterlambatan || '00:15:00',
                    is_active ? 1 : 0,
                    id
                ]
            );
            
            // CARA SIMPLE: Hapus semua assignment lama untuk penugasan ini
            await connection.execute(
                'DELETE FROM assignment_pekerja WHERE penugasan_id = ?',
                [id]
            );
            
            let assignedCount = 0;
            let usersToAssign = [];
            
            // Kumpulkan user yang akan diassign
            if (tipe_assign === 'semua_pekerja') {
                const [allUsers] = await connection.execute(
                    'SELECT id FROM users WHERE is_active = 1 AND roles = "pegawai"'
                );
                usersToAssign = allUsers.map(u => u.id);
            } else if (tipe_assign === 'per_wilayah' && selected_wilayah.length > 0) {
                const placeholders = selected_wilayah.map(() => '?').join(',');
                const [usersByWilayah] = await connection.execute(
                    `SELECT id FROM users 
                     WHERE is_active = 1 AND roles = "pegawai" 
                     AND wilayah_penugasan IN (${placeholders})`,
                    selected_wilayah
                );
                usersToAssign = usersByWilayah.map(u => u.id);
            } else if (tipe_assign === 'individu' && selected_users.length > 0) {
                usersToAssign = selected_users;
            }
            
            // Insert assignment baru
            for (const userId of usersToAssign) {
                await connection.execute(
                    `INSERT INTO assignment_pekerja 
                     (penugasan_id, user_id, tipe_assign, status, assigned_at) 
                     VALUES (?, ?, ?, 'aktif', NOW())`,
                    [id, userId, tipe_assign]
                );
                assignedCount++;
            }
            
            await connection.commit();
            
            res.json({
                success: true,
                message: `Penugasan berhasil diupdate dengan ${assignedCount} pekerja`,
                data: {
                    id: parseInt(id),
                    assigned_count: assignedCount
                }
            });
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
    } catch (error) {
        console.error('Update penugasan error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server saat mengupdate penugasan: ' + error.message
        });
    }
};

// Get detail penugasan by ID
const getPenugasanById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [penugasan] = await pool.execute(
            `SELECT 
                p.*,
                GROUP_CONCAT(DISTINCT ap.user_id) as user_ids,
                GROUP_CONCAT(DISTINCT u.wilayah_penugasan) as wilayah_names
             FROM penugasan p
             LEFT JOIN assignment_pekerja ap ON ap.penugasan_id = p.id AND ap.status = 'aktif'
             LEFT JOIN users u ON ap.user_id = u.id
             WHERE p.id = ?
             GROUP BY p.id`,
            [id]
        );
        
        if (penugasan.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Penugasan tidak ditemukan'
            });
        }
        
        const [assignedUsers] = await pool.execute(
            `SELECT u.id, u.nama, u.jabatan, u.wilayah_penugasan, ap.tipe_assign
             FROM assignment_pekerja ap
             JOIN users u ON ap.user_id = u.id
             WHERE ap.penugasan_id = ? AND ap.status = 'aktif'`,
            [id]
        );
        
        res.json({
            success: true,
            data: {
                ...penugasan[0],
                assigned_users: assignedUsers,
                selected_users: assignedUsers.map(u => u.id),
                selected_wilayah: [...new Set(assignedUsers.map(u => u.wilayah_penugasan).filter(w => w))]
            }
        });
        
    } catch (error) {
        console.error('Get penugasan by id error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

// ============ EKSPOR MODULE ============

module.exports = {
    getAllPenugasan,
    getPenugasanById,
    updatePenugasan,
    getPenugasanDefault,
    createPenugasan,
    getUserPenugasan,
    validatePresensiRadius,
    calculateDistance,
    cekPenugasanKhususAktif,
    getMonitoringPenugasan,
    updatePenugasanStatus,
    updateDefaultPenugasan,
    deletePenugasan,
    softDeletePenugasan,
    deleteCompletedPenugasan
};