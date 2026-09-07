import express from 'express';
import {
  getAccountsMembers,
  createAccountsMember,
  updateAccountsMember,
  deleteAccountsMember,
  deleteMultipleAccountsMembers,
  updateAccountsMemberStatus,
} from '../controllers/accountsController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// GET /api/accounts
router.get('/', verifyToken, adminOnly, getAccountsMembers);

// POST /api/accounts
router.post('/', verifyToken, adminOnly, createAccountsMember);

// PUT /api/accounts/:id
router.put('/:id', verifyToken, adminOnly, updateAccountsMember);

// PATCH /api/accounts/:id/status
router.patch('/:id/status', verifyToken, adminOnly, updateAccountsMemberStatus);

// DELETE /api/accounts
router.delete('/', verifyToken, adminOnly, deleteMultipleAccountsMembers);

// DELETE /api/accounts/:id
router.delete('/:id', verifyToken, adminOnly, deleteAccountsMember);

export default router;
