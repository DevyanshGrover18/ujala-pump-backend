import express from 'express';
import {
  getPlumbers,
  createPlumber,
  updatePlumber,
  deletePlumber,
  registerPlumber,
} from '../controllers/plumberController.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';

const router = express.Router();

// Public plumber registration/signup
router.post('/register', registerPlumber);

// Admin-protected plumber management
router.get('/', verifyToken, checkSectionAccess('plumbers'), getPlumbers);
router.post('/', verifyToken, checkPermission('plumbers', 'add'), createPlumber);
router.put('/:id', verifyToken, checkPermission('plumbers', 'modify'), updatePlumber);
router.delete('/:id', verifyToken, checkPermission('plumbers', 'delete'), deletePlumber);

export default router;
