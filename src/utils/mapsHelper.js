const axios = require('axios');

const extractCoordinatesFromMapsLink = async (mapsLink) => {
    try {
        console.log('📍 Original URL:', mapsLink);
        
        let finalUrl = mapsLink;
        
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
        
        try {
            finalUrl = decodeURIComponent(finalUrl);
            console.log('🔓 Decoded URL:', finalUrl);
        } catch (e) {
            console.log('URL tidak perlu di-decode');
        }
        
        let latitude = null;
        let longitude = null;
        
        let match = finalUrl.match(/place\/.*?\/@([-\d.]+),([-\d.]+)/);
        if (match) {
            latitude = parseFloat(match[1]);
            longitude = parseFloat(match[2]);
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/!8m2!3d([-\d.]+)!4d([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/!3d([-\d.]+)!4d([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/@([-\d.]+),([-\d.]+)(?:,|z|\/|$)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/\/@([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/[?&]q=([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/\/search\/([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/[?&]ll=([-\d.]+),([-\d.]+)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            match = finalUrl.match(/\/([-\d.]+),([-\d.]+)(?:\/|\?|&|$)/);
            if (match) {
                latitude = parseFloat(match[1]);
                longitude = parseFloat(match[2]);
            }
        }
        
        if (!latitude || !longitude) {
            const latMatch = finalUrl.match(/!3d([-\d.]+)/);
            const lngMatch = finalUrl.match(/!4d([-\d.]+)/);
            if (latMatch && lngMatch) {
                latitude = parseFloat(latMatch[1]);
                longitude = parseFloat(lngMatch[1]);
            }
        }
        
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
        
        console.log('⚠️ Mencoba pendekatan regex komprehensif...');
        const allNumbers = finalUrl.match(/-?\d+\.\d+/g);
        if (allNumbers && allNumbers.length >= 2) {
            for (let i = 0; i < allNumbers.length - 1; i++) {
                const lat = parseFloat(allNumbers[i]);
                const lng = parseFloat(allNumbers[i + 1]);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    return { latitude: lat, longitude: lng };
                }
            }
        }
        
        console.error('❌ Tidak ada pattern yang cocok untuk URL:', finalUrl);
        return null;
        
    } catch (error) {
        console.error('❌ Error extracting coordinates:', error.message);
        return null;
    }
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
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

module.exports = { extractCoordinatesFromMapsLink, calculateDistance };