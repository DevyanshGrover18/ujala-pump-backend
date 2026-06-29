import express from 'express';
import {
  createDealerDeletionRequest,
  getDealerDeletionRequests,
  approveDealerDeletionRequest,
  declineDealerDeletionRequest,
} from '../controllers/dealerDeletionRequestController.js';
import {
  verifyToken,
  checkSectionAccess,
  checkPermission,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router.post(
  '/',
  verifyToken,
  checkSectionAccess('dealers'),
  createDealerDeletionRequest
);
router.get(
  '/',
  verifyToken,
  checkSectionAccess('management'),
  getDealerDeletionRequests
);
router.delete(
  '/:id/approve',
  verifyToken,
  checkPermission('management', 'delete'),
  approveDealerDeletionRequest
);
router.delete(
  '/:id/decline',
  verifyToken,
  checkPermission('management', 'modify'),
  declineDealerDeletionRequest
);

export default router;
