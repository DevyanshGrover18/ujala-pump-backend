import express from 'express';
const router = express.Router();
import {
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  updateOrderStatus,
} from '../controllers/factoryOrderController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

router
  .route('/')
  .get(verifyToken, checkSectionAccess('orders'), getOrders)
  .post(verifyToken, checkPermission('orders', 'add'), createOrder);
router
  .route('/:id')
  .put(verifyToken, checkPermission('orders', 'modify'), updateOrder)
  .delete(verifyToken, checkPermission('orders', 'delete'), deleteOrder);
router.patch(
  '/:id/status',
  verifyToken,
  checkPermission('orders', 'modify'),
  updateOrderStatus
);

export default router;
