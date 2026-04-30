// utils/geoUtils.js
const axios = require('axios');

const extractCoordinatesFromMapsLink = async (mapsLink) => {
  try {
    console.log('📍 Original URL:', mapsLink);
    
    let finalUrl = mapsLink;
    
    // STEP 1: Handle Google Maps shortlink
    if (mapsLink.includes('maps.app.goo.gl')) {
      try {
        const response = await axios.get(mapsLink, { 
          maxRedirects: 5, 
          validateStatus: false,
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.request && response.request.res && response.request.res.responseUrl) {
          finalUrl = response.request.res.responseUrl;
        } else if (response.request && response.request.path) {
          finalUrl = response.request.path;
        } else if (response.config && response.config.url) {
          finalUrl = response.config.url;
        }
        
        console.log('🔄 Redirected URL:', finalUrl);
      } catch (redirectError) {
        console.warn('⚠️ Redirect gagal, lanjut dengan link asli:', redirectError.message);
      }
    }
    
    // STEP 2: Decode URL
    try {
      finalUrl = decodeURIComponent(finalUrl);
      console.log('🔓 Decoded URL:', finalUrl);
    } catch (e) {
      console.log('URL tidak perlu di-decode');
    }
    
    // STEP 3: EKSTRAKSI KOORDINAT
    let latitude = null;
    let longitude = null;
    
    // Pola 0: Format place dengan koordinat
    let match = finalUrl.match(/place\/.*?\/@([-\d.]+),([-\d.]+)/);
    if (match) {
      latitude = parseFloat(match[1]);
      longitude = parseFloat(match[2]);
    }
    
    // Pola 1: Format !8m2!3dLATITUDE!4dLONGITUDE
    if (!latitude || !longitude) {
      match = finalUrl.match(/!8m2!3d([-\d.]+)!4d([-\d.]+)/);
      if (match) {
        latitude = parseFloat(match[1]);
        longitude = parseFloat(match[2]);
      }
    }
    
    // Pola 2: Format !3dLATITUDE!4dLONGITUDE
    if (!latitude || !longitude) {
      match = finalUrl.match(/!3d([-\d.]+)!4d([-\d.]+)/);
      if (match) {
        latitude = parseFloat(match[1]);
        longitude = parseFloat(match[2]);
      }
    }
    
    // Pola 3: Format @latitude,longitude
    if (!latitude || !longitude) {
      match = finalUrl.match(/@([-\d.]+),([-\d.]+)(?:,|z|\/|$)/);
      if (match) {
        latitude = parseFloat(match[1]);
        longitude = parseFloat(match[2]);
      }
    }
    
    // Pola 4: Format /@latitude,longitude
    if (!latitude || !longitude) {
      match = finalUrl.match(/\/@([-\d.]+),([-\d.]+)/);
      if (match) {
        latitude = parseFloat(match[1]);
        longitude = parseFloat(match[2]);
      }
    }
    
    // Pola 5: Format ?q=latitude,longitude
    if (!latitude || !longitude) {
      match = finalUrl.match(/[?&]q=([-\d.]+),([-\d.]+)/);
      if (match) {
        latitude = parseFloat(match[1]);
        longitude = parseFloat(match[2]);
      }
    }
    
    // VALIDASI
    if (latitude !== null && longitude !== null && !isNaN(latitude) && !isNaN(longitude)) {
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        latitude = parseFloat(latitude.toFixed(6));
        longitude = parseFloat(longitude.toFixed(6));
        console.log('🎉 Final valid coordinates:', { latitude, longitude });
        return { latitude, longitude };
      } else if (longitude >= -90 && longitude <= 90 && latitude >= -180 && latitude <= 180) {
        console.log('🔄 Mencoba menukar koordinat...');
        const swappedLat = parseFloat(longitude.toFixed(6));
        const swappedLng = parseFloat(latitude.toFixed(6));
        return { latitude: swappedLat, longitude: swappedLng };
      }
    }
    
    console.error('❌ Tidak dapat mengekstrak koordinat dari URL:', finalUrl);
    return null;
    
  } catch (error) {
    console.error('❌ Error extracting coordinates:', error.message);
    return null;
  }
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Radius bumi dalam meter
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

module.exports = {
  extractCoordinatesFromMapsLink,
  calculateDistance
};