import express from 'express';
import {
  getProducts,
  getProductBySerialNumber,
  uploadOfflineProducts,
} from '../controllers/productController.js';
import {
  verifyToken,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/', verifyToken, checkSectionAccess('products'), getProducts);
router.post('/offline', verifyToken, checkSectionAccess('products'), uploadOfflineProducts);
router.get('/serial/:serialNumber', verifyToken, getProductBySerialNumber);

export default router;
