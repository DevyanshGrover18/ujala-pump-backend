import express from 'express';
import {
  assignProductToDealer,
  getDealerProducts,
  getDealerProductsInventroy,
  revertDealerAssignment,
} from '../controllers/distributorDealerController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router.post(
  '/assign',
  verifyToken,
  checkPermission('dealers', 'modify'),
  assignProductToDealer
);

router.put(
  '/revert-dealer-assign',
  verifyToken,
  checkPermission('dealers', 'modify'),
  revertDealerAssignment
);
router.get(
  '/dealer/:dealerId/products',
  verifyToken,
  checkSectionAccess('products'),
  getDealerProducts
);
router.get(
  '/dealer-inventory/:dealerId/products',
  verifyToken,
  checkSectionAccess('products'),
  getDealerProductsInventroy
);
router.get(
  '/dealer/:dealerId/subdealer',
  verifyToken,
  checkSectionAccess('products'),
  getDealerProducts
);

export default router;
