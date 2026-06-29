import express from 'express';
import {
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  deleteMultipleOrders,
  updateOrderStatus,
  markOrderAsDispatched,
  transferToProducts,
  cleanupOrphanedOrderItems,
  resetFactoryCounters,
  cleanupDuplicateSerialNumbers,
  getOrderFactoryStats,
  getOrderItems,
  getAllOrderItems,
  checkDuplicates,
} from '../controllers/orderController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/', verifyToken, checkSectionAccess('orders'), getOrders);
router.post('/', verifyToken, checkPermission('orders', 'add'), createOrder);
router.post('/check-duplicates', verifyToken, checkDuplicates);
router.patch(
  '/:id',
  verifyToken,
  checkPermission('orders', 'modify'),
  updateOrder
);
router.delete(
  '/:id',
  verifyToken,
  checkPermission('orders', 'delete'),
  deleteOrder
);
router.delete(
  '/',
  verifyToken,
  checkPermission('orders', 'delete'),
  deleteMultipleOrders
);
router.patch(
  '/:id/status',
  verifyToken,
  checkPermission('orders', 'modify'),
  updateOrderStatus
);
router.put(
  '/:id/dispatch',
  verifyToken,
  checkPermission('orders', 'modify'),
  markOrderAsDispatched
);
router.get('/:id/factory-stats', verifyToken, getOrderFactoryStats);
router.get('/:id/items', verifyToken, getOrderItems);
router.get('/items', verifyToken, getAllOrderItems);
router.post(
  '/transfer-to-products',
  verifyToken,
  checkPermission('orders', 'modify'),
  transferToProducts
);
router.delete(
  '/cleanup-orphaned',
  verifyToken,
  checkPermission('orders', 'delete'),
  cleanupOrphanedOrderItems
);
router.post(
  '/reset-counters',
  verifyToken,
  checkPermission('management', 'full'),
  resetFactoryCounters
);
router.post(
  '/cleanup-duplicates',
  verifyToken,
  checkPermission('management', 'full'),
  cleanupDuplicateSerialNumbers
);

export default router;
