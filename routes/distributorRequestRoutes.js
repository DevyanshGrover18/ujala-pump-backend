import express from 'express';
import {
  createDistributorRequest,
  getPendingDistributorRequests,
  approveDistributorRequest,
  rejectDistributorRequest,
} from '../controllers/distributorRequestController.js';
import {
  verifyToken,
  checkSectionAccess,
  checkPermission,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// Public route for submitting a distributor registration request
router.post('/', createDistributorRequest);

// Admin routes for managing distributor requests
router.get(
  '/pending',
  verifyToken,
  checkSectionAccess('management'),
  getPendingDistributorRequests
);
router.put(
  '/:id/approve',
  verifyToken,
  checkPermission('management', 'modify'),
  approveDistributorRequest
);
router.put(
  '/:id/reject',
  verifyToken,
  checkPermission('management', 'modify'),
  rejectDistributorRequest
);

export default router;
