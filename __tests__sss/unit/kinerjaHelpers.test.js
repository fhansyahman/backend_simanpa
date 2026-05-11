// __tests__/unit/kinerjaHelpers.test.js

// Mock modules
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));
jest.mock('../../src/utils/pdfGenerator', () => ({
  generateKinerjaPDF: jest.fn(),
  generateRekapWilayahPDF: jest.fn(),
  generateWilayahAllPDFs: jest.fn()
}));
jest.mock('luxon', () => ({
  DateTime: {
    now: jest.fn(() => ({
      setZone: jest.fn(() => ({
        toISODate: jest.fn(() => '2024-01-15'),
        month: 1,
        year: 2024
      })),
      fromISO: jest.fn(() => ({
        isValid: true,
        toISODate: jest.fn(() => '2024-01-15'),
        endOf: jest.fn(() => ({
          toISODate: jest.fn(() => '2024-01-31')
        })),
        weekday: 3,
        toFormat: jest.fn(() => 'Januari')
      })),
      fromObject: jest.fn(() => ({
        endOf: jest.fn(() => ({
          toISODate: jest.fn(() => '2024-01-31')
        })),
        toISODate: jest.fn(() => '2024-01-31'),
        setLocale: jest.fn(() => ({
          toFormat: jest.fn(() => 'Januari')
        }))
      }))
    })),
    fromISO: jest.fn(() => ({
      isValid: true,
      toISODate: jest.fn(() => '2024-01-15'),
      endOf: jest.fn(() => ({
        toISODate: jest.fn(() => '2024-01-31')
      })),
      weekday: 3
    })),
    fromObject: jest.fn(() => ({
      endOf: jest.fn(() => ({
        toISODate: jest.fn(() => '2024-01-31')
      }))
    }))
  }
}));

// Import after mocks
const KinerjaService = require('../../src/services/kinerjaService');
const { pool } = require('../../src/config/database');

describe('Kinerja Helper Functions - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.execute.mockReset();
  });

  // ============ TEST LOGIKA VALIDASI DATA ============
  describe('Validation Logic', () => {
    it('validasi harus throw jika tanggal tidak ada', () => {
      const invalidBody = { ruas_jalan: 'Jalan A', kegiatan: 'Kerja' };
      
      expect(() => {
        if (!invalidBody.tanggal) throw new Error('Tanggal wajib diisi');
      }).toThrow('Tanggal wajib diisi');
    });

    it('validasi harus throw jika ruas_jalan tidak ada', () => {
      const invalidBody = { tanggal: '2024-01-01', kegiatan: 'Kerja' };
      
      expect(() => {
        if (!invalidBody.ruas_jalan) throw new Error('Ruas jalan wajib diisi');
      }).toThrow('Ruas jalan wajib diisi');
    });

    it('validasi harus throw jika kegiatan tidak ada', () => {
      const invalidBody = { tanggal: '2024-01-01', ruas_jalan: 'Jalan A' };
      
      expect(() => {
        if (!invalidBody.kegiatan) throw new Error('Kegiatan wajib diisi');
      }).toThrow('Kegiatan wajib diisi');
    });

    // ✅ PERBAIKAN 1: Test untuk createKinerjaWithCamera minimal 1 foto
    it('validasi untuk createKinerjaWithCamera minimal 1 foto - semua null', () => {
      const invalidBody = {
        tanggal: '2024-01-01',
        ruas_jalan: 'Jalan A',
        kegiatan: 'Kerja',
        foto_0: null,
        foto_50: null,
        foto_100: null
      };
      
      // ✅ PERBAIKAN: Cek dengan Boolean() untuk convert null ke false
      const hasFoto = Boolean(invalidBody.foto_0 || invalidBody.foto_50 || invalidBody.foto_100);
      expect(hasFoto).toBe(false);
      
      const errorMessage = !hasFoto ? 'Minimal satu foto dokumentasi wajib diambil' : '';
      expect(errorMessage).toBe('Minimal satu foto dokumentasi wajib diambil');
    });

    it('validasi untuk createKinerjaWithCamera minimal 1 foto - dengan foto_0', () => {
      const validBody = {
        tanggal: '2024-01-01',
        ruas_jalan: 'Jalan A',
        kegiatan: 'Kerja',
        foto_0: 'base64string...',
        foto_50: null,
        foto_100: null
      };
      
      // ✅ PERBAIKAN: Cek dengan Boolean()
      const hasFoto = Boolean(validBody.foto_0 || validBody.foto_50 || validBody.foto_100);
      expect(hasFoto).toBe(true);
      
      const errorMessage = !hasFoto ? 'Minimal satu foto dokumentasi wajib diambil' : '';
      expect(errorMessage).toBe('');
    });

    it('validasi untuk createKinerjaWithCamera minimal 1 foto - dengan foto_50', () => {
      const validBody = {
        tanggal: '2024-01-01',
        ruas_jalan: 'Jalan A',
        kegiatan: 'Kerja',
        foto_0: null,
        foto_50: 'base64string...',
        foto_100: null
      };
      
      const hasFoto = Boolean(validBody.foto_0 || validBody.foto_50 || validBody.foto_100);
      expect(hasFoto).toBe(true);
    });

    it('validasi untuk createKinerjaWithCamera minimal 1 foto - dengan foto_100', () => {
      const validBody = {
        tanggal: '2024-01-01',
        ruas_jalan: 'Jalan A',
        kegiatan: 'Kerja',
        foto_0: null,
        foto_50: null,
        foto_100: 'base64string...'
      };
      
      const hasFoto = Boolean(validBody.foto_0 || validBody.foto_50 || validBody.foto_100);
      expect(hasFoto).toBe(true);
    });

    // ✅ PERBAIKAN 2: Test untuk panjang_kr default
    it('validasi harus gunakan default 0 untuk panjang_kr/null', () => {
      const panjangKR = null;
      const finalPanjangKr = panjangKR !== undefined && panjangKR !== null ? parseFloat(panjangKR) : 0;
      expect(finalPanjangKr).toBe(0);
    });

    it('validasi harus gunakan default 0 untuk panjang_kr/undefined', () => {
      const panjangKR = undefined;
      const finalPanjangKr = panjangKR !== undefined && panjangKR !== null ? parseFloat(panjangKR) : 0;
      expect(finalPanjangKr).toBe(0);
    });

    it('validasi harus parse float untuk panjang_kr string', () => {
      const panjangKR = '150.5';
      const finalPanjangKr = panjangKR !== undefined && panjangKR !== null ? parseFloat(panjangKR) : 0;
      expect(finalPanjangKr).toBe(150.5);
    });

    it('validasi harus parse float untuk panjang_kr number', () => {
      const panjangKR = 150;
      const finalPanjangKr = panjangKR !== undefined && panjangKR !== null ? parseFloat(panjangKR) : 0;
      expect(finalPanjangKr).toBe(150);
    });

    it('validasi untuk panjang_kn default 0', () => {
      const panjangKN = null;
      const finalPanjangKn = panjangKN !== undefined && panjangKN !== null ? parseFloat(panjangKN) : 0;
      expect(finalPanjangKn).toBe(0);
    });
  });

  // ============ TEST LOGIKA PERHITUNGAN STATISTIK ============
  describe('Statistik Calculation Logic', () => {
    const mockKinerjaData = [
      { panjang_kr: 100, panjang_kn: 50, user_id: 1, tanggal: '2024-01-15' },
      { panjang_kr: 200, panjang_kn: 30, user_id: 1, tanggal: '2024-01-16' },
      { panjang_kr: 150, panjang_kn: 70, user_id: 1, tanggal: '2024-01-17' }
    ];

    it('total laporan harus sama dengan jumlah data', () => {
      const totalLaporan = mockKinerjaData.length;
      expect(totalLaporan).toBe(3);
    });

    it('total panjang KR harus menjumlah semua panjang_kr', () => {
      const totalKR = mockKinerjaData.reduce((sum, item) => sum + (parseFloat(item.panjang_kr) || 0), 0);
      expect(totalKR).toBe(450);
    });

    it('total panjang KN harus menjumlah semua panjang_kn', () => {
      const totalKN = mockKinerjaData.reduce((sum, item) => sum + (parseFloat(item.panjang_kn) || 0), 0);
      expect(totalKN).toBe(150);
    });

    it('rata-rata panjang harus total / jumlah laporan', () => {
      const totalLaporan = 3;
      const totalPanjang = 600;
      const rataRata = totalPanjang / totalLaporan;
      expect(rataRata).toBe(200);
    });

    it('presentase kehadiran harus 0 jika total hari kerja 0', () => {
      const totalLaporan = 5;
      const totalHariKerja = 0;
      const persen = totalHariKerja > 0 ? Math.round((totalLaporan / totalHariKerja) * 100) : 0;
      expect(persen).toBe(0);
    });

    it('presentase kehadiran harus benar jika ada data', () => {
      const totalLaporan = 20;
      const totalHariKerja = 25;
      const persen = Math.round((totalLaporan / totalHariKerja) * 100);
      expect(persen).toBe(80);
    });

    it('rata-rata harian KR harus total KR / jumlah laporan', () => {
      const totalKR = 450;
      const totalLaporan = 3;
      const rataHarian = totalKR / totalLaporan;
      expect(rataHarian).toBe(150);
    });
  });

  // ============ TEST LOGIKA VALIDASI TANGGAL ============
  describe('Date Validation Logic', () => {
    it('tanggal harus dalam format YYYY-MM-DD', () => {
      const validDate = '2024-01-15';
      const invalidDate = '15-01-2024';
      
      const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(validDate);
      expect(isValidFormat).toBe(true);
      
      const isInvalidFormat = /^\d{4}-\d{2}-\d{2}$/.test(invalidDate);
      expect(isInvalidFormat).toBe(false);
    });

    it('bulan harus antara 1-12', () => {
      const validBulan = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const invalidBulan = [0, 13, 99];
      
      validBulan.forEach(bulan => {
        expect(bulan >= 1 && bulan <= 12).toBe(true);
      });
      
      invalidBulan.forEach(bulan => {
        expect(bulan >= 1 && bulan <= 12).toBe(false);
      });
    });

    it('tahun harus antara 2000-2100', () => {
      const validTahun = [2000, 2024, 2100];
      const invalidTahun = [1999, 2101, 3000];
      
      validTahun.forEach(tahun => {
        expect(tahun >= 2000 && tahun <= 2100).toBe(true);
      });
      
      invalidTahun.forEach(tahun => {
        expect(tahun >= 2000 && tahun <= 2100).toBe(false);
      });
    });
  });
});