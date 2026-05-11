describe('Kinerja Authorization Logic - Unit Tests', () => {
  
  const checkAdminAccess = (userRoles) => {
    if (userRoles !== 'admin' && userRoles !== 'atasan') {
      throw new Error('Akses ditolak. Hanya admin dan atasan yang dapat mengakses.');
    }
    return true;
  };

  const checkUpdateAccess = (userId, dataUserId, userRole) => {
    if (dataUserId !== userId && userRole !== 'admin') {
      throw new Error('Anda tidak memiliki akses untuk mengubah data ini');
    }
    return true;
  };

  const checkDeleteAccess = (userId, dataUserId, userRole) => {
    if (dataUserId !== userId && userRole !== 'admin') {
      throw new Error('Anda tidak memiliki akses untuk menghapus data ini');
    }
    return true;
  };

  it('Admin dan Atasan boleh akses semua data', () => {
    expect(() => checkAdminAccess('admin')).not.toThrow();
    expect(() => checkAdminAccess('atasan')).not.toThrow();
  });

  it('User biasa (pegawai) tidak boleh akses data admin', () => {
    expect(() => checkAdminAccess('pegawai')).toThrow('Akses ditolak');
  });

  it('User boleh update data sendiri', () => {
    expect(() => checkUpdateAccess(1, 1, 'pegawai')).not.toThrow();
  });

  it('User tidak boleh update data orang lain', () => {
    expect(() => checkUpdateAccess(1, 2, 'pegawai')).toThrow('tidak memiliki akses');
  });

  it('Admin boleh update data siapa saja', () => {
    expect(() => checkUpdateAccess(1, 2, 'admin')).not.toThrow();
  });

  it('User boleh hapus data sendiri', () => {
    expect(() => checkDeleteAccess(1, 1, 'pegawai')).not.toThrow();
  });

  it('Admin boleh hapus data siapa saja', () => {
    expect(() => checkDeleteAccess(1, 2, 'admin')).not.toThrow();
  });
});