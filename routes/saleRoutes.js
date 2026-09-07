import express from 'express';
import {
  createSale,
  getSalesByDealer,
  updateSale,
  getAssignedProducts,
  getDealerSales,
  createSubDealerSale,
  getSalesBySubDealer,
  adminBulkDispatch,
  adminSaleProductRemove,
  getDistributorToDealerAssignedProducts,
  distributorBulkAssignDealer,
  distributorSaleProductRemove,
  getDealerToSubDealerAssignedProducts,
  dealerBulkAssignSubDealer,
  dealerSaleProductRemove,
  adminCreateSale,
} from '../controllers/saleController.js';
import {
  verifyToken,
  checkSectionAccess,
  denyRole,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get(
  '/dealer-sales',
  verifyToken,
  checkSectionAccess('sales'),
  getDealerSales
);
router.get(
  '/dealer/:dealerId',
  verifyToken,
  checkSectionAccess('sales'),
  getSalesByDealer
);
router.post(
  '/',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  createSale
);
router.post(
  '/bulk-dispatch-distributor',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  distributorBulkAssignDealer
);
router.get(
  '/distributor-assigned-products',
  verifyToken,
  checkSectionAccess('sales'),
  getDistributorToDealerAssignedProducts
);
router.delete(
  '/distributor-sale-delete/:productId',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  distributorSaleProductRemove
);

router.get(
  '/dealer-assigned-products',
  verifyToken,
  checkSectionAccess('sales'),
  getDealerToSubDealerAssignedProducts
);
router.post(
  '/bulk-dispatch-dealer',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  dealerBulkAssignSubDealer
);
router.delete(
  '/dealer-sale-delete/:productId',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  dealerSaleProductRemove
);

router.post(
  '/subdealer-sale',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  createSubDealerSale
);
router.get(
  '/subdealer/:subDealerId',
  verifyToken,
  checkSectionAccess('sales'),
  getSalesBySubDealer
);

router.get(
  '/assigned-products',
  verifyToken,
  checkSectionAccess('sales'),
  getAssignedProducts
);

router.put(
  '/:saleId',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  updateSale
);
router.post(
  '/bulk-dispatch',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  adminBulkDispatch
);
router.delete(
  '/sale-delete/:productId',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  adminSaleProductRemove
);
router.post(
  '/admin-sale',
  verifyToken,
  checkSectionAccess('sales'),
  denyRole('accounts'),
  adminCreateSale
);

export default router;
