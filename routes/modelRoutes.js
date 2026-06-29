import express from 'express';
import {
  getModels,
  getModelById,
  getModelsByCategory,
  createModel,
  updateModel,
  deleteModel,
  updateModelStatus,
  deleteMultipleModels,
  checkModelCode,
} from '../controllers/modelController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

router
  .route('/')
  .get(verifyToken, checkSectionAccess('management'), getModels)
  .post(verifyToken, checkPermission('management', 'add'), createModel)
  .delete(
    verifyToken,
    checkPermission('management', 'delete'),
    deleteMultipleModels
  );

router
  .route('/category/:categoryId')
  .get(verifyToken, checkSectionAccess('management'), getModelsByCategory);

router
  .route('/check-code/:code')
  .get(verifyToken, checkSectionAccess('management'), checkModelCode);

router
  .route('/:id')
  .get(verifyToken, checkSectionAccess('management'), getModelById)
  .put(verifyToken, checkPermission('management', 'modify'), updateModel)
  .delete(verifyToken, checkPermission('management', 'delete'), deleteModel);

router
  .route('/:id/status')
  .patch(
    verifyToken,
    checkPermission('management', 'modify'),
    updateModelStatus
  );

export default router;
