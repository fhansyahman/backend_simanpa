// utils/fileUtils.js
const fs = require('fs');
const path = require('path');

const ensureUploadsDir = () => {
  const uploadsDir = path.join(__dirname, '../uploads/presensi');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
};

const saveBase64Image = (base64String, jenis = 'masuk', userId = null, tanggal = null) => {
  if (!base64String) return null;
  
  try {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 string');
    }

    const imageType = matches[1];
    const imageData = matches[2];
    
    const ext = imageType.split('/')[1] || 'jpg';
    
    const timestamp = Date.now();
    const filename = `${jenis}_${userId || 'unknown'}_${tanggal || new Date().toISOString().split('T')[0]}_${timestamp}.${ext}`;
    
    const uploadsDir = ensureUploadsDir();
    const filePath = path.join(uploadsDir, filename);
    const buffer = Buffer.from(imageData, 'base64');
    
    fs.writeFileSync(filePath, buffer);
    
    return filename;
  } catch (error) {
    console.error('Error saving base64 image:', error);
    return null;
  }
};

const deleteFile = (filename) => {
  if (!filename) return;
  
  try {
    const uploadsDir = path.join(__dirname, '../uploads/presensi');
    const filePath = path.join(uploadsDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

const getBase64FromFile = (filename) => {
  if (!filename) return null;
  
  try {
    const uploadsDir = path.join(__dirname, '../uploads/presensi');
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    const fileType = path.extname(filePath).substring(1) || 'jpg';
    const base64 = fileBuffer.toString('base64');
    
    return `data:image/${fileType};base64,${base64}`;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
};

const getDayName = (dayOfWeek) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[dayOfWeek];
};

module.exports = {
  ensureUploadsDir,
  saveBase64Image,
  deleteFile,
  getBase64FromFile,
  getDayName
};