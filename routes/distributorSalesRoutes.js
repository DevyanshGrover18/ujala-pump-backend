import express from 'express';
import {
  getDealerSales,
  getCustomerSales,
} from '../controllers/distributorSalesController.js';
import {
  verifyToken,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get(
  '/dealer-sales/:distributorId',
  verifyToken,
  checkSectionAccess('sales'),
  getDealerSales
);
router.get(
  '/customer-sales/:distributorId',
  verifyToken,
  checkSectionAccess('sales'),
  getCustomerSales
);

export default router;
