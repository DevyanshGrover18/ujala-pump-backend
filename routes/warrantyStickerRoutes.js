import express from 'express';
import { downloadWarrantyStickers } from '../controllers/warrantyStickerController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.post('/', downloadWarrantyStickers);

export default router;
