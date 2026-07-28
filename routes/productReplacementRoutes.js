import express from 'express';
import {
  verifySerialNumber,
  createReplacementRequest,
  getReplacementRequests,
  resolveReplacementRequest,
  getAvailableStockForReplacement,
  getMyDefectiveStock,
} from '../controllers/productReplacementController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Verify serial number for replacement (Distributor, Dealer, SubDealer)
router.get('/verify/:serialNumber', verifyToken, verifySerialNumber);

// Submit replacement request
router.post('/', verifyToken, createReplacementRequest);

// List replacement requests (All for Admin, filter by user for Distributor, Dealer, SubDealer)
router.get('/', verifyToken, getReplacementRequests);

// Get my defective stock for raising replacement requests
router.get('/my-defective-stock', verifyToken, getMyDefectiveStock);

// Get available stock of same model for replacement
router.get('/:id/available-stock', verifyToken, getAvailableStockForReplacement);

// Resolve replacement request
router.patch('/:id/resolve', verifyToken, resolveReplacementRequest);

export default router;
