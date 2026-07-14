import express from 'express';
import {
  checkSerialNumber,
  installMotor,
  getPlumberInstallations,
} from '../controllers/installationController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Plumber motor installation endpoints
router.get('/check/:serialNumber', verifyToken, checkSerialNumber);
router.post('/', verifyToken, installMotor);
router.get('/', verifyToken, getPlumberInstallations);

export default router;
