import express from 'express';
import {
  getAllClaims,
  getClaimById,
  verifyClaim,
  getMyClaims,
  deleteClaim,
  deleteMultipleClaims,
  getPendingClaimsCount,
  reapplyClaim,
} from '../controllers/incentiveController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

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

// Seller & Plumber routes
router.get('/my/claims', getMyClaims);
router.post('/:id/reapply', reapplyClaim);

// Admin & Accounts routes
router.get('/', isAdminOrAccounts, getAllClaims);
router.get('/pending-count', isAdminOrAccounts, getPendingClaimsCount);
router.delete('/', isAdmin, deleteMultipleClaims);
router.get('/:id', isAdminOrAccounts, getClaimById);
router.post('/:id/verify', isAdminOrAccounts, verifyClaim);
router.delete('/:id', isAdmin, deleteClaim);

export default router;


