import express from 'express';
import {
  verifySerialNumber,
  createReplacementRequest,
  getReplacementRequests,
  resolveReplacementRequest,
} from '../controllers/productReplacementController.js';
import { verifyToken, checkSectionAccess, checkPermission } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Verify serial number for replacement (Distributor, Dealer, SubDealer)
router.get('/verify/:serialNumber', verifyToken, verifySerialNumber);

// Submit replacement request
router.post('/', verifyToken, createReplacementRequest);

// List replacement requests (All for Admin, filter by user for Distributor, Dealer, SubDealer)
router.get('/', verifyToken, getReplacementRequests);

// Resolve replacement request (Admin only)
router.patch('/:id/resolve', verifyToken, checkPermission('products', 'modify'), resolveReplacementRequest);

export default router;
