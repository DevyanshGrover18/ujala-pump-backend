import express from 'express';
import {
  getDealers,
  createDealer,
  updateDealer,
  deleteDealer,
  deleteMultipleDealers,
  getDealersToSubDealer,
} from '../controllers/dealerController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// @route   GET /api/dealers
router.get('/', verifyToken, checkSectionAccess('dealers'), getDealers);

// @route   POST /api/dealers
router.post('/', verifyToken, checkPermission('dealers', 'add'), createDealer);

// @route   PUT /api/dealers/:id
router.put(
  '/:id',
  verifyToken,
  checkPermission('dealers', 'modify'),
  updateDealer
);

// @route   DELETE /api/dealers/:id
router.delete(
  '/:id',
  verifyToken,
  checkPermission('dealers', 'delete'),
  deleteDealer
);

// @route   DELETE /api/dealers
router.delete(
  '/',
  verifyToken,
  checkPermission('dealers', 'delete'),
  deleteMultipleDealers
);

router.get('/:id/sub-dealers', verifyToken, getDealersToSubDealer);

export default router;
