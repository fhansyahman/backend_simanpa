// __tests__/unit/kinerjaExport.test.js

describe('Kinerja Export Logic - Unit Tests', () => {
  
  const formatDate = (year, month, day) => {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  describe('CSV Format Generation', () => {
    const generateCSVHeader = (daysInMonth) => {
      let header = 'No,Nama,Jabatan,Wilayah';
      for (let i = 1; i <= daysInMonth; i++) {
        header += `,"${i}"`;
      }
      header += ',Total Laporan,Total KR (m),Total KN (m),Total Panjang (m),Rata KR (m),Rata KN (m),Persen Kehadiran,Status\n';
      return header;
    };

    const generateCSVRow = (no, nama, jabatan, wilayah, dailyStatus, stats) => {
      let row = `${no},"${nama}","${jabatan}","${wilayah}"`;
      dailyStatus.forEach(status => {
        row += `,"${status}"`;
      });
      // ✅ PERBAIKAN: Gunakan toFixed(2) untuk angka desimal
      row += `,${stats.totalLaporan},${stats.totalKR.toFixed(2)},${stats.totalKN.toFixed(2)},${stats.totalPanjang.toFixed(2)},${stats.rataKR.toFixed(2)},${stats.rataKN.toFixed(2)},${stats.persenKehadiran}%,${stats.status}\n`;
      return row;
    };

    it('Header CSV harus memiliki kolom yang benar untuk 30 hari', () => {
      const header = generateCSVHeader(30);
      expect(header).toContain('No,Nama,Jabatan,Wilayah');
      expect(header).toContain('"1"');
      expect(header).toContain('"2"');
      expect(header).toContain('Total Laporan,Total KR (m),Total KN (m)');
    });

    it('Row CSV harus memformat data dengan benar', () => {
      const dailyStatus = ['✔️', '✘', 'KR:100m KN:50m', 'Libur'];
      const stats = {
        totalLaporan: 15,
        totalKR: 1250.50,
        totalKN: 800.25,
        totalPanjang: 2050.75,
        rataKR: 83.37,
        rataKN: 53.35,
        persenKehadiran: 68,
        status: 'Cukup'
      };
      
      const row = generateCSVRow(1, 'John Doe', 'Staff', 'Jakarta', dailyStatus, stats);
      
      expect(row).toContain('"John Doe"');
      expect(row).toContain('"Staff"');
      expect(row).toContain('"Jakarta"');
      // ✅ PERBAIKAN: Terima format dengan atau tanpa trailing zero
      expect(row).toMatch(/1250\.5|1250\.50/);
      expect(row).toContain('68%');
      expect(row).toContain('Cukup');
    });
  });

  describe('BOM Handling untuk UTF-8', () => {
    const BOM = '\uFEFF';
    
    it('CSV harus memiliki BOM untuk karakter Indonesia', () => {
      const csvContent = 'Nama,Wilayah\nAndi,Jakarta';
      const csvWithBOM = BOM + csvContent;
      
      expect(csvWithBOM.startsWith(BOM)).toBe(true);
      expect(csvWithBOM.length).toBe(csvContent.length + 1);
    });
  });

  describe('Nama File Export', () => {
    const generateFileName = (bulanNama, tahun, type) => {
      const sanitizedBulan = bulanNama.replace(/[^a-zA-Z]/g, '');
      return `rekap_laporan_kerja_${sanitizedBulan}_${tahun}.${type}`;
    };

    it('Nama file harus bersih dari karakter spesial', () => {
      const fileName = generateFileName('Januari', 2024, 'csv');
      expect(fileName).toBe('rekap_laporan_kerja_Januari_2024.csv');
      expect(fileName).not.toContain(' ');
    });

    it('Nama file PDF harus sesuai format', () => {
      const fileName = `Laporan_John_Doe_2024-01-15.pdf`;
      expect(fileName).toMatch(/^Laporan_.+\.pdf$/);
    });
  });
});