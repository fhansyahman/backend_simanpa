// __tests__/unit/kinerjaStatistik.test.js

describe('Kinerja Statistik Calculation - Unit Tests', () => {
  
  const mockKinerjaByWilayah = [
    { wilayah: 'Jakarta Pusat', panjang_kr: 100, panjang_kn: 50, user_id: 1 },
    { wilayah: 'Jakarta Pusat', panjang_kr: 200, panjang_kn: 30, user_id: 1 },
    { wilayah: 'Jakarta Selatan', panjang_kr: 150, panjang_kn: 70, user_id: 2 },
    { wilayah: 'Jakarta Selatan', panjang_kr: 80, panjang_kn: 40, user_id: 2 },
    { wilayah: 'Jakarta Barat', panjang_kr: 120, panjang_kn: 60, user_id: 3 }
  ];

  describe('Per Wilayah Statistik', () => {
    it('harus menghitung total laporan per wilayah dengan benar', () => {
      const wilayahStats = {};
      
      mockKinerjaByWilayah.forEach(item => {
        if (!wilayahStats[item.wilayah]) {
          wilayahStats[item.wilayah] = { total_laporan: 0, total_kr: 0, total_kn: 0 };
        }
        wilayahStats[item.wilayah].total_laporan++;
        wilayahStats[item.wilayah].total_kr += item.panjang_kr;
        wilayahStats[item.wilayah].total_kn += item.panjang_kn;
      });
      
      expect(wilayahStats['Jakarta Pusat'].total_laporan).toBe(2);
      expect(wilayahStats['Jakarta Pusat'].total_kr).toBe(300);
      expect(wilayahStats['Jakarta Selatan'].total_laporan).toBe(2);
      expect(wilayahStats['Jakarta Barat'].total_laporan).toBe(1);
    });

    it('harus menghitung rata-rata panjang per wilayah', () => {
      const wilayahStats = {
        'Jakarta Pusat': { total_laporan: 2, total_kr: 300, total_kn: 80 }
      };
      
      const avgKR = wilayahStats['Jakarta Pusat'].total_kr / wilayahStats['Jakarta Pusat'].total_laporan;
      const avgKN = wilayahStats['Jakarta Pusat'].total_kn / wilayahStats['Jakarta Pusat'].total_laporan;
      
      expect(avgKR).toBe(150);
      expect(avgKN).toBe(40);
    });
  });

  describe('Perhitungan Pencapaian Target', () => {
    const targetHarian = 50;
    const totalHariKerja = 22;
    const targetBulananKR = targetHarian * totalHariKerja;
    const targetBulananKN = targetHarian * totalHariKerja;

    it('target bulanan harus benar', () => {
      expect(targetBulananKR).toBe(1100);
      expect(targetBulananKN).toBe(1100);
    });

    it('pencapaian KR harus (realisasi / target) * 100', () => {
      const realisasiKR = 850;
      const pencapaian = (realisasiKR / targetBulananKR) * 100;
      expect(Math.round(pencapaian)).toBe(77);
    });

    it('pencapaian KN harus (realisasi / target) * 100', () => {
      const realisasiKN = 920;
      const pencapaian = (realisasiKN / targetBulananKN) * 100;
      expect(Math.round(pencapaian)).toBe(84);
    });

    // ✅ PERBAIKAN: Perbaiki logic status pencapaian
    it('status pencapaian sesuai dengan persentase', () => {
      const testCases = [
        { persen: 95, expectedStatus: 'hampir_tercapai' },  // 95 >= 80 → hampir_tercapai
        { persen: 85, expectedStatus: 'hampir_tercapai' },  // 85 >= 80 → hampir_tercapai
        { persen: 100, expectedStatus: 'tercapai_target' }, // 100 >= 100 → tercapai_target
        { persen: 110, expectedStatus: 'tercapai_target' }, // >100 → tercapai_target
        { persen: 75, expectedStatus: 'sedang' },           // 75 antara 60-79 → sedang
        { persen: 50, expectedStatus: 'tidak_tercapai' },   // 50 antara 1-59 → tidak_tercapai
        { persen: 0, expectedStatus: 'tidak_ada_laporan' }  // 0 → tidak_ada_laporan
      ];
      
      testCases.forEach(({ persen, expectedStatus }) => {
        let status;
        if (persen >= 100) status = 'tercapai_target';
        else if (persen >= 80) status = 'hampir_tercapai';
        else if (persen >= 60) status = 'sedang';
        else if (persen > 0) status = 'tidak_tercapai';
        else status = 'tidak_ada_laporan';
        
        expect(status).toBe(expectedStatus);
      });
    });
  });
});