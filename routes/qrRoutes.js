import express from 'express';
import {
  getProductDetails,
  getProductDetailsAdminInventory,
  getProductDetailsDealerInventory,
  getProductDetailsDistributorInventory,
  getProductDetailsSubDealerInventory,
  updateProductStatusAndFactory,
} from '../controllers/qrController.js';
import {
  checkSectionAccess,
  verifyToken,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// Route to get product details by serial number
router.get('/:serialNumber', verifyToken, getProductDetails);
router.get(
  '/admin/:serialNumber',
  verifyToken,
  getProductDetailsAdminInventory
);
router.get(
  '/distributor/:serialNumber',
  verifyToken,
  getProductDetailsDistributorInventory
);
router.get(
  '/dealer/:serialNumber',
  verifyToken,
  getProductDetailsDealerInventory
);
router.get(
  '/sub-dealer/:serialNumber',
  verifyToken,
  getProductDetailsSubDealerInventory
);
router.put('/:serialNumber/status', verifyToken, updateProductStatusAndFactory);

export default router;
