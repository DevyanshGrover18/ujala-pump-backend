import express from 'express';
const router = express.Router();
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

// @route   GET /api/factory/products
router.get('/', verifyToken, checkSectionAccess('products'), (req, res) => {
  res.send('Get all products for a factory');
});

// @route   POST /api/factory/products
router.post(
  '/',
  verifyToken,
  checkPermission('products', 'add'),
  (req, res) => {
    res.send('Create a new product for a factory');
  }
);

// @route   PUT /api/factory/products/:id
router.put(
  '/:id',
  verifyToken,
  checkPermission('products', 'modify'),
  (req, res) => {
    res.send('Update a product for a factory');
  }
);

// @route   DELETE /api/factory/products/:id
router.delete(
  '/:id',
  verifyToken,
  checkPermission('products', 'delete'),
  (req, res) => {
    res.send('Delete a product for a factory');
  }
);

export default router;
