const { pool } = require('../config/database');
const path = require('path');
const fs = require('fs');
const { DateTime } = require('luxon');

// Import dari jamKerjaController (SAMA PERSIS DENGAN KODE ASLI)
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

// ============ LANJUTKAN DENGAN SEMUA FUNGSI LAINNYA (presensiPulang, getPresensiHariIni, dll) ============
// ... (kode selanjutnya sama persis dengan aslinya)

// AKHIR DARI FILE, ekspor module
module.exports = {
  presensiMasuk,
  presensiPulang,
  getPresensiHariIni,
  getPresensiUser,
  getPresensiUserPerBulan,
  getAllPresensi,
  getAllPresensiPerBulan,
  getRekapPresensi,
  generatePresensiForDate,
  generatePresensiHariIniOnStartup,
  updatePresensiStatusAkhirHari,
  checkAndUpdateIzinPresensi,
  generatePresensiManual,
  generatePresensiHariIni,
  generatePresensiRange,
  updateTanpaKeteranganEarly,
  generatePresensiForDateRange,
  generatePresensiOtomatis,
  fixPresensiData,
  getGenerateStats,
  checkHariKerja,
  checkUserIzin,
  setupPresensiCronJobs,
  getSystemStatus,
  getUserPenugasanAktif,
  getDashboardKehadiran,
  getDaftarBelumAbsen
};