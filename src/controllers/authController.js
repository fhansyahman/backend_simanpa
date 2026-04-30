const { AuthService } = require('../services/authService');

const AuthController = {
  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log('Login attempt for:', username);

      const { token, user } = await AuthService.login(username, password);

      res.status(200).json({
        success: true,
        message: 'Login berhasil',
        data: {
          token,
          user
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      
      // Untuk keamanan, tetap return 200 dengan pesan error
      let statusCode = 400;
      let errorMessage = error.message;
      
      if (error.message === 'Username atau password salah') {
        statusCode = 200; // Tetap 200 untuk keamanan
      } else if (error.message.includes('wajib diisi')) {
        statusCode = 400;
      } else {
        statusCode = 500;
        errorMessage = 'Terjadi kesalahan server';
      }
      
      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  },

  getProfile: async (req, res) => {
    try {
      const user = await AuthService.getProfile(req.user.id);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Get profile error:', error);
      const status = error.message === 'User tidak ditemukan' ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Terjadi kesalahan server'
      });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { oldPassword, newPassword, confirmPassword } = req.body;
      const userId = req.user.id;

      console.log('Reset password attempt for user:', userId);

      await AuthService.resetPassword(userId, oldPassword, newPassword, confirmPassword);

      console.log(`Password berhasil direset untuk user ID: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Password berhasil direset'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      
      let statusCode = 500;
      let errorMessage = 'Terjadi kesalahan server saat mereset password';
      
      if (error.message === 'User tidak ditemukan') {
        statusCode = 404;
        errorMessage = error.message;
      } else if (error.message.includes('wajib diisi') || 
                 error.message.includes('tidak cocok') || 
                 error.message.includes('minimal') ||
                 error.message.includes('tidak sesuai') ||
                 error.message.includes('tidak boleh sama')) {
        statusCode = 400;
        errorMessage = error.message;
      }
      
      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  }
};

module.exports = AuthController;