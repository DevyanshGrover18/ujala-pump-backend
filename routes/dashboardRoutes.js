import express from 'express';
import {
  getDashboardOverview,
  getOrderItemStats,
  getSalesTrend,
  getTopSellingModels,
  getRecentOrders,
  getLowStockAlerts,
  getRecentActivity,
  getPartnerSummary,
  getPendingActions,
  getDashboardStats,
  getOrderStats,
  getMonthlySalesData,
  getExecutiveDashboardStats,
} from '../controllers/dashboardController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Core Dashboard Endpoints
router.get('/overview', verifyToken, getDashboardOverview);
router.get('/order-items-chart', verifyToken, getOrderItemStats);
router.get('/sales-trend', verifyToken, getSalesTrend);
router.get('/top-models', verifyToken, getTopSellingModels);
router.get('/recent-orders', verifyToken, getRecentOrders);
router.get('/low-stock', verifyToken, getLowStockAlerts);
router.get('/recent-activity', verifyToken, getRecentActivity);
router.get('/partner-summary', verifyToken, getPartnerSummary);
router.get('/pending-actions', verifyToken, getPendingActions);

// Backward compatibility endpoints
router.get('/counts', verifyToken, getDashboardStats);
router.get('/stats', verifyToken, getOrderStats);
router.get('/order-items', verifyToken, getOrderItemStats);
router.get('/monthly-sales', getMonthlySalesData);
router.get('/executive', verifyToken, getExecutiveDashboardStats);

export default router;
