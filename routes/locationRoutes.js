import express from 'express';
import {
  getStates,
  getDistrictsByState,
  getLocationsByDistrict,
} from '../controllers/locationController.js';

const router = express.Router();

router.get('/states', getStates);
router.get('/districts/:state', getDistrictsByState);
router.get('/locations/:state/:district', getLocationsByDistrict);

export default router;
