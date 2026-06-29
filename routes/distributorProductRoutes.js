import express from 'express';
const router = express.Router();
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  assignProductsToDistributor,
  getDistributorProducts,
  assignProductBySerial,
  revertAssignedProducts,
} from '../controllers/distributorProductController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

router
  .route('/')
  .get(verifyToken, checkSectionAccess('products'), getProducts)
  .post(verifyToken, checkPermission('products', 'add'), createProduct);
router.get(
  '/:distributorId',
  verifyToken,
  checkSectionAccess('products'),
  getDistributorProducts
);
router.put(
  '/assign',
  verifyToken,
  checkPermission('products', 'modify'),
  assignProductsToDistributor
);
router.put(
  '/assign-by-serial',
  verifyToken,
  checkPermission('products', 'modify'),
  assignProductBySerial
);
router.put(
  '/revert-assign',
  verifyToken,
  checkPermission('products', 'modify'),
  revertAssignedProducts
);
router
  .route('/:id')
  .put(verifyToken, checkPermission('products', 'modify'), updateProduct)
  .delete(verifyToken, checkPermission('products', 'delete'), deleteProduct);

export default router;
