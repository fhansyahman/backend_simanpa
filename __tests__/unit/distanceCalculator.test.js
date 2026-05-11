// Ekstrak fungsi calculateDistance ke file terpisah untuk di-test
// Atau copy fungsi dari service

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

describe('calculateDistance - Unit Test', () => {
  it('harus return 0 untuk koordinat yang sama', () => {
    const distance = calculateDistance(-6.2, 106.8, -6.2, 106.8);
    expect(distance).toBe(0);
  });

  it('harus return jarak yang benar untuk dua titik berbeda', () => {
    // Jakarta (Gambir) ke Bandung (Gedung Sate)
    const distance = calculateDistance(-6.1705, 106.8227, -6.9025, 107.6191);
    // Jarak sekitar 115-120 km
    expect(distance).toBeGreaterThan(110000);
    expect(distance).toBeLessThan(125000);
  });

  it('harus return jarak positif untuk koordinat manapun', () => {
    const distance = calculateDistance(-6.2, 106.8, 6.2, -106.8);
    expect(distance).toBeGreaterThan(0);
  });
});