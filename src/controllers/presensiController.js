const path = require('path');
const fs = require('fs');
const { DateTime } = require('luxon');
const { pool } = require('../config/database');

const { getUserPenugasan } = require('./jamKerjaController');
// ============ KONFIGURASI SISTEM ============
const SYSTEM_CONFIG = {
  AUTO_GENERATE_HOUR: 0,
  AUTO_UPDATE_HOUR: 23,
  MORNING_CHECK_HOUR: 8,
  TANPA_KETERANGAN_UPDATE_HOUR: 20,
  TIMEZONE: 'Asia/Jakarta'
};

// ============ FUNGSI HELPER ============

const checkHariKerja = async (tanggal) => {
  try {
    const [hariKerja] = await pool.execute(
      'SELECT * FROM hari_kerja WHERE tanggal = ?',
      [tanggal]
    );

    if (hariKerja.length > 0) {
      return {
        is_hari_kerja: hariKerja[0].is_hari_kerja === 1,
        keterangan: hariKerja[0].keterangan,
        source: 'hari_kerja'
      };
    }

    const [hariLibur] = await pool.execute(
      'SELECT * FROM hari_libur WHERE tanggal = ?',
      [tanggal]
    );

    if (hariLibur.length > 0) {
      return {
        is_hari_kerja: false,
        keterangan: `Libur: ${hariLibur[0].nama_libur}`,
        source: 'hari_libur'
      };
    }

    const dayOfWeek = new Date(tanggal).getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    return {
      is_hari_kerja: isWeekday,
      keterangan: isWeekday ? 'Hari kerja normal' : 'Weekend',
      source: 'default'
    };
  } catch (error) {
    console.error('Error in checkHariKerja:', error);
    return {
      is_hari_kerja: false,
      keterangan: 'Error menentukan hari kerja',
      source: 'error'
    };
  }
};

const checkUserIzin = async (userId, tanggal) => {
  try {
    const [izin] = await pool.execute(
      `SELECT i.id, i.jenis, i.status 
       FROM izin i 
       WHERE i.user_id = ? 
         AND i.status = 'Disetujui'
         AND DATE(?) BETWEEN DATE(i.tanggal_mulai) AND DATE(i.tanggal_selesai)`,
      [userId, tanggal]
    );
    return izin.length > 0 ? izin[0] : null;
  } catch (error) {
    console.error('Error in checkUserIzin:', error);
    return null;
  }
};

// Helper hitung jarak (Haversine formula) - dalam meter
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1000;
};

// ============ FUNGSI GENERATE PRESENSI OTOMATIS ============

const generatePresensiForDate = async (targetDate) => {
  try {
    console.log('🔄 Starting generate presensi for date:', targetDate);
    console.log('='.repeat(60));

    const hariKerjaInfo = await checkHariKerja(targetDate);
    
    if (!hariKerjaInfo.is_hari_kerja) {
      console.log(`⏭️ Skip ${targetDate}: ${hariKerjaInfo.keterangan}`);
      console.log('='.repeat(60));
      return {
        success: true,
        message: `Bukan hari kerja: ${hariKerjaInfo.keterangan}`,
        generated_count: 0,
        updated_count: 0,
        izin_count: 0,
        skipped_count: 0,
        total_users: 0,
        tanggal: targetDate,
        is_hari_kerja: false,
        keterangan: hariKerjaInfo.keterangan
      };
    }

    console.log(`✅ Hari kerja: ${hariKerjaInfo.keterangan}`);

    const [users] = await pool.execute(
      `SELECT u.id, u.nama, u.wilayah_penugasan 
       FROM users u 
       WHERE u.is_active = 1 AND u.roles = 'pegawai'
       ORDER BY u.nama`
    );

    console.log(`📊 Total active users: ${users.length}`);
    
    let generatedCount = 0;
    let updatedCount = 0;
    let izinCount = 0;
    let skippedCount = 0;

    console.log('\n' + '─'.repeat(60));
    console.log('👥 PROCESSING EACH USER:');
    console.log('─'.repeat(60));

    for (const user of users) {
      console.log(`\n👤 [${user.id}] ${user.nama}:`);
      
      try {
        // Ambil penugasan user untuk tanggal tersebut
        const penugasan = await getUserPenugasan(user.id, targetDate);
        
        const [existingPresensi] = await pool.execute(
          'SELECT id, izin_id, status_masuk, jam_masuk, keterangan, penugasan_id FROM presensi WHERE user_id = ? AND tanggal = ?',
          [user.id, targetDate]
        );

        const izin = await checkUserIzin(user.id, targetDate);
        
        if (izin) {
          console.log(`  📋 User has approved izin: ${izin.jenis}`);
        }

        if (existingPresensi.length > 0) {
          const presensi = existingPresensi[0];
          console.log(`  📅 Existing presensi found: ID ${presensi.id}`);
          
          let actionTaken = false;

          // Update dengan izin jika ada dan belum ada izin_id
          if (izin && !presensi.izin_id) {
            console.log(`  🔄 Updating: Adding izin ${izin.jenis}`);
            
            const statusIzin = `Izin ${izin.jenis}`.substring(0, 20);
            
            await pool.execute(
              `UPDATE presensi SET 
                izin_id = ?, 
                status_masuk = ?, 
                status_pulang = ?, 
                keterangan = ?,
                updated_at = NOW()
               WHERE id = ?`,
              [
                izin.id,
                statusIzin,
                statusIzin,
                presensi.keterangan 
                  ? `${presensi.keterangan} | Auto-updated: Izin ${izin.jenis}`
                  : `Auto-updated: Izin ${izin.jenis}`,
                presensi.id
              ]
            );
            updatedCount++;
            izinCount++;
            actionTaken = true;
            console.log(`  ✅ Updated with izin: ${izin.jenis}`);
          }
          
          // Update penugasan jika berbeda atau belum ada
          if (penugasan && (!presensi.penugasan_id || presensi.penugasan_id !== penugasan.id)) {
            console.log(`  🔄 Updating: Setting penugasan to ${penugasan.nama_penugasan}`);
            
            await pool.execute(
              `UPDATE presensi SET 
                penugasan_id = ?,
                is_penugasan_khusus = ?,
                updated_at = NOW()
               WHERE id = ?`,
              [
                penugasan.id,
                penugasan.is_penugasan_khusus ? 1 : 0,
                presensi.id
              ]
            );
            updatedCount++;
            actionTaken = true;
            console.log(`  ✅ Updated with penugasan: ${penugasan.nama_penugasan}`);
          }
          
          if (!actionTaken) {
            skippedCount++;
            console.log(`  ⏭️ Skipped (no action needed)`);
          }
          
          continue;
        }

        console.log(`  ➕ Creating new presensi record`);
        
        if (izin) {
          console.log(`  📋 Creating new presensi with izin: ${izin.jenis}`);
          const statusIzin = `Izin ${izin.jenis}`.substring(0, 20);
          
          await pool.execute(
            `INSERT INTO presensi 
             (user_id, tanggal, penugasan_id, izin_id, status_masuk, status_pulang, is_system_generated, keterangan, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
            [
              user.id,
              targetDate,
              penugasan ? penugasan.id : null,
              izin.id,
              statusIzin,
              statusIzin,
              `Auto-generated: Izin ${izin.jenis}`
            ]
          );
          generatedCount++;
          izinCount++;
          console.log(`  ✅ Created with izin: ${izin.jenis}`);
 } else {
  // Buat presensi TANPA mengisi status_masuk (biarkan NULL)
  await pool.execute(
    `INSERT INTO presensi 
     (user_id, tanggal, penugasan_id, is_penugasan_khusus, is_system_generated, created_at, updated_at) 
     VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
    [
      user.id, 
      targetDate,
      penugasan ? penugasan.id : null,
      penugasan ? (penugasan.is_penugasan_khusus ? 1 : 0) : 0
    ]
  );
  generatedCount++;
  console.log(`  📝 Created presensi record (status_masuk akan diisi saat presensi)`);
}
      } catch (error) {
        console.error(`  ❌ ERROR:`, error.message);
      }
    }

    await pool.execute(
      'INSERT INTO system_log (event_type, description) VALUES (?, ?)',
      ['GENERATE_PRESENSI', `Generated presensi ${targetDate}: ${generatedCount} new, ${updatedCount} updated, ${izinCount} izin, ${skippedCount} skipped`]
    );

    console.log('\n' + '='.repeat(60));
    console.log('🎉 GENERATION COMPLETED');
    console.log('='.repeat(60));
    console.log(`📈 SUMMARY FOR ${targetDate}:`);
    console.log(`  ✅ New records: ${generatedCount}`);
    console.log(`  🔄 Updated records: ${updatedCount}`);
    console.log(`  📋 With izin: ${izinCount}`);
    console.log(`  ⏭️ Skipped: ${skippedCount}`);
    console.log(`  👥 Total users: ${users.length}`);
    console.log('='.repeat(60));
    
    return {
      success: true,
      generated_count: generatedCount,
      updated_count: updatedCount,
      izin_count: izinCount,
      skipped_count: skippedCount,
      total_users: users.length,
      tanggal: targetDate,
      is_hari_kerja: true,
      keterangan: hariKerjaInfo.keterangan
    };

  } catch (error) {
    console.error('\n❌ GENERATE PRESENSI ERROR:', error);
    throw error;
  }
};

const generatePresensiHariIniOnStartup = async () => {
  try {
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    console.log('🚀 Application startup: Checking presensi for today:', today);
    
    const [count] = await pool.execute(
      'SELECT COUNT(*) as total FROM presensi WHERE tanggal = ?',
      [today]
    );
    
    const totalPresensiHariIni = count[0].total;
    
    if (totalPresensiHariIni === 0) {
      console.log('⚠️ No presensi found for today, generating now...');
      const result = await generatePresensiForDate(today);
      return {
        type: 'hari_ini',
        action: 'generated',
        message: 'Generated presensi for today on startup',
        data: result
      };
    } else {
      console.log(`✅ Found ${totalPresensiHariIni} presensi records for today`);
      return {
        type: 'hari_ini',
        action: 'skipped',
        message: 'Presensi for today already exists',
        data: { total: totalPresensiHariIni }
      };
    }
  } catch (error) {
    console.error('❌ Error generating presensi hari ini on startup:', error);
    return {
      type: 'error',
      action: 'failed',
      message: 'Failed to generate presensi for today',
      error: error.message
    };
  }
};

const updatePresensiStatusAkhirHari = async () => {
  try {
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    console.log('🌙 Starting end of day update for:', today);
    console.log('='.repeat(60));

    const hariKerjaInfo = await checkHariKerja(today);
    
    if (!hariKerjaInfo.is_hari_kerja) {
      console.log(`⏭️ Skip update for ${today}: ${hariKerjaInfo.keterangan}`);
      console.log('='.repeat(60));
      return {
        success: true,
        message: `Bukan hari kerja: ${hariKerjaInfo.keterangan}`,
        updated_count: 0,
        izin_count: 0,
        tanpa_keterangan_count: 0,
        tanggal: today
      };
    }

    console.log(`✅ Hari kerja: ${hariKerjaInfo.keterangan}`);

    const [presensiList] = await pool.execute(
      `SELECT p.id, p.user_id, p.izin_id, p.jam_masuk, p.status_masuk, p.keterangan, u.nama
       FROM presensi p
       JOIN users u ON p.user_id = u.id
       WHERE p.tanggal = ? 
         AND u.is_active = 1
         AND p.jam_masuk IS NULL`,
      [today]
    );

    console.log(`📊 Found ${presensiList.length} presensi records without check-in`);

    let updatedCount = 0;
    let izinCount = 0;
    let tanpaKeteranganCount = 0;

    console.log('\n' + '─'.repeat(60));
    console.log('🔄 PROCESSING RECORDS:');
    console.log('─'.repeat(60));

    for (const presensi of presensiList) {
      try {
        console.log(`\n👤 ${presensi.nama}:`);
        
        const izin = await checkUserIzin(presensi.user_id, today);
        const penugasan = await getUserPenugasan(presensi.user_id, today);

        // Update penugasan jika ada
        if (penugasan) {
          await pool.execute(
            `UPDATE presensi SET 
              penugasan_id = ?,
              is_penugasan_khusus = ?
             WHERE id = ?`,
            [penugasan.id, penugasan.is_penugasan_khusus ? 1 : 0, presensi.id]
          );
        }

        if (presensi.izin_id) {
          const [izinDetail] = await pool.execute(
            'SELECT jenis, status FROM izin WHERE id = ?',
            [presensi.izin_id]
          );
          
          if (izinDetail.length > 0 && izinDetail[0].status === 'Disetujui') {
            const newKeterangan = presensi.keterangan 
              ? `${presensi.keterangan} | End-of-day: Izin ${izinDetail[0].jenis}`
              : `End-of-day: Izin ${izinDetail[0].jenis}`;
              
            await pool.execute(
              `UPDATE presensi SET 
                status_masuk = ?, 
                status_pulang = ?,
                keterangan = ?,
                updated_at = NOW()
               WHERE id = ?`,
              [
                `Izin ${izinDetail[0].jenis}`.substring(0, 20),
                `Izin ${izinDetail[0].jenis}`.substring(0, 20),
                newKeterangan,
                presensi.id
              ]
            );
            updatedCount++;
            izinCount++;
            console.log(`  ✅ Updated: Izin ${izinDetail[0].jenis}`);
          }
        } 
        else if (izin) {
          const newKeterangan = presensi.keterangan 
            ? `${presensi.keterangan} | End-of-day: Izin ${izin.jenis}`
            : `End-of-day: Izin ${izin.jenis}`;
            
          await pool.execute(
            `UPDATE presensi SET 
              izin_id = ?,
              status_masuk = ?, 
              status_pulang = ?,
              keterangan = ?,
              updated_at = NOW()
             WHERE id = ?`,
            [
              izin.id,
              `Izin ${izin.jenis}`.substring(0, 20),
              `Izin ${izin.jenis}`.substring(0, 20),
              newKeterangan,
              presensi.id
            ]
          );
          updatedCount++;
          izinCount++;
          console.log(`  ✅ Updated with izin: ${izin.jenis}`);
        }
        else if (!presensi.jam_masuk) {
          const newKeterangan = presensi.keterangan 
            ? `${presensi.keterangan} | End-of-day: Tanpa Keterangan`
            : 'End-of-day: Tanpa Keterangan';
            
          await pool.execute(
            `UPDATE presensi SET 
              status_masuk = 'Tanpa Keterangan',
              status_pulang = 'Tanpa Keterangan',
              keterangan = ?,
              updated_at = NOW()
             WHERE id = ?`,
            [newKeterangan, presensi.id]
          );
          updatedCount++;
          tanpaKeteranganCount++;
          console.log(`  ❌ Updated: Tanpa Keterangan`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating presensi ${presensi.id}:`, error.message);
      }
    }

    await pool.execute(
      'INSERT INTO system_log (event_type, description) VALUES (?, ?)',
      ['UPDATE_PRESENSI_END_DAY', `Updated ${updatedCount} presensi untuk ${today} (${izinCount} izin, ${tanpaKeteranganCount} tanpa keterangan)`]
    );

    console.log('\n' + '='.repeat(60));
    console.log('🌙 END OF DAY UPDATE COMPLETED');
    console.log('='.repeat(60));
    console.log(`📈 SUMMARY:`);
    console.log(`  🔄 Updated records: ${updatedCount}`);
    console.log(`  📋 With izin: ${izinCount}`);
    console.log(`  ❌ Tanpa Keterangan: ${tanpaKeteranganCount}`);
    console.log('='.repeat(60));
    
    return {
      success: true,
      updated_count: updatedCount,
      izin_count: izinCount,
      tanpa_keterangan_count: tanpaKeteranganCount,
      tanggal: today
    };

  } catch (error) {
    console.error('\n❌ Update presensi status akhir hari error:', error);
    throw error;
  }
};


const checkAndUpdateIzinPresensi = async (tanggal) => {
  try {
    console.log(`🔍 Checking and updating izin presensi for: ${tanggal}`);
    
    const hariKerjaInfo = await checkHariKerja(tanggal);
    if (!hariKerjaInfo.is_hari_kerja) {
      console.log(`⏭️ Skip: ${hariKerjaInfo.keterangan}`);
      return { success: true, skipped: true, reason: hariKerjaInfo.keterangan };
    }

    const [usersWithIzin] = await pool.execute(
      `SELECT DISTINCT u.id, u.nama, i.id as izin_id, i.jenis
       FROM users u
       JOIN izin i ON u.id = i.user_id
       WHERE u.is_active = 1 
         AND u.roles = 'pegawai'
         AND i.status = 'Disetujui'
         AND DATE(?) BETWEEN DATE(i.tanggal_mulai) AND DATE(i.tanggal_selesai)`,
      [tanggal]
    );

    console.log(`📋 Found ${usersWithIzin.length} users with approved izin`);

    let updatedCount = 0;
    let createdCount = 0;

    for (const user of usersWithIzin) {
      try {
        // Ambil penugasan user
        const penugasan = await getUserPenugasan(user.id, tanggal);
        
        const [existingPresensi] = await pool.execute(
          'SELECT id, izin_id, status_masuk, penugasan_id FROM presensi WHERE user_id = ? AND tanggal = ?',
          [user.id, tanggal]
        );

        const statusIzin = `Izin ${user.jenis}`.substring(0, 20);

        if (existingPresensi.length > 0) {
          const presensi = existingPresensi[0];
          let needUpdate = false;
          let updateFields = [];
          let updateValues = [];

          if (!presensi.izin_id || presensi.status_masuk !== statusIzin) {
            updateFields.push('izin_id = ?', 'status_masuk = ?', 'status_pulang = ?');
            updateValues.push(user.izin_id, statusIzin, statusIzin);
            needUpdate = true;
          }

          if (penugasan && (!presensi.penugasan_id || presensi.penugasan_id !== penugasan.id)) {
            updateFields.push('penugasan_id = ?', 'is_penugasan_khusus = ?');
            updateValues.push(penugasan.id, penugasan.is_penugasan_khusus ? 1 : 0);
            needUpdate = true;
          }

          if (needUpdate) {
            updateFields.push('keterangan = COALESCE(CONCAT(keterangan, ?), ?)', 'updated_at = NOW()');
            updateValues.push(` | Auto: Izin ${user.jenis}`, `Auto: Izin ${user.jenis}`, presensi.id);
            
            const query = `UPDATE presensi SET ${updateFields.join(', ')} WHERE id = ?`;
            await pool.execute(query, updateValues);
            updatedCount++;
            console.log(`  🔄 Updated ${user.nama}: ${user.jenis}`);
          }
        } else {
          await pool.execute(
            `INSERT INTO presensi 
             (user_id, tanggal, penugasan_id, is_penugasan_khusus, izin_id, status_masuk, status_pulang, is_system_generated, keterangan, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
            [
              user.id, 
              tanggal, 
              penugasan ? penugasan.id : null,
              penugasan ? (penugasan.is_penugasan_khusus ? 1 : 0) : 0,
              user.izin_id, 
              statusIzin, 
              statusIzin, 
              `Auto: Izin ${user.jenis}`
            ]
          );
          createdCount++;
          console.log(`  ➕ Created for ${user.nama}: ${user.jenis}`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${user.nama}:`, error.message);
      }
    }

    console.log(`\n✅ Completed: ${updatedCount} updated, ${createdCount} created`);
    
    return {
      success: true,
      updated_count: updatedCount,
      created_count: createdCount,
      total_users_with_izin: usersWithIzin.length
    };
  } catch (error) {
    console.error('❌ Check and update izin error:', error);
    return { success: false, error: error.message };
  }
};


const generatePresensiForDateRange = async (startDate, endDate) => {
  try {
    console.log(`📅 Generating presensi from ${startDate} to ${endDate}`);
    
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);
    
    if (!start.isValid || !end.isValid) {
      throw new Error('Format tanggal tidak valid');
    }
    
    if (start > end) {
      throw new Error('Start date harus sebelum end date');
    }
    
    const results = [];
    let currentDate = start;
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISODate();
      console.log(`\n📆 Processing date: ${dateStr}`);
      
      try {
        const result = await generatePresensiForDate(dateStr);
        results.push(result);
        
        console.log(`✅ Completed: ${dateStr} - Generated: ${result.generated_count}, Updated: ${result.updated_count}`);
      } catch (error) {
        console.error(`❌ Failed for ${dateStr}:`, error.message);
        results.push({
          tanggal: dateStr,
          success: false,
          error: error.message
        });
      }
      
      currentDate = currentDate.plus({ days: 1 });
    }
    
    const totalGenerated = results.filter(r => r.success).reduce((sum, r) => sum + r.generated_count, 0);
    const totalUpdated = results.filter(r => r.success).reduce((sum, r) => sum + r.updated_count, 0);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RANGE GENERATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`📅 Period: ${startDate} to ${endDate}`);
    console.log(`✅ Successful dates: ${successCount}`);
    console.log(`❌ Failed dates: ${failedCount}`);
    console.log(`📈 Total generated: ${totalGenerated}`);
    console.log(`🔄 Total updated: ${totalUpdated}`);
    console.log('='.repeat(60));
    
    await pool.execute(
      'INSERT INTO system_log (event_type, description) VALUES (?, ?)',
      ['GENERATE_PRESENSI_RANGE', `Generated presensi for range ${startDate} to ${endDate}: ${successCount} success, ${failedCount} failed`]
    );
    
    return {
      success: true,
      total_dates: results.length,
      success_count: successCount,
      failed_count: failedCount,
      total_generated: totalGenerated,
      total_updated: totalUpdated,
      results: results
    };
    
  } catch (error) {
    console.error('❌ Generate presensi range error:', error);
    throw error;
  }
};

const updateTanpaKeteranganEarly = async () => {
  try {
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    const now = DateTime.now().setZone('Asia/Jakarta');
    
    console.log('🕗 Early update for "Tanpa Keterangan" at 20:00');
    
    const hariKerjaInfo = await checkHariKerja(today);
    if (!hariKerjaInfo.is_hari_kerja) {
      console.log(`⏭️ Skip: ${hariKerjaInfo.keterangan}`);
      return { success: true, skipped: true, reason: hariKerjaInfo.keterangan };
    }
    
    const [presensiList] = await pool.execute(
      `SELECT p.id, p.user_id, p.keterangan, u.nama
       FROM presensi p
       JOIN users u ON p.user_id = u.id
       WHERE p.tanggal = ? 
         AND u.is_active = 1
         AND p.jam_masuk IS NULL
         AND p.izin_id IS NULL
         AND p.status_masuk = 'Belum Presensi'`,
      [today]
    );
    
    console.log(`📊 Found ${presensiList.length} records for early update`);
    
    let updatedCount = 0;
    
    for (const presensi of presensiList) {
      try {
        const izin = await checkUserIzin(presensi.user_id, today);
        const penugasan = await getUserPenugasan(presensi.user_id, today);
        
        if (!izin) {
          const newKeterangan = presensi.keterangan 
            ? `${presensi.keterangan} | Early-update: Tanpa Keterangan`
            : 'Early-update: Tanpa Keterangan';
          
          await pool.execute(
            `UPDATE presensi SET 
              penugasan_id = ?,
              is_penugasan_khusus = ?,
              status_masuk = 'Tanpa Keterangan',
              status_pulang = 'Tanpa Keterangan',
              keterangan = ?,
              updated_at = NOW()
             WHERE id = ?`,
            [
              penugasan ? penugasan.id : null,
              penugasan ? (penugasan.is_penugasan_khusus ? 1 : 0) : 0,
              newKeterangan, 
              presensi.id
            ]
          );
          updatedCount++;
          console.log(`  ✅ Updated ${presensi.nama || presensi.id} to Tanpa Keterangan`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating ${presensi.id}:`, error.message);
      }
    }
    
    console.log(`✅ Early update completed: ${updatedCount} records updated`);
    
    await pool.execute(
      'INSERT INTO system_log (event_type, description) VALUES (?, ?)',
      ['UPDATE_TANPA_KETERANGAN_EARLY', `Early update at 20:00: ${updatedCount} records marked as Tanpa Keterangan`]
    );
    
    return {
      success: true,
      updated_count: updatedCount,
      tanggal: today
    };
    
  } catch (error) {
    console.error('❌ Early update error:', error);
    return { success: false, error: error.message };
  }
};

// ============ SETUP CRON JOB ============

const setupPresensiCronJobs = () => {
  try {
    const cron = require('node-cron');
    
    console.log('⏰ Setting up presensi cron jobs...');
    
    cron.schedule('1 0 * * *', async () => {
      console.log('\n' + '='.repeat(60));
      console.log('⏰ Cron job 00:01: Generating presensi for TODAY...');
      console.log('='.repeat(60));
      try {
        const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
        const generateResult = await generatePresensiForDate(today);
        const izinResult = await checkAndUpdateIzinPresensi(today);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Cron job 00:01 completed:');
        console.log(`   📅 Date: ${generateResult.tanggal}`);
        console.log(`   ➕ Generated: ${generateResult.generated_count}`);
        console.log(`   🔄 Updated: ${generateResult.updated_count}`);
        console.log(`   📋 Izin: ${generateResult.izin_count}`);
        if (izinResult.success && !izinResult.skipped) {
          console.log(`   🔍 Izin check: ${izinResult.updated_count} updated, ${izinResult.created_count} created`);
        }
        console.log('='.repeat(60));
        
      } catch (error) {
        console.error('❌ Cron job 00:01 error:', error.message);
      }
    });
    
    cron.schedule('0 8 * * *', async () => {
      console.log('\n' + '='.repeat(60));
      console.log('⏰ Cron job 08:00: Morning status check...');
      console.log('='.repeat(60));
      try {
        const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
        const izinResult = await checkAndUpdateIzinPresensi(today);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Cron job 08:00 completed:');
        if (izinResult.skipped) {
          console.log(`   ⏭️ Skipped: ${izinResult.reason}`);
        } else {
          console.log(`   🔍 Izin check: ${izinResult.updated_count} updated, ${izinResult.created_count} created`);
        }
        console.log('='.repeat(60));
        
      } catch (error) {
        console.error('❌ Cron job 08:00 error:', error.message);
      }
    });
    
    cron.schedule('0 20 * * *', async () => {
      console.log('\n' + '='.repeat(60));
      console.log('⏰ Cron job 20:00: Early update for Tanpa Keterangan...');
      console.log('='.repeat(60));
      try {
        const result = await updateTanpaKeteranganEarly();
        console.log('='.repeat(60));
      } catch (error) {
        console.error('❌ Cron job 20:00 error:', error.message);
      }
    });
    
    cron.schedule('59 23 * * *', async () => {
      console.log('\n' + '='.repeat(60));
      console.log('⏰ Cron job 23:59: Final update for today...');
      console.log('='.repeat(60));
      try {
        const result = await updatePresensiStatusAkhirHari();
        console.log('='.repeat(60));
      } catch (error) {
        console.error('❌ Cron job 23:59 error:', error.message);
      }
    });
    
    cron.schedule('0 1 * * 1', async () => {
      console.log('\n' + '='.repeat(60));
      console.log('⏰ Cron job 01:00 Monday: Generate presensi for next week...');
      console.log('='.repeat(60));
      try {
        const today = DateTime.now().setZone('Asia/Jakarta');
        const nextWeekStart = today.plus({ days: 1 });
        const nextWeekEnd = today.plus({ days: 7 });
        
        const result = await generatePresensiForDateRange(
          nextWeekStart.toISODate(),
          nextWeekEnd.toISODate()
        );
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Cron job 01:00 Monday completed:');
        console.log(`   📅 Period: ${nextWeekStart.toISODate()} to ${nextWeekEnd.toISODate()}`);
        console.log(`   ✅ Successful dates: ${result.success_count}`);
        console.log(`   📈 Total generated: ${result.total_generated}`);
        console.log('='.repeat(60));
        
      } catch (error) {
        console.error('❌ Cron job 01:00 Monday error:', error.message);
      }
    });
    
    console.log('✅ Presensi cron jobs setup complete - 5 jobs scheduled');
    console.log('   • 00:01 - Generate presensi hari ini');
    console.log('   • 08:00 - Morning izin check');
    console.log('   • 20:00 - Early update Tanpa Keterangan');
    console.log('   • 23:59 - End of day update');
    console.log('   • 01:00 Monday - Generate for next week');
    
    return {
      success: true,
      message: 'Cron jobs setup successfully',
      jobs: [
        '00:01 - Generate today',
        '08:00 - Morning check', 
        '20:00 - Early Tanpa Keterangan',
        '23:59 - End of day update',
        '01:00 Monday - Generate next week'
      ]
    };
  } catch (error) {
    console.error('❌ Failed to setup cron jobs:', error);
    return {
      success: false,
      message: 'Failed to setup cron jobs',
      error: error.message
    };
  }
};

// ============ PRESENSI MASUK ============

const presensiMasuk = async (req, res) => {
  try {
    const userId = req.user.id;
    const { foto_masuk, latitude_masuk, longitude_masuk, keterangan } = req.body;

    console.log('📱 Presensi masuk attempt - User ID:', userId);

    if (!foto_masuk) {
      return res.status(400).json({
        success: false,
        message: 'Foto wajib diambil'
      });
    }

    if (latitude_masuk === undefined || longitude_masuk === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Lokasi wajib diisi'
      });
    }

    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    const now = DateTime.now().setZone('Asia/Jakarta');

    console.log('📅 Tanggal:', today, '⏰ Waktu sekarang:', now.toFormat('HH:mm:ss'));

    const hariKerjaInfo = await checkHariKerja(today);
    
    if (!hariKerjaInfo.is_hari_kerja) {
      return res.status(400).json({
        success: false,
        message: `Hari ini bukan hari kerja: ${hariKerjaInfo.keterangan}`
      });
    }

    const izin = await checkUserIzin(userId, today);
    if (izin) {
      return res.status(400).json({
        success: false,
        message: `Anda memiliki izin ${izin.jenis} hari ini. Tidak perlu melakukan presensi.`
      });
    }

    // Ambil penugasan user (prioritas: khusus > default)
    const penugasan = await getUserPenugasan(userId, today);
    if (!penugasan) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada penugasan aktif untuk hari ini'
      });
    }

    console.log('📋 Penugasan user:', penugasan.nama_penugasan, 'Tipe:', penugasan.tipe_penugasan);

    const [existingPresensi] = await pool.execute(
      'SELECT id, izin_id, jam_masuk, status_masuk FROM presensi WHERE user_id = ? AND tanggal = ?',
      [userId, today]
    );

    if (existingPresensi.length === 0) {
      console.log('⚠️ No presensi record found for today, creating one...');
      await generatePresensiForDate(today);
      
      const [newPresensi] = await pool.execute(
        'SELECT id, izin_id, jam_masuk, status_masuk FROM presensi WHERE user_id = ? AND tanggal = ?',
        [userId, today]
      );
      
      if (newPresensi.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'Gagal membuat record presensi. Silakan hubungi administrator.'
        });
      }
      
      existingPresensi[0] = newPresensi[0];
    }

    if (existingPresensi[0].izin_id) {
      return res.status(400).json({
        success: false,
        message: 'Anda memiliki izin hari ini. Tidak perlu melakukan presensi.'
      });
    }

    if (existingPresensi[0].jam_masuk) {
      return res.status(400).json({
        success: false,
        message: 'Anda sudah melakukan presensi masuk hari ini'
      });
    }

    // VALIDASI RADIUS (hanya untuk penugasan khusus)
    if (penugasan.is_penugasan_khusus && penugasan.latitude && penugasan.longitude) {
      const distance = calculateDistance(
        parseFloat(latitude_masuk),
        parseFloat(longitude_masuk),
        parseFloat(penugasan.latitude),
        parseFloat(penugasan.longitude)
      );

      if (distance > (penugasan.radius || 100)) {
        return res.status(400).json({
          success: false,
          message: `Anda berada di luar radius absensi (${Math.round(distance)}m dari lokasi, maksimal ${penugasan.radius || 100}m)`,
          distance: Math.round(distance),
          max_radius: penugasan.radius || 100
        });
      }
    }

    // VALIDASI WAKTU PRESENSI MASUK
    const jamMasukStandar = penugasan.jam_masuk;
    const batasTerlambat = penugasan.batas_terlambat || jamMasukStandar;
    
    const [jamMasukHour, jamMasukMinute] = jamMasukStandar.split(':').map(Number);
    const [batasTerlambatHour, batasTerlambatMinute] = batasTerlambat.split(':').map(Number);
    
    const jamMasukStandarToday = now.set({ hour: jamMasukHour, minute: jamMasukMinute, second: 0 });
    const batasTerlambatToday = now.set({ hour: batasTerlambatHour, minute: batasTerlambatMinute, second: 0 });
    const batasAwalPresensiToday = jamMasukStandarToday.minus({ hours: 1 });
    const batasAkhirPresensiToday = batasTerlambatToday.plus({ hours: 2 });

    if (now < batasAwalPresensiToday) {
      return res.status(400).json({
        success: false,
        message: `Presensi masuk hanya bisa dilakukan mulai ${batasAwalPresensiToday.toFormat('HH:mm')}`
      });
    }

    if (now > batasAkhirPresensiToday) {
      return res.status(400).json({
        success: false,
        message: `Presensi masuk hanya bisa dilakukan hingga ${batasAkhirPresensiToday.toFormat('HH:mm')}`
      });
    }

    let statusMasuk = 'Tepat Waktu';
    
    if (now > batasTerlambatToday) {
      statusMasuk = 'Terlambat Berat';
    } else if (now > jamMasukStandarToday) {
      statusMasuk = 'Tepat Waktu';
    }

    console.log('✅ Status masuk determined:', statusMasuk);

    const fotoFileName = `masuk_${userId}_${today}_${Date.now()}.jpg`;
    const filePath = path.join(__dirname, '../uploads/presensi', fotoFileName);
    
    const base64Data = foto_masuk.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const uploadDir = path.join(__dirname, '../uploads/presensi');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log('📸 Foto disimpan sebagai:', fotoFileName);

    await pool.execute(
      `UPDATE presensi SET 
        penugasan_id = ?,
        is_penugasan_khusus = ?,
        jam_masuk = ?, 
        foto_masuk = ?, 
        latitude_masuk = ?, 
        longitude_masuk = ?,
        status_masuk = ?,
        keterangan = COALESCE(?, keterangan),
        updated_at = NOW()
       WHERE id = ?`,
      [
        penugasan.id,
        penugasan.is_penugasan_khusus ? 1 : 0,
        now.toFormat('HH:mm:ss'),
        fotoFileName,
        parseFloat(latitude_masuk),
        parseFloat(longitude_masuk),
        statusMasuk,
        keterangan || null,
        existingPresensi[0].id
      ]
    );

    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['PRESENSI_MASUK', `User melakukan presensi masuk - Status: ${statusMasuk} - Penugasan: ${penugasan.nama_penugasan}`, userId]
    );

    console.log('🎉 Presensi masuk berhasil');

    res.json({
      success: true,
      message: 'Presensi masuk berhasil',
      data: {
        id: existingPresensi[0].id,
        tanggal: today,
        jam_masuk: now.toFormat('HH:mm:ss'),
        status_masuk: statusMasuk,
        penugasan: penugasan.nama_penugasan,
        foto_masuk: fotoFileName
      }
    });

  } catch (error) {
    console.error('❌ Presensi masuk error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ PRESENSI PULANG ============

const presensiPulang = async (req, res) => {
  try {
    const userId = req.user.id;
    const { foto_pulang, latitude_pulang, longitude_pulang, keterangan } = req.body;

    console.log('📱 Presensi pulang attempt - User ID:', userId);

    if (!foto_pulang) {
      return res.status(400).json({
        success: false,
        message: 'Foto wajib diambil'
      });
    }

    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    const now = DateTime.now().setZone('Asia/Jakarta');

    console.log('📅 Tanggal pulang:', today, '⏰ Waktu sekarang:', now.toFormat('HH:mm:ss'));

    const hariKerjaInfo = await checkHariKerja(today);
    
    if (!hariKerjaInfo.is_hari_kerja) {
      return res.status(400).json({
        success: false,
        message: `Hari ini bukan hari kerja: ${hariKerjaInfo.keterangan}`
      });
    }

    const penugasan = await getUserPenugasan(userId, today);
    if (!penugasan) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada penugasan aktif untuk hari ini'
      });
    }

    const [presensi] = await pool.execute(
      'SELECT * FROM presensi WHERE user_id = ? AND tanggal = ?',
      [userId, today]
    );

    if (presensi.length === 0 || !presensi[0].jam_masuk) {
      return res.status(400).json({
        success: false,
        message: 'Anda belum melakukan presensi masuk hari ini'
      });
    }

    const izin = await checkUserIzin(userId, today);
    if (izin) {
      return res.status(400).json({
        success: false,
        message: `Anda memiliki izin ${izin.jenis} hari ini. Tidak perlu melakukan presensi pulang.`
      });
    }

    if (presensi[0].jam_pulang) {
      return res.status(400).json({
        success: false,
        message: 'Anda sudah melakukan presensi pulang hari ini'
      });
    }

    if (presensi[0].izin_id) {
      return res.status(400).json({
        success: false,
        message: 'Anda memiliki izin hari ini. Tidak perlu melakukan presensi pulang.'
      });
    }

    // VALIDASI RADIUS (hanya untuk penugasan khusus)
    if (penugasan.is_penugasan_khusus && penugasan.latitude && penugasan.longitude) {
      if (latitude_pulang !== undefined && longitude_pulang !== undefined) {
        const distance = calculateDistance(
          parseFloat(latitude_pulang),
          parseFloat(longitude_pulang),
          parseFloat(penugasan.latitude),
          parseFloat(penugasan.longitude)
        );

        if (distance > (penugasan.radius || 100)) {
          return res.status(400).json({
            success: false,
            message: `Anda berada di luar radius absensi (${Math.round(distance)}m dari lokasi, maksimal ${penugasan.radius || 100}m)`,
            distance: Math.round(distance),
            max_radius: penugasan.radius || 100
          });
        }
      }
    }

    const jamPulangStandar = penugasan.jam_pulang;
    const [pulangHour, pulangMinute] = jamPulangStandar.split(':').map(Number);
    
    const jamPulangStandarToday = now.set({ hour: pulangHour, minute: pulangMinute, second: 0 });
    const batasAwalPulang = jamPulangStandarToday.minus({ hours: 1 });

    if (now < batasAwalPulang) {
      return res.status(400).json({
        success: false,
        message: `Presensi pulang hanya bisa dilakukan mulai ${batasAwalPulang.toFormat('HH:mm')}`
      });
    }

    let statusPulang = 'Tepat Waktu';
    let isLembur = 0;
    let jamLembur = null;

    if (now < jamPulangStandarToday) {
      statusPulang = 'Cepat Pulang';
    } else if (now > jamPulangStandarToday) {
      statusPulang = 'Lembur';
      isLembur = 1;
      
      const diffMinutes = Math.floor(now.diff(jamPulangStandarToday, 'minutes').minutes);
      const lemburHours = Math.floor(diffMinutes / 60);
      const lemburMinutes = diffMinutes % 60;
      jamLembur = `${lemburHours.toString().padStart(2, '0')}:${lemburMinutes.toString().padStart(2, '0')}:00`;
      
      console.log('⏰ Lembur detected:', jamLembur);
    }

    const fotoFileName = `pulang_${userId}_${today}_${Date.now()}.jpg`;
    const filePath = path.join(__dirname, '../uploads/presensi', fotoFileName);
    
    const base64Data = foto_pulang.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const uploadDir = path.join(__dirname, '../uploads/presensi');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log('📸 Foto pulang disimpan sebagai:', fotoFileName);

    await pool.execute(
      `UPDATE presensi SET 
        jam_pulang = ?, 
        foto_pulang = ?, 
        latitude_pulang = ?, 
        longitude_pulang = ?,
        status_pulang = ?, 
        is_lembur = ?, 
        jam_lembur = ?, 
        keterangan = COALESCE(?, keterangan),
        updated_at = NOW()
       WHERE id = ?`,
      [
        now.toFormat('HH:mm:ss'),
        fotoFileName,
        latitude_pulang ? parseFloat(latitude_pulang) : null,
        longitude_pulang ? parseFloat(longitude_pulang) : null,
        statusPulang,
        isLembur,
        jamLembur,
        keterangan || null,
        presensi[0].id
      ]
    );

    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['PRESENSI_PULANG', `User melakukan presensi pulang - Status: ${statusPulang}`, userId]
    );

    console.log('🎉 Presensi pulang berhasil');

    res.json({
      success: true,
      message: 'Presensi pulang berhasil',
      data: {
        id: presensi[0].id,
        jam_pulang: now.toFormat('HH:mm:ss'),
        status_pulang: statusPulang,
        is_lembur: isLembur,
        jam_lembur: jamLembur,
        foto_pulang: fotoFileName
      }
    });

  } catch (error) {
    console.error('❌ Presensi pulang error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ GET PRESENSI HARI INI ============

const getPresensiHariIni = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();

    const [presensi] = await pool.execute(
      `SELECT p.*, u.nama, u.jabatan, i.jenis as jenis_izin,
              pg.nama_penugasan, pg.tipe_penugasan
       FROM presensi p 
       JOIN users u ON p.user_id = u.id 
       LEFT JOIN izin i ON p.izin_id = i.id
       LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
       WHERE p.user_id = ? AND p.tanggal = ?`,
      [userId, today]
    );

    if (presensi.length === 0) {
      const izin = await checkUserIzin(userId, today);
      if (izin) {
        return res.json({
          success: true,
          data: {
            tanggal: today,
            izin_id: izin.id,
            jenis_izin: izin.jenis,
            status_masuk: `Izin ${izin.jenis}`,
            status_pulang: `Izin ${izin.jenis}`,
            keterangan: 'Izin (belum ada presensi record)'
          }
        });
      }
      
      const hariKerjaInfo = await checkHariKerja(today);
      if (hariKerjaInfo.is_hari_kerja) {
        return res.json({
          success: true,
          data: {
            tanggal: today,
            status_masuk: 'Belum Presensi',
            status_pulang: 'Belum Presensi',
            keterangan: 'Belum melakukan presensi',
            is_hari_kerja: true
          }
        });
      } else {
        return res.json({
          success: true,
          data: {
            tanggal: today,
            status_masuk: 'Libur',
            status_pulang: 'Libur',
            keterangan: hariKerjaInfo.keterangan,
            is_hari_kerja: false
          }
        });
      }
    }

    res.json({
      success: true,
      data: presensi[0]
    });

  } catch (error) {
    console.error('Get presensi hari ini error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

// ============ GET PRESENSI USER ============

const getPresensiUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const [presensi] = await pool.execute(
      `SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan,
              i.jenis as jenis_izin, i.status as status_izin,
              pg.nama_penugasan, pg.tipe_penugasan,
              pg.jam_masuk as jam_masuk_standar, pg.jam_pulang as jam_pulang_standar
       FROM presensi p 
       LEFT JOIN users u ON p.user_id = u.id 
       LEFT JOIN izin i ON p.izin_id = i.id
       LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
       WHERE p.user_id = ?
       ORDER BY p.tanggal DESC`,
      [userId]
    );

    const getStatusAkhir = (presensiItem) => {
      if (presensiItem.keterangan && (
          presensiItem.keterangan.includes('PEMUTIHAN') || 
          presensiItem.keterangan.includes('pemutihan') ||
          presensiItem.keterangan.includes('Jangan lupa presensi'))) {
        return 'Hadir (Pemutihan)';
      }
      
      if (presensiItem.izin_id) {
        return presensiItem.jenis_izin === 'sakit' ? 'Sakit' : 'Izin';
      } else if (presensiItem.status_masuk === 'Tanpa Keterangan' || presensiItem.status_pulang === 'Tanpa Keterangan') {
        return 'Tanpa Keterangan';
      } else if (presensiItem.status_masuk === 'Tepat Waktu' && presensiItem.jam_pulang) {
        return 'Hadir';
      } else if (presensiItem.status_masuk && presensiItem.status_masuk.includes('Terlambat')) {
        return 'Terlambat';
      } else if (presensiItem.jam_masuk && !presensiItem.jam_pulang) {
        return 'Belum Pulang';
      } else if (!presensiItem.jam_masuk && !presensiItem.jam_pulang) {
        return 'Tanpa Keterangan';
      }
      return 'Tidak Diketahui';
    };

    const stats = {
      total: presensi.length,
      hadir: 0,
      hadir_pemutihan: 0,
      tepat_waktu: 0,
      terlambat: 0,
      terlambat_berat: 0,
      izin: 0,
      sakit: 0,
      tanpa_keterangan: 0,
      lembur: 0,
      belum_pulang: 0,
      presentase_kehadiran: 0
    };

    const processedPresensi = presensi.map(presensiItem => {
      const processed = { ...presensiItem };
      
      if (processed.status_pulang === 'Cepat Pulang') {
        processed.status_pulang = 'Tanpa Keterangan';
      }
      
      const statusAkhir = getStatusAkhir(processed);
      processed.status_akhir = statusAkhir;
      
      processed.isPemutihan = processed.keterangan && (
        processed.keterangan.includes('PEMUTIHAN') || 
        processed.keterangan.includes('pemutihan') ||
        processed.keterangan.includes('Jangan lupa presensi')
      );
      
      switch (statusAkhir) {
        case 'Hadir':
          stats.hadir++;
          if (processed.status_masuk === 'Tepat Waktu') {
            stats.tepat_waktu++;
          }
          if (processed.is_lembur) {
            stats.lembur++;
          }
          break;
        case 'Hadir (Pemutihan)':
          stats.hadir++;
          stats.hadir_pemutihan++;
          if (processed.status_masuk === 'Tepat Waktu') {
            stats.tepat_waktu++;
          }
          break;
        case 'Terlambat':
          stats.hadir++;
          stats.terlambat++;
          if (processed.status_masuk === 'Terlambat Berat') {
            stats.terlambat_berat++;
          }
          break;
        case 'Izin':
          stats.izin++;
          break;
        case 'Sakit':
          stats.sakit++;
          break;
        case 'Tanpa Keterangan':
          stats.tanpa_keterangan++;
          break;
        case 'Belum Pulang':
          stats.belum_pulang++;
          stats.hadir++;
          break;
      }
      
      if (processed.tanggal) {
        const date = new Date(processed.tanggal);
        processed.bulan = (date.getMonth() + 1).toString().padStart(2, '0');
        processed.tahun = date.getFullYear().toString();
        processed.tanggal_formatted = date.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
        processed.hari_only = date.getDate();
      }
      
      processed.jam_masuk_formatted = processed.jam_masuk ? 
        processed.jam_masuk.split(':').slice(0, 2).join(':') : null;
      processed.jam_pulang_formatted = processed.jam_pulang ? 
        processed.jam_pulang.split(':').slice(0, 2).join(':') : null;
      
      return processed;
    });

    if (stats.total > 0) {
      stats.presentase_kehadiran = Math.round((stats.hadir / stats.total) * 100);
    }

    const monthsData = [
      { value: "", label: "Semua Bulan" },
      { value: "01", label: "Januari" },
      { value: "02", label: "Februari" },
      { value: "03", label: "Maret" },
      { value: "04", label: "April" },
      { value: "05", label: "Mei" },
      { value: "06", label: "Juni" },
      { value: "07", label: "Juli" },
      { value: "08", label: "Agustus" },
      { value: "09", label: "September" },
      { value: "10", label: "Oktober" },
      { value: "11", label: "November" },
      { value: "12", label: "Desember" }
    ];

    const availableYearsSet = new Set();
    processedPresensi.forEach(p => {
      if (p.tahun) {
        availableYearsSet.add(p.tahun);
      }
    });
    
    const availableYears = [
      { value: "", label: "Semua Tahun" },
      ...Array.from(availableYearsSet)
        .sort((a, b) => b - a)
        .map(year => ({ value: year, label: year }))
    ];

    const currentDate = new Date();
    const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const currentYear = currentDate.getFullYear().toString();
    
    const currentMonthData = processedPresensi.filter(p => 
      p.bulan === currentMonth && p.tahun === currentYear
    );

    const currentMonthStats = {
      total: currentMonthData.length,
      hadir: 0,
      hadir_pemutihan: 0,
      tepat_waktu: 0,
      terlambat: 0,
      terlambat_berat: 0,
      izin: 0,
      sakit: 0,
      tanpa_keterangan: 0,
      lembur: 0,
      belum_pulang: 0
    };

    currentMonthData.forEach(p => {
      switch (p.status_akhir) {
        case 'Hadir':
          currentMonthStats.hadir++;
          if (p.status_masuk === 'Tepat Waktu') {
            currentMonthStats.tepat_waktu++;
          }
          if (p.is_lembur) {
            currentMonthStats.lembur++;
          }
          break;
        case 'Hadir (Pemutihan)':
          currentMonthStats.hadir++;
          currentMonthStats.hadir_pemutihan++;
          if (p.status_masuk === 'Tepat Waktu') {
            currentMonthStats.tepat_waktu++;
          }
          break;
        case 'Terlambat':
          currentMonthStats.hadir++;
          currentMonthStats.terlambat++;
          if (p.status_masuk === 'Terlambat Berat') {
            currentMonthStats.terlambat_berat++;
          }
          break;
        case 'Izin':
          currentMonthStats.izin++;
          break;
        case 'Sakit':
          currentMonthStats.sakit++;
          break;
        case 'Tanpa Keterangan':
          currentMonthStats.tanpa_keterangan++;
          break;
        case 'Belum Pulang':
          currentMonthStats.belum_pulang++;
          currentMonthStats.hadir++;
          break;
      }
    });

    res.json({
      success: true,
      data: {
        all_presensi: processedPresensi,
        stats: {
          overall: stats,
          current_month: currentMonthStats
        },
        filters: {
          months: monthsData,
          years: availableYears,
          current_month: currentMonth,
          current_year: currentYear
        },
        current_month_data: currentMonthData
      }
    });

  } catch (error) {
    console.error('Get presensi user error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

// ============ GET PRESENSI USER PER BULAN ============

const getPresensiUserPerBulan = async (req, res) => {
  try {
    const userId = req.user.id;
    
    let { bulan, tahun } = req.query;
    
    console.log('Raw params - Bulan:', bulan, 'Tahun:', tahun);
    
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
      return res.status(400).json({
        success: false,
        message: 'Bulan harus antara 1 dan 12'
      });
    }
    
    if (targetTahun < 2000 || targetTahun > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Tahun tidak valid'
      });
    }
    
    console.log(`📊 Getting presensi for user ${userId} - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);
    
    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();
    
    console.log(`Periode: ${startDate} sampai ${endDate}`);
    
    const [presensi] = await pool.execute(
      `SELECT 
        p.*, 
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        i.jenis as jenis_izin, 
        i.status as status_izin,
        pg.nama_penugasan, 
        pg.tipe_penugasan,
        pg.jam_masuk as jam_masuk_standar, 
        pg.jam_pulang as jam_pulang_standar
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      LEFT JOIN izin i ON p.izin_id = i.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE p.user_id = ? 
        AND p.tanggal BETWEEN ? AND ?
      ORDER BY p.tanggal DESC`,
      [userId, startDate, endDate]
    );
    
    console.log(`Found ${presensi.length} presensi records for this period`);
    
    const getStatusAkhir = (presensiItem) => {
      if (presensiItem.keterangan && (
          presensiItem.keterangan.includes('PEMUTIHAN') || 
          presensiItem.keterangan.includes('pemutihan') ||
          presensiItem.keterangan.includes('Jangan lupa presensi'))) {
        return 'Hadir (Pemutihan)';
      }
      
      if (presensiItem.izin_id) {
        return presensiItem.jenis_izin === 'sakit' ? 'Sakit' : 'Izin';
      } else if (presensiItem.status_masuk === 'Tanpa Keterangan' || presensiItem.status_pulang === 'Tanpa Keterangan') {
        return 'Tanpa Keterangan';
      } else if (presensiItem.status_masuk === 'Tepat Waktu' && presensiItem.jam_pulang) {
        return 'Hadir';
      } else if (presensiItem.status_masuk && presensiItem.status_masuk.includes('Terlambat')) {
        return 'Terlambat';
      } else if (presensiItem.jam_masuk && !presensiItem.jam_pulang) {
        return 'Belum Pulang';
      } else if (!presensiItem.jam_masuk && !presensiItem.jam_pulang) {
        return 'Tanpa Keterangan';
      }
      return 'Tidak Diketahui';
    };
    
    let totalHariKerja = 0;
    const startDateObj = DateTime.fromISO(startDate);
    const endDateObj = DateTime.fromISO(endDate);
    let currentDateLoop = startDateObj;
    
    while (currentDateLoop <= endDateObj) {
      const dateStr = currentDateLoop.toISODate();
      const hariKerjaInfo = await checkHariKerja(dateStr);
      if (hariKerjaInfo.is_hari_kerja) {
        totalHariKerja++;
      }
      currentDateLoop = currentDateLoop.plus({ days: 1 });
    }
    
    console.log(`Total hari kerja di bulan ${targetBulan}/${targetTahun}: ${totalHariKerja}`);
    
    const processedPresensi = presensi.map(presensiItem => {
      const processed = { ...presensiItem };
      
      if (processed.status_pulang === 'Cepat Pulang') {
        processed.status_pulang = 'Tanpa Keterangan';
      }
      
      const statusAkhir = getStatusAkhir(processed);
      processed.status_akhir = statusAkhir;
      
      processed.isPemutihan = processed.keterangan && (
        processed.keterangan.includes('PEMUTIHAN') || 
        processed.keterangan.includes('pemutihan') ||
        processed.keterangan.includes('Jangan lupa presensi')
      );
      
      if (processed.tanggal) {
        const date = new Date(processed.tanggal);
        processed.tanggal_formatted = date.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
        processed.hari_only = date.getDate();
        processed.hari_dalam_minggu = date.toLocaleDateString('id-ID', { weekday: 'long' });
        processed.bulan = (date.getMonth() + 1).toString().padStart(2, '0');
        processed.tahun = date.getFullYear().toString();
      }
      
      processed.jam_masuk_formatted = processed.jam_masuk ? 
        processed.jam_masuk.split(':').slice(0, 2).join(':') : null;
      processed.jam_pulang_formatted = processed.jam_pulang ? 
        processed.jam_pulang.split(':').slice(0, 2).join(':') : null;
      
      return processed;
    });
    
    const stats = {
      total_hari_kerja: totalHariKerja,
      total_presensi: processedPresensi.length,
      hadir: 0,
      hadir_pemutihan: 0,
      tepat_waktu: 0,
      terlambat: 0,
      terlambat_berat: 0,
      izin: 0,
      sakit: 0,
      tanpa_keterangan: 0,
      lembur: 0,
      belum_pulang: 0,
      presentase_kehadiran: 0
    };
    
    processedPresensi.forEach(p => {
      switch (p.status_akhir) {
        case 'Hadir':
          stats.hadir++;
          if (p.status_masuk === 'Tepat Waktu') {
            stats.tepat_waktu++;
          }
          if (p.is_lembur) {
            stats.lembur++;
          }
          break;
        case 'Hadir (Pemutihan)':
          stats.hadir++;
          stats.hadir_pemutihan++;
          if (p.status_masuk === 'Tepat Waktu') {
            stats.tepat_waktu++;
          }
          if (p.is_lembur) {
            stats.lembur++;
          }
          break;
        case 'Terlambat':
          stats.hadir++;
          stats.terlambat++;
          if (p.status_masuk === 'Terlambat Berat') {
            stats.terlambat_berat++;
          }
          if (p.is_lembur) {
            stats.lembur++;
          }
          break;
        case 'Izin':
          stats.izin++;
          break;
        case 'Sakit':
          stats.sakit++;
          break;
        case 'Tanpa Keterangan':
          stats.tanpa_keterangan++;
          break;
        case 'Belum Pulang':
          stats.belum_pulang++;
          stats.hadir++;
          break;
      }
    });
    
    if (totalHariKerja > 0) {
      stats.presentase_kehadiran = Math.round((stats.hadir / totalHariKerja) * 100);
    }
    
    const [availableYearsData] = await pool.execute(
      `SELECT DISTINCT YEAR(tanggal) as tahun 
       FROM presensi 
       WHERE user_id = ? 
       ORDER BY tahun DESC`,
      [userId]
    );
    
    const availableYears = [
      { value: "", label: "Semua Tahun" },
      ...availableYearsData.map(y => ({ value: y.tahun.toString(), label: y.tahun.toString() }))
    ];
    
    const monthsData = [
      { value: "01", label: "Januari" },
      { value: "02", label: "Februari" },
      { value: "03", label: "Maret" },
      { value: "04", label: "April" },
      { value: "05", label: "Mei" },
      { value: "06", label: "Juni" },
      { value: "07", label: "Juli" },
      { value: "08", label: "Agustus" },
      { value: "09", label: "September" },
      { value: "10", label: "Oktober" },
      { value: "11", label: "November" },
      { value: "12", label: "Desember" }
    ];
    
    res.json({
      success: true,
      data: {
        periode: {
          bulan: targetBulan,
          tahun: targetTahun,
          nama_bulan: DateTime.fromObject({ month: targetBulan }).setLocale('id').toFormat('MMMM'),
          start_date: startDate,
          end_date: endDate
        },
        stats: stats,
        presensi: processedPresensi,
        filters: {
          months: monthsData,
          years: availableYears,
          current_month: targetBulan.toString().padStart(2, '0'),
          current_year: targetTahun.toString()
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Get presensi per bulan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ GET ALL PRESENSI (UNTUK ADMIN) ============

const getAllPresensi = async (req, res) => {
  try {
    const { 
      user_id,
      tanggal,
      wilayah,
      status_masuk,
      limit = 100,
      offset = 0 
    } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID wajib diisi'
      });
    }

    let query = `
      SELECT 
        p.*, 
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        i.jenis as jenis_izin, 
        i.status as status_izin,
        pg.nama_penugasan, 
        pg.tipe_penugasan,
        pg.jam_masuk as jam_masuk_standar, 
        pg.jam_pulang as jam_pulang_standar
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      LEFT JOIN izin i ON p.izin_id = i.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE u.is_active = 1
      AND p.user_id = ?
    `;
    
    const params = [user_id];

    if (tanggal) {
      query += ` AND p.tanggal = ?`;
      params.push(tanggal);
    }

    if (wilayah && wilayah !== '') {
      query += ` AND u.wilayah_penugasan = ?`;
      params.push(wilayah);
    }

    if (status_masuk && status_masuk !== '') {
      if (status_masuk === 'Izin') {
        query += ` AND (p.izin_id IS NOT NULL OR p.status_masuk = 'Izin')`;
      } else {
        query += ` AND p.status_masuk = ? AND p.izin_id IS NULL`;
        params.push(status_masuk);
      }
    }

    query += ` ORDER BY p.tanggal DESC`;

    if (limit) {
      query += ` LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));
    }

    console.log('🔍 Query getAllPresensi:', query);
    console.log('📦 Params:', params);

    const [presensi] = await pool.execute(query, params);

    let countQuery = `
      SELECT COUNT(*) as total
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      WHERE u.is_active = 1
      AND p.user_id = ?
    `;
    
    const countParams = [user_id];
    
    if (tanggal) {
      countQuery += ` AND p.tanggal = ?`;
      countParams.push(tanggal);
    }
    if (wilayah && wilayah !== '') {
      countQuery += ` AND u.wilayah_penugasan = ?`;
      countParams.push(wilayah);
    }
    if (status_masuk && status_masuk !== '') {
      if (status_masuk === 'Izin') {
        countQuery += ` AND (p.izin_id IS NOT NULL OR p.status_masuk = 'Izin')`;
      } else {
        countQuery += ` AND p.status_masuk = ? AND p.izin_id IS NULL`;
        countParams.push(status_masuk);
      }
    }

    const [totalCount] = await pool.execute(countQuery, countParams);

    const processedPresensi = presensi.map(item => ({
      ...item,
      jam_masuk_formatted: item.jam_masuk ? item.jam_masuk.substring(0, 5) : null,
      jam_pulang_formatted: item.jam_pulang ? item.jam_pulang.substring(0, 5) : null,
      status_display: item.izin_id ? 'Izin' : (item.status_masuk || 'Tanpa Keterangan'),
      tanggal_formatted: item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) : null,
      hari: item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'long' }) : null
    }));

    res.json({
      success: true,
      data: processedPresensi,
      pagination: {
        total: totalCount[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        returned: presensi.length
      },
      filters: {
        tanggal: tanggal || null,
        wilayah: wilayah || null,
        status_masuk: status_masuk || null
      }
    });

  } catch (error) {
    console.error('❌ Get all presensi error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ GET ALL PRESENSI PER BULAN (UNTUK ADMIN) ============

const getAllPresensiPerBulan = async (req, res) => {
  try {
    if (req.user.roles !== 'admin' && req.user.roles !== 'atasan') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin dan atasan yang dapat mengakses.'
      });
    }

    let { bulan, tahun, wilayah } = req.query;

    if (!bulan || !tahun) {
      return res.status(400).json({
        success: false,
        message: 'Parameter bulan dan tahun wajib diisi'
      });
    }

    const targetBulan = parseInt(bulan);
    const targetTahun = parseInt(tahun);

    if (targetBulan < 1 || targetBulan > 12) {
      return res.status(400).json({
        success: false,
        message: 'Bulan harus antara 1 dan 12'
      });
    }

    if (targetTahun < 2000 || targetTahun > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Tahun tidak valid'
      });
    }

    console.log(`📊 Getting all presensi per bulan - Bulan: ${targetBulan}, Tahun: ${targetTahun}`);

    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();

    let query = `
      SELECT 
        p.*, 
        u.id as user_id,
        u.nama, 
        u.jabatan, 
        u.wilayah_penugasan,
        i.jenis as jenis_izin, 
        i.status as status_izin,
        pg.nama_penugasan, 
        pg.tipe_penugasan,
        DATE_FORMAT(p.tanggal, '%Y-%m-%d') as tanggal,
        DATE_FORMAT(p.tanggal, '%d %M %Y') as tanggal_formatted,
        DATE_FORMAT(p.tanggal, '%W') as hari
      FROM presensi p 
      LEFT JOIN users u ON p.user_id = u.id 
      LEFT JOIN izin i ON p.izin_id = i.id
      LEFT JOIN penugasan pg ON p.penugasan_id = pg.id
      WHERE DATE(p.tanggal) BETWEEN ? AND ?
        AND u.is_active = 1
        AND u.roles = 'pegawai'
    `;
    
    const params = [startDate, endDate];

    if (wilayah && wilayah !== '') {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    query += ' ORDER BY u.nama ASC, p.tanggal DESC';

    console.log('🔍 Query getAllPresensiPerBulan:', query);
    console.log('📦 Params:', params);

    const [presensi] = await pool.execute(query, params);

    console.log(`✅ Found ${presensi.length} presensi records`);

    const processedPresensi = presensi.map(item => ({
      ...item,
      jam_masuk_formatted: item.jam_masuk ? item.jam_masuk.substring(0, 5) : null,
      jam_pulang_formatted: item.jam_pulang ? item.jam_pulang.substring(0, 5) : null,
      status_display: item.izin_id ? 'Izin' : (item.status_masuk || 'Tanpa Keterangan'),
      tanggal_formatted: item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) : null,
      hari: item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'long' }) : null
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
    
    pegawaiQuery += ' ORDER BY nama ASC';
    
    const [pegawaiList] = await pool.execute(pegawaiQuery, pegawaiParams);
    
    const rekapPerPegawai = pegawaiList.map(pegawai => {
      const presensiPegawai = processedPresensi.filter(p => p.user_id === pegawai.id);
      
      let hadir = 0;
      let terlambat = 0;
      let izin = 0;
      let tanpaKeterangan = 0;
      
      presensiPegawai.forEach(p => {
        if (p.izin_id) {
          izin++;
        } else if (!p.jam_masuk || p.status_masuk === 'Tanpa Keterangan') {
          tanpaKeterangan++;
        } else if (p.status_masuk === 'Tepat Waktu') {
          hadir++;
        } else if (p.status_masuk === 'Terlambat' || p.status_masuk === 'Terlambat Berat') {
          terlambat++;
          hadir++;
        } else {
          hadir++;
        }
      });
      
      const totalHariLapor = presensiPegawai.length;
      const persenKehadiran = totalHariKerja > 0 ? Math.round((totalHariLapor / totalHariKerja) * 100) : 0;
      
      return {
        id: pegawai.id,
        nama: pegawai.nama,
        jabatan: pegawai.jabatan,
        wilayah: pegawai.wilayah_penugasan,
        total_hari_lapor: totalHariLapor,
        total_hadir: hadir,
        total_terlambat: terlambat,
        total_izin: izin,
        total_tanpa_keterangan: tanpaKeterangan,
        persen_kehadiran: persenKehadiran
      };
    });
    
    const totalPegawai = pegawaiList.length;
    const totalSudahLapor = rekapPerPegawai.filter(p => p.total_hari_lapor > 0).length;
    const totalHadir = rekapPerPegawai.filter(p => p.total_hadir > 0).length;
    const totalTerlambat = rekapPerPegawai.filter(p => p.total_terlambat > 0).length;
    const totalIzin = rekapPerPegawai.filter(p => p.total_izin > 0).length;
    const totalTanpaKeterangan = rekapPerPegawai.filter(p => p.total_tanpa_keterangan > 0).length;
    
    const wilayahStatistik = {};
    rekapPerPegawai.forEach(pegawai => {
      const wilayahName = pegawai.wilayah || 'Unknown';
      if (!wilayahStatistik[wilayahName]) {
        wilayahStatistik[wilayahName] = {
          total_pegawai: 0,
          total_hadir: 0,
          total_terlambat: 0,
          total_izin: 0,
          total_tanpa_keterangan: 0,
          persen_hadir: 0
        };
      }
      wilayahStatistik[wilayahName].total_pegawai++;
      if (pegawai.total_hadir > 0) wilayahStatistik[wilayahName].total_hadir++;
      if (pegawai.total_terlambat > 0) wilayahStatistik[wilayahName].total_terlambat++;
      if (pegawai.total_izin > 0) wilayahStatistik[wilayahName].total_izin++;
      if (pegawai.total_tanpa_keterangan > 0) wilayahStatistik[wilayahName].total_tanpa_keterangan++;
    });
    
    Object.keys(wilayahStatistik).forEach(wilayahName => {
      const stats = wilayahStatistik[wilayahName];
      const total = stats.total_pegawai;
      if (total > 0) {
        stats.persen_hadir = Math.round((stats.total_hadir / total) * 100);
        stats.persen_terlambat = Math.round((stats.total_terlambat / total) * 100);
        stats.persen_izin = Math.round((stats.total_izin / total) * 100);
        stats.persen_tanpa_keterangan = Math.round((stats.total_tanpa_keterangan / total) * 100);
      }
    });
    
    const chartData = {
      labels: rekapPerPegawai.map(p => p.nama),
      datasets: [
        {
          label: 'Kehadiran (%)',
          data: rekapPerPegawai.map(p => p.persen_kehadiran),
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderColor: 'rgb(34, 197, 94)',
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
          total_hadir: totalHadir,
          total_terlambat: totalTerlambat,
          total_izin: totalIzin,
          total_tanpa_keterangan: totalTanpaKeterangan,
          persen_kehadiran: totalPegawai > 0 ? Math.round((totalSudahLapor / totalPegawai) * 100) : 0,
          wilayah: wilayahStatistik
        },
        charts: chartData,
        rekap_per_pegawai: rekapPerPegawai,
        all_presensi: processedPresensi,
        pagination: {
          total: processedPresensi.length,
          returned: processedPresensi.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Get all presensi per bulan error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ GET REKAP PRESENSI ============

const getRekapPresensi = async (req, res) => {
  try {
    const { bulan, tahun, wilayah } = req.query;

    const currentDate = DateTime.now().setZone('Asia/Jakarta');
    const targetBulan = bulan || currentDate.month;
    const targetTahun = tahun || currentDate.year;

    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromISO(startDate).endOf('month').toISODate();

    let query = `
      SELECT 
        u.id as user_id,
        u.nama,
        u.jabatan,
        u.wilayah_penugasan,
        COUNT(p.id) as total_presensi,
        SUM(CASE WHEN p.status_masuk = 'Tepat Waktu' THEN 1 ELSE 0 END) as tepat_waktu,
        SUM(CASE WHEN p.status_masuk LIKE 'Terlambat%' THEN 1 ELSE 0 END) as terlambat,
        SUM(CASE WHEN p.status_masuk = 'Tanpa Keterangan' THEN 1 ELSE 0 END) as tanpa_keterangan,
        SUM(CASE WHEN p.izin_id IS NOT NULL THEN 1 ELSE 0 END) as izin,
        SUM(CASE WHEN p.is_lembur = 1 THEN 1 ELSE 0 END) as lembur
      FROM users u
      LEFT JOIN presensi p ON u.id = p.user_id AND p.tanggal BETWEEN ? AND ?
      WHERE u.is_active = 1 AND u.roles = 'pegawai'
    `;
    const params = [startDate, endDate];

    if (wilayah) {
      query += ' AND u.wilayah_penugasan = ?';
      params.push(wilayah);
    }

    query += ' GROUP BY u.id, u.nama, u.jabatan, u.wilayah_penugasan ORDER BY u.nama';

    const [rekap] = await pool.execute(query, params);

    res.json({
      success: true,
      data: {
        rekap,
        periode: {
          bulan: targetBulan,
          tahun: targetTahun,
          start_date: startDate,
          end_date: endDate,
          nama_bulan: DateTime.fromObject({ month: targetBulan }).setLocale('id').toFormat('MMMM')
        }
      }
    });

  } catch (error) {
    console.error('Get rekap presensi error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

// ============ FUNGSI UNTUK ADMIN (GENERATE) ============

const generatePresensiManualAPI = async (req, res) => {
  try {
    const { tanggal, force_update = false } = req.body;
    const targetDate = tanggal || DateTime.now().setZone('Asia/Jakarta').toISODate();

    if (!DateTime.fromISO(targetDate).isValid) {
      return res.status(400).json({
        success: false,
        message: 'Format tanggal tidak valid. Gunakan format: YYYY-MM-DD'
      });
    }

    console.log('👨‍💼 Admin manual generate request for date:', targetDate);
    const result = await generatePresensiForDate(targetDate);

    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['ADMIN_GENERATE_PRESENSI', `Admin generate presensi untuk ${targetDate}`, req.user.id]
    );

    res.json({
      success: true,
      message: `Berhasil generate ${result.generated_count} presensi baru dan update ${result.updated_count} presensi untuk tanggal ${targetDate}`,
      data: result
    });

  } catch (error) {
    console.error('Admin generate error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const generatePresensiHariIniAPI = async (req, res) => {
  try {
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    console.log('🚨 Emergency generate request for today:', today);
    
    const result = await generatePresensiForDate(today);

    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['EMERGENCY_GENERATE', `Emergency generate presensi hari ini ${today}`, req.user?.id || 1]
    );

    res.json({
      success: true,
      message: `Berhasil generate ${result.generated_count} presensi untuk hari ini`,
      data: result
    });

  } catch (error) {
    console.error('Emergency generate error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal generate presensi hari ini',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const generatePresensiRangeAPI = async (req, res) => {
  try {
    const { start_date, end_date, force_update = false } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Start date dan end date wajib diisi'
      });
    }

    if (!DateTime.fromISO(start_date).isValid || !DateTime.fromISO(end_date).isValid) {
      return res.status(400).json({
        success: false,
        message: 'Format tanggal tidak valid. Gunakan format: YYYY-MM-DD'
      });
    }

    console.log('👨‍💼 Admin manual generate range request:', start_date, 'to', end_date);
    
    const result = await generatePresensiForDateRange(start_date, end_date);

    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['ADMIN_GENERATE_PRESENSI_RANGE', `Admin generate presensi untuk range ${start_date} hingga ${end_date}`, req.user.id]
    );

    res.json({
      success: true,
      message: `Berhasil generate presensi untuk ${result.total_dates} hari. ${result.success_count} berhasil, ${result.failed_count} gagal.`,
      data: result
    });

  } catch (error) {
    console.error('Admin generate range error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getSystemStatus = async (req, res) => {
  try {
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    const tomorrow = DateTime.now().setZone('Asia/Jakarta').plus({ days: 1 }).toISODate();
    const yesterday = DateTime.now().setZone('Asia/Jakarta').minus({ days: 1 }).toISODate();
    
    const [todayCount] = await pool.execute(
      'SELECT COUNT(*) as total FROM presensi WHERE tanggal = ?',
      [today]
    );
    
    const [tomorrowCount] = await pool.execute(
      'SELECT COUNT(*) as total FROM presensi WHERE tanggal = ?',
      [tomorrow]
    );
    
    const [yesterdayCount] = await pool.execute(
      'SELECT COUNT(*) as total FROM presensi WHERE tanggal = ?',
      [yesterday]
    );
    
    const [activeUsers] = await pool.execute(
      'SELECT COUNT(*) as total FROM users WHERE is_active = 1 AND roles = "pegawai"'
    );
    
    const [lastCron] = await pool.execute(
      `SELECT event_type, description, created_at FROM system_log 
       WHERE event_type LIKE '%GENERATE%' OR event_type LIKE '%UPDATE%' OR event_type LIKE '%CRON%'
       ORDER BY created_at DESC LIMIT 1`
    );
    
    const hariKerjaInfo = await checkHariKerja(today);
    
    const [todayStats] = await pool.execute(
      `SELECT 
        SUM(CASE WHEN status_masuk = 'Tepat Waktu' THEN 1 ELSE 0 END) as tepat_waktu,
        SUM(CASE WHEN status_masuk LIKE 'Terlambat%' THEN 1 ELSE 0 END) as terlambat,
        SUM(CASE WHEN status_masuk = 'Tanpa Keterangan' THEN 1 ELSE 0 END) as tanpa_keterangan,
        SUM(CASE WHEN izin_id IS NOT NULL THEN 1 ELSE 0 END) as izin,
        COUNT(*) as total
       FROM presensi 
       WHERE tanggal = ?`,
      [today]
    );
    
    res.json({
      success: true,
      data: {
        system_info: {
          tanggal_sekarang: today,
          waktu_server: DateTime.now().setZone('Asia/Jakarta').toFormat('yyyy-MM-dd HH:mm:ss'),
          timezone: 'Asia/Jakarta'
        },
        presensi_stats: {
          hari_ini: {
            total: todayCount[0].total,
            tepat_waktu: todayStats[0]?.tepat_waktu || 0,
            terlambat: todayStats[0]?.terlambat || 0,
            tanpa_keterangan: todayStats[0]?.tanpa_keterangan || 0,
            izin: todayStats[0]?.izin || 0
          },
          kemarin: yesterdayCount[0].total,
          besok: tomorrowCount[0].total
        },
        user_info: {
          total_pegawai_aktif: activeUsers[0].total
        },
        hari_kerja: {
          is_hari_kerja: hariKerjaInfo.is_hari_kerja,
          keterangan: hariKerjaInfo.keterangan,
          source: hariKerjaInfo.source
        },
        cron_job: {
          last_activity: lastCron[0] || null,
          status: 'Running',
          schedules: [
            { time: '00:01', description: 'Generate presensi hari ini' },
            { time: '08:00', description: 'Morning check' },
            { time: '20:00', description: 'Early update Tanpa Keterangan' },
            { time: '23:59', description: 'End of day update' },
            { time: '01:00 Monday', description: 'Generate for next week' }
          ]
        }
      }
    });
    
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting system status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const fixPresensiData = async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Start date dan end date wajib diisi'
      });
    }

    console.log(`🔄 Fixing presensi data dari ${start_date} hingga ${end_date}`);

    const [presensiList] = await pool.execute(
      `SELECT p.id, p.user_id, p.tanggal, p.izin_id, p.status_masuk, i.jenis as jenis_izin, i.status as status_izin
       FROM presensi p
       LEFT JOIN izin i ON p.izin_id = i.id
       WHERE p.tanggal BETWEEN ? AND ?`,
      [start_date, end_date]
    );

    let fixedCount = 0;
    let skippedCount = 0;

    for (const presensi of presensiList) {
      try {
        const izin = await checkUserIzin(presensi.user_id, presensi.tanggal);

        if (izin && !presensi.izin_id) {
          await pool.execute(
            `UPDATE presensi SET 
              izin_id = ?,
              status_masuk = ?,
              status_pulang = ?,
              keterangan = COALESCE(CONCAT(keterangan, ' - Fixed: Izin ${izin.jenis}'), 'Fixed: Izin ${izin.jenis}'),
              updated_at = NOW()
             WHERE id = ?`,
            [
              izin.id,
              `Izin ${izin.jenis}`,
              `Izin ${izin.jenis}`,
              presensi.id
            ]
          );
          fixedCount++;
          console.log(`✅ Fixed presensi ${presensi.id} dengan izin ${izin.jenis}`);
        } 
        else if (!izin && presensi.izin_id && presensi.status_izin !== 'Disetujui') {
          await pool.execute(
            `UPDATE presensi SET 
              izin_id = NULL,
              status_masuk = 'Tanpa Keterangan',
              status_pulang = 'Tanpa Keterangan',
              keterangan = COALESCE(CONCAT(keterangan, ' - Fixed: Izin tidak disetujui'), 'Fixed: Izin tidak disetujui'),
              updated_at = NOW()
             WHERE id = ?`,
            [presensi.id]
          );
          fixedCount++;
          console.log(`🔄 Fixed presensi ${presensi.id}: hapus izin tidak disetujui`);
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Error fixing presensi ${presensi.id}:`, error.message);
      }
    }

    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['FIX_PRESENSI_DATA', `Fixed ${fixedCount} presensi records, ${skippedCount} skipped untuk periode ${start_date} hingga ${end_date}`, req.user?.id || 1]
    );

    res.json({
      success: true,
      message: `Berhasil memperbaiki ${fixedCount} data presensi`,
      data: {
        fixed_count: fixedCount,
        skipped_count: skippedCount,
        total_checked: presensiList.length,
        periode: { start_date, end_date }
      }
    });

  } catch (error) {
    console.error('❌ Fix presensi data error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const generatePresensiOtomatis = async (req, res) => {
  try {
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    const result = await generatePresensiForDate(today);
    
    await pool.execute(
      'INSERT INTO system_log (event_type, description, user_id) VALUES (?, ?, ?)',
      ['GENERATE_PRESENSI_OTOMATIS', `System generate presensi otomatis untuk ${today}`, req.user?.id || 1]
    );
    
    res.json({
      success: true,
      message: `Berhasil generate ${result.generated_count} presensi`,
      data: result
    });
  } catch (error) {
    console.error('Generate presensi otomatis error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

const getGenerateStats = async (req, res) => {
  try {
    const { bulan, tahun } = req.query;

    const currentDate = DateTime.now().setZone('Asia/Jakarta');
    const targetBulan = bulan || currentDate.month;
    const targetTahun = tahun || currentDate.year;

    const startDate = `${targetTahun}-${targetBulan.toString().padStart(2, '0')}-01`;
    const endDate = DateTime.fromObject({ 
      year: targetTahun, 
      month: targetBulan 
    }).endOf('month').toISODate();

    const [generateStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_generated,
        SUM(CASE WHEN is_system_generated = 1 THEN 1 ELSE 0 END) as system_generated,
        SUM(CASE WHEN izin_id IS NOT NULL THEN 1 ELSE 0 END) as dengan_izin,
        SUM(CASE WHEN izin_id IS NULL AND status_masuk = 'Tanpa Keterangan' THEN 1 ELSE 0 END) as tanpa_keterangan
       FROM presensi 
       WHERE tanggal BETWEEN ? AND ? AND is_system_generated = 1`,
      [startDate, endDate]
    );

    const [hariKerjaStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_hari,
        SUM(CASE WHEN hl.id IS NOT NULL THEN 1 ELSE 0 END) as hari_libur,
        SUM(CASE WHEN hk.id IS NOT NULL AND hk.is_hari_kerja = 1 THEN 1 ELSE 0 END) as hari_kerja_khusus,
        SUM(CASE WHEN hl.id IS NULL AND hk.id IS NULL AND DAYOFWEEK(dates.tanggal) BETWEEN 2 AND 6 THEN 1 ELSE 0 END) as hari_kerja_normal
       FROM (
         SELECT DATE_ADD(?, INTERVAL seq.seq DAY) as tanggal
         FROM (
           SELECT 0 as seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
           UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
           UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
           UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
           UNION SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24
           UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29
           UNION SELECT 30
         ) seq
         WHERE DATE_ADD(?, INTERVAL seq.seq DAY) <= ?
       ) dates
       LEFT JOIN hari_libur hl ON dates.tanggal = hl.tanggal
       LEFT JOIN hari_kerja hk ON dates.tanggal = hk.tanggal`,
      [startDate, startDate, endDate]
    );

    const [generateLogs] = await pool.execute(
      `SELECT event_type, description, created_at 
       FROM system_log 
       WHERE event_type IN ('GENERATE_PRESENSI', 'ADMIN_GENERATE_PRESENSI', 'EMERGENCY_GENERATE', 'FIX_PRESENSI_DATA', 'UPDATE_PRESENSI_END_DAY')
       AND created_at BETWEEN ? AND ?
       ORDER BY created_at DESC 
       LIMIT 10`,
      [startDate, endDate]
    );

    res.json({
      success: true,
      data: {
        periode: {
          bulan: parseInt(targetBulan),
          tahun: parseInt(targetTahun),
          nama_bulan: DateTime.fromObject({ month: targetBulan }).setLocale('id').toFormat('MMMM'),
          start_date: startDate,
          end_date: endDate
        },
        generate_stats: generateStats[0] || {},
        hari_kerja_stats: hariKerjaStats[0] || {},
        recent_activities: generateLogs
      }
    });

  } catch (error) {
    console.error('Get generate stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

// ============ GET USER PENUGASAN AKTIF ============

const getUserPenugasanAktif = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = DateTime.now().setZone('Asia/Jakarta').toISODate();
    
    const penugasan = await getUserPenugasan(userId, today);
    
    if (!penugasan) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ada penugasan aktif'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: penugasan.id,
        nama_penugasan: penugasan.nama_penugasan,
        tipe_penugasan: penugasan.tipe_penugasan,
        jam_masuk: penugasan.jam_masuk,
        jam_pulang: penugasan.jam_pulang,
        toleransi_keterlambatan: penugasan.toleransi_keterlambatan,
        batas_terlambat: penugasan.batas_terlambat,
        latitude: penugasan.latitude,
        longitude: penugasan.longitude,
        radius: penugasan.radius,
        alamat: penugasan.alamat,
        is_penugasan_khusus: penugasan.is_penugasan_khusus
      }
    });
  } catch (error) {
    console.error('Get user penugasan aktif error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

// dashboardController.js

const getDashboardKehadiran = async (req, res) => {
  try {
    // Hanya admin dan atasan yang bisa akses
    if (req.user.roles !== 'admin' && req.user.roles !== 'atasan') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin dan atasan yang dapat mengakses.'
      });
    }

    const { tanggal } = req.query;
    
    // Default ke hari ini jika tidak ada tanggal
    let targetDate;
    if (tanggal && tanggal !== '') {
      targetDate = DateTime.fromISO(tanggal);
      if (!targetDate.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Format tanggal tidak valid. Gunakan format: YYYY-MM-DD'
        });
      }
    } else {
      targetDate = DateTime.now().setZone('Asia/Jakarta');
    }
    
    const targetDateStr = targetDate.toISODate();
    console.log(`📅 Dashboard Kehadiran untuk tanggal: ${targetDateStr}`);

    // 1. Ambil semua pegawai aktif
    const [allPegawai] = await pool.execute(
      `SELECT id, nama, jabatan, wilayah_penugasan 
       FROM users 
       WHERE is_active = 1 
       ORDER BY wilayah_penugasan, nama`,
      []
    );

    const totalPegawai = allPegawai.length;
    console.log(`Total pegawai aktif: ${totalPegawai}`);

    // 2. Ambil semua presensi hari ini
    const [presensiHariIni] = await pool.execute(
      `SELECT p.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM presensi p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.tanggal = ?
       ORDER BY u.wilayah_penugasan, u.nama`,
      [targetDateStr]
    );

    // 3. Ambil semua izin yang aktif pada tanggal tersebut (status Disetujui)
    const [izinAktif] = await pool.execute(
      `SELECT i.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM izin i 
       JOIN users u ON i.user_id = u.id 
       WHERE i.status = 'Disetujui'
         AND u.is_active = 1
         AND DATE(?) BETWEEN DATE(i.tanggal_mulai) AND DATE(i.tanggal_selesai)
       ORDER BY u.wilayah_penugasan, u.nama`,
      [targetDateStr]
    );

    // 4. Ambil semua laporan kinerja hari ini
    const [kinerjaHariIni] = await pool.execute(
      `SELECT k.*, u.nama, u.jabatan, u.wilayah_penugasan
       FROM kinerja_harian k 
       JOIN users u ON k.user_id = u.id 
       WHERE DATE(k.tanggal) = ?
         AND u.is_active = 1
       ORDER BY u.wilayah_penugasan, u.nama`,
      [targetDateStr]
    );

    // Buat mapping untuk memudahkan pengecekan
    const presensiMap = new Map();
    presensiHariIni.forEach(p => {
      presensiMap.set(p.user_id, p);
    });

    const izinMap = new Map();
    izinAktif.forEach(i => {
      izinMap.set(i.user_id, i);
    });

    const kinerjaMap = new Map();
    kinerjaHariIni.forEach(k => {
      kinerjaMap.set(k.user_id, k);
    });

    // Hitung statistik dan kumpulkan detail pegawai
    let belumHadir = [];
    let izinList = [];
    let belumLapor = [];
    let sudahHadirDanLapor = [];

    for (const pegawai of allPegawai) {
      const userId = pegawai.id;
      const hasPresensi = presensiMap.has(userId);
      const hasIzin = izinMap.has(userId);
      const hasKinerja = kinerjaMap.has(userId);

      if (hasIzin) {
        // Pegawai izin
        const izinData = izinMap.get(userId);
        izinList.push({
          id: pegawai.id,
          nama: pegawai.nama,
          jabatan: pegawai.jabatan,
          wilayah: pegawai.wilayah_penugasan,
          jenis_izin: izinData.jenis,
          tanggal_mulai: izinData.tanggal_mulai,
          tanggal_selesai: izinData.tanggal_selesai,
          keterangan: izinData.keterangan,
          status_absen: `Izin ${izinData.jenis}`,
          status_lapor: 'Tidak perlu lapor (izin)'
        });
      } else if (!hasPresensi) {
        // Pegawai belum hadir (tidak presensi dan tidak izin)
        belumHadir.push({
          id: pegawai.id,
          nama: pegawai.nama,
          jabatan: pegawai.jabatan,
          wilayah: pegawai.wilayah_penugasan,
          status_absen: 'Belum Presensi',
          status_lapor: hasKinerja ? 'Sudah lapor' : 'Belum lapor',
          catatan: 'Belum melakukan absensi hari ini'
        });
      } else if (hasPresensi && !hasKinerja) {
        // Pegawai sudah hadir tapi belum lapor kinerja
        const presensiData = presensiMap.get(userId);
        belumLapor.push({
          id: pegawai.id,
          nama: pegawai.nama,
          jabatan: pegawai.jabatan,
          wilayah: pegawai.wilayah_penugasan,
          waktu_masuk: presensiData.jam_masuk,
          status_absen: 'Sudah presensi',
          status_lapor: 'Belum lapor kinerja',
          catatan: 'Sudah absen tetapi belum mengisi laporan kinerja'
        });
      } else if (hasPresensi && hasKinerja) {
        // Pegawai sudah hadir dan sudah lapor
        const presensiData = presensiMap.get(userId);
        const kinerjaData = kinerjaMap.get(userId);
        sudahHadirDanLapor.push({
          id: pegawai.id,
          nama: pegawai.nama,
          jabatan: pegawai.jabatan,
          wilayah: pegawai.wilayah_penugasan,
          waktu_masuk: presensiData.jam_masuk,
          ruas_jalan: kinerjaData.ruas_jalan,
          kegiatan: kinerjaData.kegiatan,
          status_absen: 'Hadir',
          status_lapor: 'Sudah lapor'
        });
      } else if (hasPresensi && hasIzin) {
        // Kasus khusus: punya presensi tapi juga izin (prioritaskan izin)
        const izinData = izinMap.get(userId);
        izinList.push({
          id: pegawai.id,
          nama: pegawai.nama,
          jabatan: pegawai.jabatan,
          wilayah: pegawai.wilayah_penugasan,
          jenis_izin: izinData.jenis,
          status_absen: `Izin ${izinData.jenis} (tetap presensi)`,
          status_lapor: hasKinerja ? 'Sudah lapor' : 'Belum lapor',
          catatan: 'Memiliki izin tetapi tetap melakukan presensi'
        });
      }
    }

    // Hitung statistik berdasarkan wilayah
    const wilayahStatistik = {};
    
    // Inisialisasi wilayah statistik
    allPegawai.forEach(pegawai => {
      const wilayah = pegawai.wilayah_penugasan || 'Tidak ada wilayah';
      if (!wilayahStatistik[wilayah]) {
        wilayahStatistik[wilayah] = {
          total: 0,
          belum_hadir: 0,
          izin: 0,
          belum_lapor: 0,
          sudah_hadir_lapor: 0,
          daftar_belum_hadir: [],
          daftar_izin: [],
          daftar_belum_lapor: []
        };
      }
      wilayahStatistik[wilayah].total++;
    });

    // Isi data ke wilayah statistik
    belumHadir.forEach(pegawai => {
      const wilayah = pegawai.wilayah || 'Tidak ada wilayah';
      if (wilayahStatistik[wilayah]) {
        wilayahStatistik[wilayah].belum_hadir++;
        wilayahStatistik[wilayah].daftar_belum_hadir.push(pegawai);
      }
    });

    izinList.forEach(pegawai => {
      const wilayah = pegawai.wilayah || 'Tidak ada wilayah';
      if (wilayahStatistik[wilayah]) {
        wilayahStatistik[wilayah].izin++;
        wilayahStatistik[wilayah].daftar_izin.push(pegawai);
      }
    });

    belumLapor.forEach(pegawai => {
      const wilayah = pegawai.wilayah || 'Tidak ada wilayah';
      if (wilayahStatistik[wilayah]) {
        wilayahStatistik[wilayah].belum_lapor++;
        wilayahStatistik[wilayah].daftar_belum_lapor.push(pegawai);
      }
    });

    sudahHadirDanLapor.forEach(pegawai => {
      const wilayah = pegawai.wilayah || 'Tidak ada wilayah';
      if (wilayahStatistik[wilayah]) {
        wilayahStatistik[wilayah].sudah_hadir_lapor++;
      }
    });

    // Response data
    res.json({
      success: true,
      data: {
        tanggal: targetDateStr,
        tanggal_formatted: targetDate.toFormat('dd MMMM yyyy'),
        hari: targetDate.toFormat('EEEE'),
        
        // Ringkasan statistik
        ringkasan: {
          total_pegawai: totalPegawai,
          belum_hadir: belumHadir.length,
          izin: izinList.length,
          belum_lapor: belumLapor.length,
          sudah_hadir_lapor: sudahHadirDanLapor.length,
          persen_kehadiran: totalPegawai > 0 ? Math.round(((totalPegawai - belumHadir.length) / totalPegawai) * 100) : 0,
          persen_lapor: totalPegawai > 0 ? Math.round((sudahHadirDanLapor.length / totalPegawai) * 100) : 0
        },
        
        // Detail per wilayah
        wilayah: wilayahStatistik,
        
        // Daftar detail pegawai
        daftar_pegawai: {
          belum_hadir: belumHadir,
          izin: izinList,
          belum_lapor: belumLapor,
          sudah_hadir_lapor: sudahHadirDanLapor
        },
        
        // Data untuk chart
        charts: {
          kehadiran: {
            labels: ['Hadir', 'Tidak Hadir (Izin)', 'Tidak Hadir (Tanpa Izin)'],
            datasets: [{
              data: [
                sudahHadirDanLapor.length + belumLapor.length, // hadir (sudah lapor + belum lapor)
                izinList.length, // izin
                belumHadir.length // tidak hadir tanpa izin
              ],
              backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
              borderColor: ['#0DA675', '#D97706', '#DC2626'],
              borderWidth: 1
            }]
          },
          laporan: {
            labels: ['Sudah Lapor', 'Belum Lapor', 'Izin (Tidak wajib lapor)'],
            datasets: [{
              data: [
                sudahHadirDanLapor.length,
                belumLapor.length,
                izinList.length + belumHadir.length
              ],
              backgroundColor: ['#3B82F6', '#F59E0B', '#9CA3AF'],
              borderColor: ['#2563EB', '#D97706', '#6B7280'],
              borderWidth: 1
            }]
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Get dashboard kehadiran error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Endpoint khusus untuk mendapatkan daftar pegawai yang belum absen dengan detail
const getDaftarBelumAbsen = async (req, res) => {
  try {
    if (req.user.roles !== 'admin' && req.user.roles !== 'atasan') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin dan atasan yang dapat mengakses.'
      });
    }

    const { tanggal, wilayah } = req.query;
    
    let targetDate;
    if (tanggal && tanggal !== '') {
      targetDate = DateTime.fromISO(tanggal);
    } else {
      targetDate = DateTime.now().setZone('Asia/Jakarta');
    }
    
    const targetDateStr = targetDate.toISODate();

    // Ambil semua pegawai aktif
    let pegawaiQuery = `
      SELECT id, nama, jabatan, wilayah_penugasan 
      FROM users 
      WHERE is_active = 1
    `;
    const params = [];
    
    if (wilayah && wilayah !== '') {
      pegawaiQuery += ` AND wilayah_penugasan = ?`;
      params.push(wilayah);
    }
    
    pegawaiQuery += ` ORDER BY wilayah_penugasan, nama`;
    
    const [allPegawai] = await pool.execute(pegawaiQuery, params);
    
    // Ambil presensi hari ini
    const [presensiHariIni] = await pool.execute(
      `SELECT user_id FROM presensi WHERE tanggal = ?`,
      [targetDateStr]
    );
    
    // Ambil izin aktif
    const [izinAktif] = await pool.execute(
      `SELECT user_id, jenis FROM izin 
       WHERE status = 'Disetujui'
         AND DATE(?) BETWEEN DATE(tanggal_mulai) AND DATE(tanggal_selesai)`,
      [targetDateStr]
    );
    
    const presensiSet = new Set(presensiHariIni.map(p => p.user_id));
    const izinSet = new Set(izinAktif.map(i => i.user_id));
    
    // Filter pegawai yang belum absen (tidak presensi dan tidak izin)
    const belumAbsen = allPegawai.filter(pegawai => 
      !presensiSet.has(pegawai.id) && !izinSet.has(pegawai.id)
    );
    
    // Kelompokkan berdasarkan wilayah
    const byWilayah = {};
    belumAbsen.forEach(pegawai => {
      const wilayahName = pegawai.wilayah_penugasan || 'Tidak ada wilayah';
      if (!byWilayah[wilayahName]) {
        byWilayah[wilayahName] = [];
      }
      byWilayah[wilayahName].push({
        nama: pegawai.nama,
        jabatan: pegawai.jabatan,
        id: pegawai.id
      });
    });
    
    res.json({
      success: true,
      data: {
        tanggal: targetDateStr,
        tanggal_formatted: targetDate.toFormat('dd MMMM yyyy'),
        total_belum_absen: belumAbsen.length,
        total_pegawai: allPegawai.length,
        persentase: allPegawai.length > 0 ? Math.round((belumAbsen.length / allPegawai.length) * 100) : 0,
        by_wilayah: byWilayah,
        daftar_pegawai: belumAbsen.map(p => ({
          nama: p.nama,
          jabatan: p.jabatan,
          wilayah: p.wilayah_penugasan,
          status: 'Belum melakukan absensi hari ini',
          id: p.id
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Get daftar belum absen error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};


// ============ EKSPOR MODULE ============

module.exports = {
  // Fungsi utama presensi
  presensiMasuk,
  presensiPulang,
  getPresensiHariIni,
  getPresensiUser,
  getPresensiUserPerBulan,
  getAllPresensi,
  getAllPresensiPerBulan,
  getRekapPresensi,
  
  // Fungsi generate yang sudah ada
  generatePresensiForDate,
  generatePresensiHariIniOnStartup,
  updatePresensiStatusAkhirHari,
  checkAndUpdateIzinPresensi,
  
  // Fungsi generate untuk admin
  generatePresensiManual: generatePresensiManualAPI,
  generatePresensiHariIni: generatePresensiHariIniAPI,
  generatePresensiRange: generatePresensiRangeAPI,
  updateTanpaKeteranganEarly,
  generatePresensiForDateRange,
  
  // Fungsi legacy (untuk compatibility)
  generatePresensiOtomatis,
  fixPresensiData,
  getGenerateStats,
  
  // Helper functions
  checkHariKerja,
  checkUserIzin,
  
  // Setup cron
  setupPresensiCronJobs,
  
  // System functions
  getSystemStatus,
  
  // Tambahan
  getUserPenugasanAktif,
   getDashboardKehadiran,
  getDaftarBelumAbsen
};