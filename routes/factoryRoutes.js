import express from 'express';
import {
  getFactories,
  getFactoryById,
  createFactory,
  updateFactory,
  deleteFactory,
  getFactoryOrders,
  updateOrderItemStatus,
  bulkUpdateOrderItemStatus,
  getFactorySales,
  deleteMultipleFactories,
  checkFactoryCodeUniqueness,
  getNewOrdersCount,
  markOrdersSeen,
} from '../controllers/factoryController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';
import { getFactoriesModels } from '../controllers/factoryOrderController.js';

const router = express.Router();

// @route   GET /api/factories
router.get('/', verifyToken, checkSectionAccess('factories'), getFactories);

// @route   GET /api/factories/:id
router.get('/:id', verifyToken, getFactoryById);

// @route   POST /api/factories
router.get('/check-code/:code', verifyToken, checkFactoryCodeUniqueness);

// @route   POST /api/factories
router.post(
  '/',
  verifyToken,
  checkPermission('factories', 'add'),
  createFactory
);

// @route   PUT /api/factories/:id
router.put(
  '/:id',
  verifyToken,
  checkPermission('factories', 'modify'),
  updateFactory
);

// @route   DELETE /api/factories/:id
router.delete(
  '/:id',
  verifyToken,
  checkPermission('factories', 'delete'),
  deleteFactory
);

// @route   DELETE /api/factories/
router.delete(
  '/',
  verifyToken,
  checkPermission('factories', 'delete'),
  deleteMultipleFactories
);

// @route   GET /api/factories/:id/orders
router.get(
  '/:id/orders',
  verifyToken,
  checkSectionAccess('orders'),
  getFactoryOrders
);

router.get('/:id/models', verifyToken, getFactoriesModels);

// @route   GET /api/factories/:id/sales
router.get(
  '/:id/sales',
  verifyToken,
  checkSectionAccess('sales'),
  getFactorySales
);

// New routes for new orders count and marking orders as seen
router.get('/:id/new-orders-count', verifyToken, getNewOrdersCount);
router.patch('/:id/mark-orders-seen', verifyToken, markOrdersSeen);

// @route   PATCH /api/factories/:id/orders/:itemId/status
router.patch('/:id/orders/:itemId/status', verifyToken, updateOrderItemStatus);

// @route   PATCH /api/factories/:id/orders/bulk-status
router.patch('/:id/orders/bulk-status', verifyToken, bulkUpdateOrderItemStatus);

export default router;
