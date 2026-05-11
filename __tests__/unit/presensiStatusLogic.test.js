describe('Presensi Status Logic - Unit Tests', () => {
  
  // Helper untuk menentukan status berdasarkan waktu
  const determineStatusMasuk = (jamMasuk, jamStandar, batasTerlambat) => {
    if (!jamMasuk) return 'Belum Presensi';
    
    const [masukHour, masukMinute] = jamMasuk.split(':').map(Number);
    const [standarHour, standarMinute] = jamStandar.split(':').map(Number);
    const [batasHour, batasMinute] = batasTerlambat.split(':').map(Number);
    
    const masukTotal = masukHour * 60 + masukMinute;
    const standarTotal = standarHour * 60 + standarMinute;
    const batasTotal = batasHour * 60 + batasMinute;
    
    if (masukTotal <= standarTotal) return 'Tepat Waktu';
    if (masukTotal <= batasTotal) return 'Tepat Waktu'; // masih toleransi
    return 'Terlambat Berat';
  };

  const determineStatusPulang = (jamPulang, jamStandar) => {
    if (!jamPulang) return 'Belum Pulang';
    
    const [pulangHour, pulangMinute] = jamPulang.split(':').map(Number);
    const [standarHour, standarMinute] = jamStandar.split(':').map(Number);
    
    const pulangTotal = pulangHour * 60 + pulangMinute;
    const standarTotal = standarHour * 60 + standarMinute;
    
    if (pulangTotal < standarTotal - 60) return 'Cepat Pulang';
    if (pulangTotal <= standarTotal + 30) return 'Tepat Waktu';
    return 'Lembur';
  };

  // ============ TEST STATUS MASUK ============
  describe('determineStatusMasuk', () => {
    const jamStandar = '08:00';
    const batasTerlambat = '08:15';

    it('Tepat Waktu jika masuk sebelum jam standar', () => {
      expect(determineStatusMasuk('07:55', jamStandar, batasTerlambat)).toBe('Tepat Waktu');
      expect(determineStatusMasuk('08:00', jamStandar, batasTerlambat)).toBe('Tepat Waktu');
    });

    it('Tepat Waktu jika masuk masih dalam batas toleransi', () => {
      expect(determineStatusMasuk('08:10', jamStandar, batasTerlambat)).toBe('Tepat Waktu');
      expect(determineStatusMasuk('08:15', jamStandar, batasTerlambat)).toBe('Tepat Waktu');
    });

    it('Terlambat Berat jika melebihi batas toleransi', () => {
      expect(determineStatusMasuk('08:16', jamStandar, batasTerlambat)).toBe('Terlambat Berat');
      expect(determineStatusMasuk('09:00', jamStandar, batasTerlambat)).toBe('Terlambat Berat');
    });

    it('Belum Presensi jika tidak ada jam masuk', () => {
      expect(determineStatusMasuk(null, jamStandar, batasTerlambat)).toBe('Belum Presensi');
    });
  });

  // ============ TEST STATUS PULANG ============
  describe('determineStatusPulang', () => {
    const jamStandar = '17:00';

    it('Cepat Pulang jika pulang lebih dari 1 jam sebelum standar', () => {
      expect(determineStatusPulang('15:59', jamStandar)).toBe('Cepat Pulang');
      expect(determineStatusPulang('15:00', jamStandar)).toBe('Cepat Pulang');
    });

    it('Tepat Waktu jika pulang dalam rentang 1 jam sebelum sampai 30 menit setelah', () => {
      expect(determineStatusPulang('16:01', jamStandar)).toBe('Tepat Waktu');
      expect(determineStatusPulang('17:00', jamStandar)).toBe('Tepat Waktu');
      expect(determineStatusPulang('17:30', jamStandar)).toBe('Tepat Waktu');
    });

    it('Lembur jika pulang lebih dari 30 menit setelah jam standar', () => {
      expect(determineStatusPulang('17:31', jamStandar)).toBe('Lembur');
      expect(determineStatusPulang('18:00', jamStandar)).toBe('Lembur');
      expect(determineStatusPulang('20:00', jamStandar)).toBe('Lembur');
    });

    it('Belum Pulang jika tidak ada jam pulang', () => {
      expect(determineStatusPulang(null, jamStandar)).toBe('Belum Pulang');
    });
  });
});