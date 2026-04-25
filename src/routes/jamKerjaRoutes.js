const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');
const { 
  getAllPenugasan,
  getPenugasanDefault,
  createPenugasan,
  updateDefaultPenugasan,
  deletePenugasan,
  softDeletePenugasan,
  deleteCompletedPenugasan,
  updatePenugasanStatus,
  getMonitoringPenugasan,
  updatePenugasan,
  getPenugasanById,
  

} = require('../controllers/jamKerjaController');

router.use(authenticate);
router.use(authorize('admin','atasan'));

router.get('/penugasan', getAllPenugasan);
router.get('/penugasan/default', getPenugasanDefault);
router.post('/penugasan', createPenugasan);
router.put('/penugasan/default/:id', updateDefaultPenugasan);
router.delete('/penugasan/:id', deletePenugasan); // Hard delete
router.put('/penugasan/:id/soft-delete', softDeletePenugasan); // Soft delete
router.delete('/penugasan/completed/delete-all', deleteCompletedPenugasan); // Bulk delete
router.put('/penugasan/:id/status', updatePenugasanStatus);
router.get('/penugasan/monitoring', getMonitoringPenugasan);
router.get('/penugasan/:id', getPenugasanById); // Tambahkan route untuk get by ID
router.put('/penugasan/:id', updatePenugasan); // Route untuk update penugasan

module.exports = router;