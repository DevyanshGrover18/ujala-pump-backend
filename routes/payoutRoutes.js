import express from 'express';
import {
  getThresholds,
  updateThresholds,
  getPendingPayoutsCount,
  requestPayout,
  getMyPayouts,
  getAllPayouts,
  processPayout,
  deleteMultiplePayouts,
} from '../controllers/payoutController.js';
import { verifyToken, denyRole } from '../middleware/roleMiddleware.js';

const router = express.Router();

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Access denied. Admin only.' });
};

const isAdminOrAccounts = (req, res, next) => {
  const role = req.user && req.user.role;
  if (role === 'admin' || role === 'accounts') return next();
  return res.status(403).json({ message: 'Access denied.' });
};

router.use(verifyToken);

// Thresholds
router.get('/thresholds', getThresholds);
router.put('/thresholds', isAdmin, updateThresholds);

// Pending count for sidebar badges
router.get('/pending-count', isAdminOrAccounts, getPendingPayoutsCount);

// Seller & Plumber endpoints
router.post('/request', denyRole('accounts'), requestPayout);
router.get('/my', getMyPayouts);

// Admin endpoints
router.get('/', isAdminOrAccounts, getAllPayouts);
router.delete('/', isAdmin, deleteMultiplePayouts);
router.post('/:id/process', isAdminOrAccounts, processPayout);

export default router;
