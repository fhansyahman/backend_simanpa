const PenugasanService = require('../services/penugasanService');

const getAllPenugasan = async (req, res) => {
    try {
        const { jenis = 'semua' } = req.query;
        const data = await PenugasanService.getAllPenugasan(jenis);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Get all penugasan error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
};

const getPenugasanDefault = async (req, res) => {
    try {
        const data = await PenugasanService.getPenugasanDefault();
        res.json({ success: true, data });
    } catch (error) {
        console.error('Get penugasan default error:', error);
        res.status(404).json({ success: false, message: error.message });
    }
};

const getPenugasanById = async (req, res) => {
    try {
        const { id } = req.params;
        const data = await PenugasanService.getPenugasanById(id);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Get penugasan by id error:', error);
        res.status(404).json({ success: false, message: error.message });
    }
};

const createPenugasan = async (req, res) => {
    try {
        const result = await PenugasanService.createPenugasan(req.body, req.user?.id);
        res.json({
            success: true,
            message: `Penugasan berhasil dibuat${result.assigned_count > 0 ? ` dengan ${result.assigned_count} pekerja` : ''}`,
            data: result
        });
    } catch (error) {
        console.error('Create penugasan error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

const updatePenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await PenugasanService.updatePenugasan(id, req.body);
        res.json({
            success: true,
            message: `Penugasan berhasil diupdate dengan ${result.assigned_count} pekerja`,
            data: result
        });
    } catch (error) {
        console.error('Update penugasan error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

const updatePenugasanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await PenugasanService.updatePenugasanStatus(id, status);
        res.json({ success: true, message: result.message });
    } catch (error) {
        console.error('Update penugasan status error:', error);
        res.status(404).json({ success: false, message: error.message });
    }
};

const updateDefaultPenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await PenugasanService.updateDefaultPenugasan(id, req.body);
        res.json({ success: true, message: result.message });
    } catch (error) {
        console.error('Update default penugasan error:', error);
        res.status(404).json({ success: false, message: error.message });
    }
};

const deletePenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await PenugasanService.deletePenugasan(id);
        res.json({
            success: true,
            message: `Penugasan "${result.nama_penugasan}" berhasil dihapus`,
            data: result
        });
    } catch (error) {
        console.error('Delete penugasan error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

const softDeletePenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await PenugasanService.softDeletePenugasan(id);
        res.json({
            success: true,
            message: `Penugasan "${result.nama_penugasan}" berhasil dinonaktifkan`,
            data: result
        });
    } catch (error) {
        console.error('Soft delete penugasan error:', error);
        res.status(404).json({ success: false, message: error.message });
    }
};

const deleteCompletedPenugasan = async (req, res) => {
    try {
        const { tipe = 'semua' } = req.query;
        const result = await PenugasanService.deleteCompletedPenugasan(tipe);
        res.json({
            success: true,
            message: `${result.total_deleted} penugasan berhasil dihapus`,
            data: result
        });
    } catch (error) {
        console.error('Delete completed penugasan error:', error);
        res.status(404).json({ success: false, message: error.message });
    }
};

const getMonitoringPenugasan = async (req, res) => {
    try {
        const { id } = req.params;
        const { tanggal } = req.query;
        const result = await PenugasanService.getMonitoringPenugasan(id, tanggal);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Get monitoring penugasan error:', error);
        res.status(404).json({ success: false, message: error.message });
    }
};

// Fungsi yang diekspor untuk digunakan di file lain
const getUserPenugasan = async (userId, tanggal = null) => {
    return await PenugasanService.getUserPenugasan(userId, tanggal);
};

const validatePresensiRadius = async (userId, latitude, longitude, tanggal = null) => {
    return await PenugasanService.validatePresensiRadius(userId, latitude, longitude, tanggal);
};

const cekPenugasanKhususAktif = async (userId, tanggal = null) => {
    return await PenugasanService.cekPenugasanKhususAktif(userId, tanggal);
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    return PenugasanService.calculateDistance(lat1, lon1, lat2, lon2);
};

module.exports = {
    getAllPenugasan,
    getPenugasanById,
    getPenugasanDefault,
    createPenugasan,
    updatePenugasan,
    updatePenugasanStatus,
    updateDefaultPenugasan,
    deletePenugasan,
    softDeletePenugasan,
    deleteCompletedPenugasan,
    getMonitoringPenugasan,
    getUserPenugasan,
    validatePresensiRadius,
    cekPenugasanKhususAktif,
    calculateDistance
};