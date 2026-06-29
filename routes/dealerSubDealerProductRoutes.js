import express from 'express';
import {
  assignProductToSubDealer,
  getSubDealerProducts,
  getDealerAssignableProducts,
  removeProductFromSubDealer,
  getMyProducts,
  revertSubDealerAssignment,
} from '../controllers/dealerSubDealerProductController.js';
import {
  verifyToken,
  checkSectionAccess,
  checkPermission,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// Get products available for assignment by dealer
router.get(
  '/dealer/assignable-products',
  verifyToken,
  checkSectionAccess('products'),
  getDealerAssignableProducts
);

// Assign product to sub-dealer
router.post(
  '/dealer/assign-to-subdealer',
  verifyToken,
  checkPermission('subDealers', 'modify'),
  assignProductToSubDealer
);

// Revert product from sub-dealer to dealer
router.put(
  '/dealer/revert-subdealer-assign',
  verifyToken,
  checkPermission('subDealers', 'modify'),
  revertSubDealerAssignment
);

// Get products assigned to a specific sub-dealer
router.get(
  '/dealer/subdealer/:subDealerId/products',
  verifyToken,
  checkSectionAccess('products'),
  getSubDealerProducts
);

// Remove product assignment from sub-dealer
router.delete(
  '/dealer/assignment/:assignmentId',
  verifyToken,
  checkPermission('subDealers', 'modify'),
  removeProductFromSubDealer
);

// Admin route to view sub-dealer products
router.get(
  '/admin/subdealer/:subDealerId/products',
  verifyToken,
  checkSectionAccess('products'),
  getSubDealerProducts
);

// Sub-dealer route to get their own products
router.get(
  '/subdealer/my-products',
  verifyToken,
  checkSectionAccess('sales'),
  getMyProducts
);

export default router;
