import express from 'express';
const router = express.Router();
import {
  getDealers,
  createDealer,
  updateDealer,
  deleteDealer,
} from '../controllers/distributorDealerController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

router
  .route('/')
  .get(verifyToken, checkSectionAccess('dealers'), getDealers)
  .post(verifyToken, checkPermission('dealers', 'add'), createDealer);
router
  .route('/:id')
  .put(verifyToken, checkPermission('dealers', 'modify'), updateDealer)
  .delete(verifyToken, checkPermission('dealers', 'delete'), deleteDealer);

export default router;
