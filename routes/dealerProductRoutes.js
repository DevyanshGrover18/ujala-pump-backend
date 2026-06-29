import express from 'express';
const router = express.Router();
import {
  assignProductToDealerBySerial,
  getDealerProducts,
  getProductBySerialNumber,
  gettDealerProductModels,
} from '../controllers/dealerProductController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

router.put(
  '/assign-by-serial',
  verifyToken,
  checkPermission('dealers', 'modify'),
  assignProductToDealerBySerial
);
router.get('/serial/:serialNumber', verifyToken, getProductBySerialNumber);

router.get(
  '/:id/products',
  verifyToken,
  checkSectionAccess('products'),
  getDealerProducts
);
router.get(
  '/:id/models',
  verifyToken,
  checkSectionAccess('products'),
  gettDealerProductModels
);
export default router;
