describe('Kinerja Dashboard Logic - Unit Tests', () => {
  
  describe('Perhitungan Hari Kerja', () => {
    const getHariKerjaCount = (tahun, bulan) => {
      const lastDay = new Date(tahun, bulan, 0).getDate();
      let count = 0;
      for (let i = 1; i <= lastDay; i++) {
        const date = new Date(tahun, bulan - 1, i);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          count++;
        }
      }
      return count;
    };

    it('Januari 2024 harus memiliki 23 hari kerja', () => {
      const hariKerja = getHariKerjaCount(2024, 1);
      expect(hariKerja).toBe(23);
    });

    it('Februari 2024 harus memiliki 21 hari kerja', () => {
      const hariKerja = getHariKerjaCount(2024, 2);
      expect(hariKerja).toBe(21);
    });

    it('Desember 2024 harus memiliki 22 hari kerja', () => {
      const hariKerja = getHariKerjaCount(2024, 12);
      expect(hariKerja).toBe(22);
    });
  });

  describe('Klasifikasi Status Kehadiran Harian', () => {
    const getStatusKehadiran = (presensi, laporan, isWeekend, isFuture) => {
      if (isWeekend) return { status: 'Libur', warna: 'gray' };
      if (isFuture) return { status: 'Belum Terjadi', warna: 'gray' };
      if (presensi?.jam_masuk) {
        if (presensi.status_masuk === 'Terlambat') {
          return { status: 'Terlambat', warna: 'yellow' };
        }
        return { status: 'Hadir Tepat Waktu', warna: 'green' };
      }
      if (presensi?.izin_id) {
        const ket = (presensi.keterangan || '').toLowerCase();
        if (ket.includes('sakit')) return { status: 'Sakit', warna: 'purple' };
        if (ket.includes('cuti')) return { status: 'Cuti', warna: 'pink' };
        return { status: 'Izin', warna: 'blue' };
      }
      if (laporan) return { status: 'Hadir (Laporan Kinerja)', warna: 'orange' };
      return { status: 'Tanpa Keterangan', warna: 'red' };
    };

    it('Libur di weekend', () => {
      const result = getStatusKehadiran(null, null, true, false);
      expect(result.status).toBe('Libur');
      expect(result.warna).toBe('gray');
    });

    it('Hadir Tepat Waktu jika ada jam_masuk dan status Tepat Waktu', () => {
      const presensi = { jam_masuk: '08:00', status_masuk: 'Tepat Waktu' };
      const result = getStatusKehadiran(presensi, null, false, false);
      expect(result.status).toBe('Hadir Tepat Waktu');
      expect(result.warna).toBe('green');
    });

    it('Terlambat jika ada jam_masuk dan status Terlambat', () => {
      const presensi = { jam_masuk: '08:30', status_masuk: 'Terlambat' };
      const result = getStatusKehadiran(presensi, null, false, false);
      expect(result.status).toBe('Terlambat');
      expect(result.warna).toBe('yellow');
    });

    it('Sakit jika ada izin dengan keterangan sakit', () => {
      const presensi = { izin_id: 1, keterangan: 'Sakit' };
      const result = getStatusKehadiran(presensi, null, false, false);
      expect(result.status).toBe('Sakit');
      expect(result.warna).toBe('purple');
    });

    it('Hadir dari laporan jika tidak ada presensi tapi ada laporan', () => {
      const result = getStatusKehadiran(null, { id: 1 }, false, false);
      expect(result.status).toBe('Hadir (Laporan Kinerja)');
      expect(result.warna).toBe('orange');
    });

    it('Tanpa Keterangan jika tidak ada presensi, laporan, dan hari kerja', () => {
      const result = getStatusKehadiran(null, null, false, false);
      expect(result.status).toBe('Tanpa Keterangan');
      expect(result.warna).toBe('red');
    });
  });

  describe('Perhitungan Rekomendasi', () => {
    const generateRekomendasi = (pencapaianKR, pencapaianTotal, persenKehadiran, totalTerlambat) => {
      const rekomendasi = [];
      
      if (pencapaianKR < 60) {
        rekomendasi.push({ type: 'volume_kerja', pesan: 'Perlu meningkatkan volume pekerjaan KR' });
      }
      
      if (pencapaianTotal < 80) {
        rekomendasi.push({ type: 'target', pesan: 'Target harian belum tercapai' });
      }
      
      if (persenKehadiran < 80) {
        rekomendasi.push({ type: 'kehadiran', pesan: 'Tingkatkan konsistensi kehadiran' });
      }
      
      if (totalTerlambat > 3) {
        rekomendasi.push({ type: 'keterlambatan', pesan: 'Usahakan datang tepat waktu' });
      }
      
      if (rekomendasi.length === 0) {
        rekomendasi.push({ type: 'pertahankan', pesan: 'Pertahankan prestasi Anda!' });
      }
      
      return rekomendasi;
    };

    it('Rekomendasi volume kerja jika pencapaian KR < 60%', () => {
      const rekomendasi = generateRekomendasi(50, 90, 95, 2);
      expect(rekomendasi.some(r => r.type === 'volume_kerja')).toBe(true);
    });

    it('Rekomendasi target jika pencapaian total < 80%', () => {
      const rekomendasi = generateRekomendasi(70, 75, 95, 2);
      expect(rekomendasi.some(r => r.type === 'target')).toBe(true);
    });

    it('Rekomendasi kehadiran jika persen kehadiran < 80%', () => {
      const rekomendasi = generateRekomendasi(90, 95, 75, 2);
      expect(rekomendasi.some(r => r.type === 'kehadiran')).toBe(true);
    });

    it('Rekomendasi keterlambatan jika terlambat > 3 kali', () => {
      const rekomendasi = generateRekomendasi(90, 95, 95, 5);
      expect(rekomendasi.some(r => r.type === 'keterlambatan')).toBe(true);
    });

    it('Rekomendasi pertahankan jika semua target tercapai', () => {
      const rekomendasi = generateRekomendasi(90, 90, 90, 1);
      expect(rekomendasi[0].type).toBe('pertahankan');
    });
  });
});