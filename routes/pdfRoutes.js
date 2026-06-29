import express from 'express';
import {
  generateBoxStickers,
  downloadMultiplePDFs,
  downloadCombinedPDFs,
} from '../controllers/pdfController.js';
import { getProductDetails } from '../controllers/qrController.js';
import { verifyToken } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/stickers/:boxKey', generateBoxStickers);
router.post('/download-multiple', downloadMultiplePDFs);
router.post('/download-combined', downloadCombinedPDFs);
router.get('/product/:serialNumber', getProductDetails);

export default router;
