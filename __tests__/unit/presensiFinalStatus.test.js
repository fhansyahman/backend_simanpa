describe('Presensi Final Status Logic - Unit Tests', () => {
  
  const getStatusAkhir = (presensiItem) => {
    // Logika dari getPresensiUser
    if (presensiItem.keterangan && presensiItem.keterangan.includes('PEMUTIHAN')) {
      return 'Hadir (Pemutihan)';
    }
    
    if (presensiItem.izin_id) {
      return presensiItem.jenis_izin === 'sakit' ? 'Sakit' : 'Izin';
    }
    
    if (presensiItem.status_masuk === 'Tanpa Keterangan' || 
        presensiItem.status_pulang === 'Tanpa Keterangan') {
      return 'Tanpa Keterangan';
    }
    
    if (presensiItem.status_masuk === 'Tepat Waktu' && presensiItem.jam_pulang) {
      return 'Hadir';
    }
    
    if (presensiItem.status_masuk && presensiItem.status_masuk.includes('Terlambat')) {
      return 'Terlambat';
    }
    
    if (presensiItem.jam_masuk && !presensiItem.jam_pulang) {
      return 'Belum Pulang';
    }
    
    if (!presensiItem.jam_masuk && !presensiItem.jam_pulang) {
      return 'Tanpa Keterangan';
    }
    
    return 'Tidak Diketahui';
  };

  it('Hadir (Pemutihan) jika keterangan mengandung PEMUTIHAN', () => {
    const presensi = {
      keterangan: 'PEMUTIHAN - Jangan lupa presensi',
      jam_masuk: '08:00',
      jam_pulang: '17:00'
    };
    expect(getStatusAkhir(presensi)).toBe('Hadir (Pemutihan)');
  });

  it('Sakit jika memiliki izin sakit', () => {
    const presensi = {
      izin_id: 1,
      jenis_izin: 'sakit'
    };
    expect(getStatusAkhir(presensi)).toBe('Sakit');
  });

  it('Izin jika memiliki izin selain sakit', () => {
    const presensi = {
      izin_id: 1,
      jenis_izin: 'cuti'
    };
    expect(getStatusAkhir(presensi)).toBe('Izin');
  });

  it('Tanpa Keterangan jika status_masuk = Tanpa Keterangan', () => {
    const presensi = {
      status_masuk: 'Tanpa Keterangan',
      jam_masuk: null
    };
    expect(getStatusAkhir(presensi)).toBe('Tanpa Keterangan');
  });

  it('Hadir jika tepat waktu dan sudah pulang', () => {
    const presensi = {
      status_masuk: 'Tepat Waktu',
      jam_pulang: '17:00',
      izin_id: null
    };
    expect(getStatusAkhir(presensi)).toBe('Hadir');
  });

  it('Terlambat jika status_masuk mengandung Terlambat', () => {
    const presensi = {
      status_masuk: 'Terlambat Berat',
      jam_pulang: '17:00',
      izin_id: null
    };
    expect(getStatusAkhir(presensi)).toBe('Terlambat');
  });

  it('Belum Pulang jika sudah masuk tapi belum pulang', () => {
    const presensi = {
      jam_masuk: '08:00',
      jam_pulang: null,
      izin_id: null
    };
    expect(getStatusAkhir(presensi)).toBe('Belum Pulang');
  });
});