import express from 'express';
import {
  getDistributors,
  createDistributor,
  updateDistributor,
  deleteDistributor,
  deleteMultipleDistributors,
  getDistributorProducts,
  updateDistributorStatus,
  getDistributorDealers,
  createDealerForDistributor,
  updateDealerForDistributor,
  getDistributorProductModels,
} from '../controllers/distributorController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// @route   GET /api/distributors
router.get(
  '/',
  verifyToken,
  checkSectionAccess('distributors'),
  getDistributors
);

// @route   POST /api/distributors
router.post(
  '/',
  verifyToken,
  checkPermission('distributors', 'add'),
  createDistributor
);

// @route   PUT /api/distributors/:id
router.put(
  '/:id',
  verifyToken,
  checkPermission('distributors', 'modify'),
  updateDistributor
);

// @route   DELETE /api/distributors/:id
router.delete(
  '/:id',
  verifyToken,
  checkPermission('distributors', 'delete'),
  deleteDistributor
);

// @route   DELETE /api/distributors
router.delete(
  '/',
  verifyToken,
  checkPermission('distributors', 'delete'),
  deleteMultipleDistributors
);

// @route   GET /api/distributors/:id/products
router.get(
  '/:id/products',
  verifyToken,
  checkSectionAccess('products'),
  getDistributorProducts
);

router.get(
  '/:id/models',
  verifyToken,
  checkSectionAccess('products'),
  getDistributorProductModels
);

// @route   PATCH /api/distributors/:id/status
router.patch(
  '/:id/status',
  verifyToken,
  checkPermission('distributors', 'modify'),
  updateDistributorStatus
);

// @route   GET /api/distributors/:id/dealers
router.get(
  '/:id/dealers',
  verifyToken,
  checkSectionAccess('dealers'),
  getDistributorDealers
);

// @route   POST /api/distributors/:id/dealers
router.post(
  '/:id/dealers',
  verifyToken,
  checkPermission('dealers', 'add'),
  createDealerForDistributor
);

// @route   PUT /api/distributors/:id/dealers/:dealerId
router.put(
  '/:id/dealers/:dealerId',
  verifyToken,
  checkPermission('dealers', 'modify'),
  updateDealerForDistributor
);

export default router;
