import express from 'express';
import {
  createExecutive,
  getExecutives,
  getExecutive,
  updateExecutive,
  deleteExecutive,
  getExecutiveCustomers,
} from '../controllers/executiveController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Admin only.' });
};

router.use(verifyToken);
router.get('/me/customers', getExecutiveCustomers);
router.use(isAdmin);

router.post('/', createExecutive);
router.get('/', getExecutives);
router.get('/:id', getExecutive);
router.put('/:id', updateExecutive);
router.delete('/:id', deleteExecutive);

export default router;
