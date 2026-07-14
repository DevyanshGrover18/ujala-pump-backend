import express from 'express';
import {
  createComplaint,
  getMyComplaints,
  getComplaints,
  resolveComplaint,
} from '../controllers/complaintController.js';
import { verifyToken, checkSectionAccess, checkPermission } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Plumber complaint endpoints
router.post('/', verifyToken, createComplaint);
router.get('/my', verifyToken, getMyComplaints);

// Admin complaint management endpoints
router.get('/', verifyToken, checkSectionAccess('plumbers'), getComplaints);
router.put('/:id/resolve', verifyToken, checkPermission('plumbers', 'modify'), resolveComplaint);

export default router;
