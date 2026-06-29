import express from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryStatus,
  deleteMultipleCategories,
} from '../controllers/categoryController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router
  .route('/')
  .get(verifyToken, checkSectionAccess('management'), getCategories)
  .post(verifyToken, checkPermission('management', 'add'), createCategory)
  .delete(
    verifyToken,
    checkPermission('management', 'delete'),
    deleteMultipleCategories
  );

router
  .route('/:id')
  .get(verifyToken, checkSectionAccess('management'), getCategoryById)
  .put(verifyToken, checkPermission('management', 'modify'), updateCategory)
  .delete(verifyToken, checkPermission('management', 'delete'), deleteCategory);

router
  .route('/:id/status')
  .patch(
    verifyToken,
    checkPermission('products', 'modify'),
    updateCategoryStatus
  );

export default router;
