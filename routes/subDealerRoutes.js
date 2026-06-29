import express from 'express';
import {
  getSubDealers,
  createSubDealer,
  updateSubDealer,
  deleteSubDealer,
  deleteMultipleSubDealers,
} from '../controllers/subDealerController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// Get all sub-dealers (authenticated). Permission checks are handled in higher layers.
router.get(
  '/sub-dealers',
  verifyToken,
  checkSectionAccess('subDealers'),
  getSubDealers
);

// Get sub-dealers for a dealer (authenticated)
router.get(
  '/dealers/:dealerId/sub-dealers',
  verifyToken,
  checkSectionAccess('subDealers'),
  getSubDealers
);

// Create sub-dealer under a dealer or with dealer in body
router.post(
  '/dealers/:dealerId/sub-dealers',
  verifyToken,
  checkPermission('subDealers', 'add'),
  createSubDealer
);
router.post(
  '/sub-dealers',
  verifyToken,
  checkPermission('subDealers', 'add'),
  createSubDealer
);

// Update sub-dealer
router.put(
  '/dealers/:dealerId/sub-dealers/:id',
  verifyToken,
  checkPermission('subDealers', 'modify'),
  updateSubDealer
);
router.put(
  '/sub-dealers/:id',
  verifyToken,
  checkPermission('subDealers', 'modify'),
  updateSubDealer
);

// Delete
router.delete(
  '/sub-dealers/:id',
  verifyToken,
  checkPermission('subDealers', 'delete'),
  deleteSubDealer
);
router.delete(
  '/sub-dealers',
  verifyToken,
  checkPermission('subDealers', 'delete'),
  deleteMultipleSubDealers
);

// Dealer-specific routes for managing their own sub-dealers
router.get('/dealer/my-sub-dealers', verifyToken, getSubDealers);
router.post('/dealer/sub-dealers', verifyToken, createSubDealer);
router.put(
  '/dealer/sub-dealers/:id',
  verifyToken,
  checkPermission('subDealers', 'modify'),
  updateSubDealer
);
router.delete('/dealer/sub-dealers/:id', verifyToken, deleteSubDealer);

export default router;
