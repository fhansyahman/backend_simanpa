// Mock dependencies
jest.mock('../../src/models/presensiModel', () => ({
  getUserIzinByTanggal: jest.fn(),
  getHariKerjaByTanggal: jest.fn(),
  getHariLiburByTanggal: jest.fn(),
  getIzinDetail: jest.fn(),
  getPresensiByUserAndDate: jest.fn(),
  checkExistingPresensi: jest.fn(),
  getAllActiveUsers: jest.fn(),
  getPresensiForDate: jest.fn(),
  insertPresensiWithIzin: jest.fn(),
  insertPresensiNoStatus: jest.fn(),
  updatePresensiWithIzin: jest.fn(),
  updatePresensiPenugasan: jest.fn(),
  insertSystemLog: jest.fn()
}));

// Mock console.error untuk suppress output saat test
global.console = {
  ...console,
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn()
};

// Import setelah mock
const { checkHariKerja, checkUserIzin } = require('../../src/services/presensiService');
const PresensiModel = require('../../src/models/presensiModel');

describe('Presensi Helper Functions - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============ TEST checkHariKerja ============
  describe('checkHariKerja', () => {
    const testDate = '2024-01-15';

    it('harus return true jika tanggal terdaftar sebagai hari kerja', async () => {
      PresensiModel.getHariKerjaByTanggal.mockResolvedValue([{
        tanggal: testDate,
        is_hari_kerja: 1,
        keterangan: 'Libur nasional diganti kerja'
      }]);

      const result = await checkHariKerja(testDate);

      expect(result.is_hari_kerja).toBe(true);
      expect(result.source).toBe('hari_kerja');
      expect(result.keterangan).toBe('Libur nasional diganti kerja');
    });

    it('harus return false jika tanggal terdaftar sebagai hari libur', async () => {
      PresensiModel.getHariKerjaByTanggal.mockResolvedValue([]);
      PresensiModel.getHariLiburByTanggal.mockResolvedValue([{
        tanggal: testDate,
        nama_libur: 'Tahun Baru'
      }]);

      const result = await checkHariKerja(testDate);

      expect(result.is_hari_kerja).toBe(false);
      expect(result.source).toBe('hari_libur');
      expect(result.keterangan).toContain('Libur: Tahun Baru');
    });

    it('harus return true untuk weekday (Senin-Jumat) jika bukan libur', async () => {
      PresensiModel.getHariKerjaByTanggal.mockResolvedValue([]);
      PresensiModel.getHariLiburByTanggal.mockResolvedValue([]);

      const result = await checkHariKerja('2024-01-15'); // Senin

      expect(result.is_hari_kerja).toBe(true);
      expect(result.source).toBe('default');
    });

    it('harus return false untuk weekend (Sabtu-Minggu)', async () => {
      PresensiModel.getHariKerjaByTanggal.mockResolvedValue([]);
      PresensiModel.getHariLiburByTanggal.mockResolvedValue([]);

      const result = await checkHariKerja('2024-01-14'); // Minggu

      expect(result.is_hari_kerja).toBe(false);
      expect(result.source).toBe('default');
      expect(result.keterangan).toBe('Weekend');
    });

    it('harus handle error dengan return false', async () => {
      PresensiModel.getHariKerjaByTanggal.mockRejectedValue(new Error('DB Error'));

      const result = await checkHariKerja(testDate);

      expect(result.is_hari_kerja).toBe(false);
      expect(result.source).toBe('error');
      expect(result.keterangan).toBe('Error menentukan hari kerja');
      // Verify console.error dipanggil
      expect(console.error).toHaveBeenCalled();
    });
  });

  // ============ TEST checkUserIzin ============
  describe('checkUserIzin', () => {
    const userId = 1;
    const testDate = '2024-01-15';

    it('harus return izin jika user memiliki izin disetujui pada tanggal tersebut', async () => {
      const mockIzin = { id: 10, jenis: 'sakit', status: 'Disetujui' };
      PresensiModel.getUserIzinByTanggal.mockResolvedValue([mockIzin]);

      const result = await checkUserIzin(userId, testDate);

      expect(result).toEqual(mockIzin);
      expect(PresensiModel.getUserIzinByTanggal).toHaveBeenCalledWith(userId, testDate);
    });

    it('harus return null jika user tidak memiliki izin', async () => {
      PresensiModel.getUserIzinByTanggal.mockResolvedValue([]);

      const result = await checkUserIzin(userId, testDate);

      expect(result).toBeNull();
    });

    it('harus return null jika terjadi error', async () => {
      PresensiModel.getUserIzinByTanggal.mockRejectedValue(new Error('DB Error'));

      const result = await checkUserIzin(userId, testDate);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });
});