import express from 'express';
import {
  createChangeRequest,
  getPendingRequests,
  getMyRequests,
  approveRequest,
  rejectRequest,
} from '../controllers/customerChangeRequestController.js';
import {
  verifyToken,
  checkSectionAccess,
  checkPermission,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// Create a new change request (Distributor, Dealer, SubDealer)
router.post(
  '/create',
  verifyToken,
  checkSectionAccess('sales'),
  createChangeRequest
);

// Get all pending requests (Admin only)
router.get(
  '/pending',
  verifyToken,
  checkSectionAccess('management'),
  getPendingRequests
);

// Get user's own requests (Distributor, Dealer, SubDealer)
router.get(
  '/my-requests',
  verifyToken,
  checkSectionAccess('sales'),
  getMyRequests
);

// Approve a request (Admin only)
router.put(
  '/:requestId/approve',
  verifyToken,
  checkPermission('management', 'modify'),
  approveRequest
);

// Reject a request (Admin only)
router.put(
  '/:requestId/reject',
  verifyToken,
  checkPermission('management', 'modify'),
  rejectRequest
);

export default router;
