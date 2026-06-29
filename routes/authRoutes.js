import express from 'express';
import {
  login,
  createDefaultUsers,
  getFactoryUsers,
  requestPasswordReset,
  getPasswordResetRequests,
  resetPassword,
  declinePasswordResetRequest,
} from '../controllers/authController.js';
import {
  verifyToken,
  checkSectionAccess,
  checkPermission,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router.post('/login', login);
router.post('/create-default-users', createDefaultUsers);
router.get(
  '/factory-users',
  verifyToken,
  checkSectionAccess('factories'),
  getFactoryUsers
);
router.post('/request-password-reset', requestPasswordReset);
router.get(
  '/password-reset-requests',
  verifyToken,
  checkSectionAccess('management'),
  getPasswordResetRequests
);
router.post('/reset-password', resetPassword);
router.delete(
  '/password-reset-requests/:id',
  verifyToken,
  checkPermission('management', 'modify'),
  declinePasswordResetRequest
);

export default router;
