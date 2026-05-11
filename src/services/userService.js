const { UserModel, UserLogModel } = require('../models/userModel');

const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

const UserService = {
  getAllUsers: async () => {
    return await UserModel.getAll();
  },

  getUserById: async (id) => {
    const user = await UserModel.getById(id);
    if (!user) {
      throw new Error('User tidak ditemukan');
    }
    return user;
  },

  createUser: async (userData, userId) => {
    const { nama, username, password, jabatan, roles, status, foto, wilayah_penugasan } = userData;

    // Validasi required fields
    if (!nama || !username || !password || !jabatan || !roles || !status) {
      throw new Error('Nama, username, password, jabatan, roles, dan status wajib diisi');
    }

    // Cek username sudah ada
    const usernameExists = await UserModel.isUsernameExists(username);
    if (usernameExists) {
      throw new Error('Username sudah digunakan');
    }

    // Handle foto
    let fotoPath = UserModel.getDefaultFotoPath();
    
    // PERBAIKAN: Jika foto ada dan bukan default, proses upload
    if (foto && foto !== DEFAULT_AVATAR && foto.startsWith("data:image")) {
      try {
        console.log('🔄 Memproses upload foto...');
        let optimizedFoto = foto;
        try {
          optimizedFoto = await UserModel.optimizeImage(foto);
        } catch (optimizeError) {
          console.log('⚠️ Optimasi gambar gagal:', optimizeError.message);
        }
        fotoPath = UserModel.saveImage(optimizedFoto, 'users');
        console.log('✅ Foto berhasil diproses:', fotoPath);
      } catch (error) {
        console.error('❌ Error saving photo:', error.message);
        fotoPath = UserModel.getDefaultFotoPath();
      }
    } else {
      console.log('ℹ️ Menggunakan foto default');
    }

    // Create user
    const insertId = await UserModel.create(userData, fotoPath);

    // Log activity
    await UserLogModel.create(
      'CREATE_USER',
      `Admin membuat user baru: ${nama} (${username}) dengan wilayah ${wilayah_penugasan || 'tidak ada'}`,
      userId
    );

    return insertId;
  },

  updateUser: async (id, userData, userId) => {
    const { nama, username, wilayah_penugasan, foto } = userData;

    // Cek user exists
    const currentUser = await UserModel.getUserForLog(id);
    if (!currentUser) {
      throw new Error('User tidak ditemukan');
    }

    // Cek username sudah digunakan user lain
    const usernameExists = await UserModel.isUsernameExists(username, id);
    if (usernameExists) {
      throw new Error('Username sudah digunakan');
    }

    // Handle foto
    let fotoPath = currentUser.foto;
    
    // PERBAIKAN: Jika ada foto baru dan bukan default
    if (foto && foto !== DEFAULT_AVATAR && foto.startsWith("data:image")) {
      try {
        console.log('🔄 Memproses update foto...');
        let optimizedFoto = foto;
        try {
          optimizedFoto = await UserModel.optimizeImage(foto);
        } catch (optimizeError) {
          console.log('⚠️ Optimasi gambar gagal:', optimizeError.message);
        }
        
        if (fotoPath && !fotoPath.includes('default.png')) {
          UserModel.deleteFile(fotoPath);
        }
        
        fotoPath = UserModel.saveImage(optimizedFoto, 'users');
        console.log('✅ Foto berhasil diupdate:', fotoPath);
      } catch (error) {
        console.error("⚠️ Gagal memproses foto upload:", error.message);
      }
    }

    // Update user
    await UserModel.update(id, userData, fotoPath);

    // Log activity
    const wilayahChanged = currentUser.wilayah_penugasan !== wilayah_penugasan;
    const logMessage = `Admin mengupdate user: ${nama} (ID: ${id})` + 
                      (wilayahChanged ? `, wilayah penugasan: ${currentUser.wilayah_penugasan || 'kosong'} → ${wilayah_penugasan || 'kosong'}` : '');
    
    await UserLogModel.create('UPDATE_USER', logMessage, userId);

    return {
      id: parseInt(id),
      wilayah_penugasan: wilayah_penugasan || null
    };
  },

  deleteUser: async (id, userId) => {
    // Cek user exists
    const user = await UserModel.getUserForLog(id);
    if (!user) {
      throw new Error('User tidak ditemukan');
    }

    // Hapus foto
    UserModel.deleteFile(user.foto);

    // Delete user
    await UserModel.delete(id);

    // Log activity
    await UserLogModel.create(
      'DELETE_USER',
      `Admin menghapus user: ${user.nama} (${user.username})`,
      userId
    );
  },

  updateUserPassword: async (id, password, userId) => {
    if (!password) {
      throw new Error('Password wajib diisi');
    }

    // Cek user exists
    const user = await UserModel.getById(id);
    if (!user) {
      throw new Error('User tidak ditemukan');
    }

    // Update password
    await UserModel.updatePassword(id, password);

    // Log activity
    await UserLogModel.create(
      'UPDATE_PASSWORD',
      `Admin mengupdate password user ID: ${id}`,
      userId
    );
  }
};

module.exports = UserService;