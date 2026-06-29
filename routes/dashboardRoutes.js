import express from 'express';
import {
  getDashboardStats,
  getOrderStats,
  getOrderItemStats,
  getMonthlySalesData,
  getExecutiveDashboardStats,
} from '../controllers/dashboardController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/counts', verifyToken, getDashboardStats);
router.get('/stats', verifyToken, getOrderStats);
router.get('/order-items', verifyToken, getOrderItemStats);
router.get('/monthly-sales', getMonthlySalesData);
router.get('/executive', verifyToken, getExecutiveDashboardStats);

export default router;
