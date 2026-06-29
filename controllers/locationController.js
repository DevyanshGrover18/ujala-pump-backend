import { states } from '../utils/locationData.js';

// @desc    Get all states
// @route   GET /api/locations/states
// @access  Public
const getStates = (req, res) => {
  const stateNames = states.map((s) => s.state);
  res.status(200).json(stateNames);
};

// @desc    Get districts by state
// @route   GET /api/locations/districts/:state
// @access  Public
const getDistrictsByState = (req, res) => {
  const { state } = req.params;
  const stateData = states.find((s) => s.state === state);
  if (stateData) {
    const districtNames = stateData.districts.map((d) => d.district);
    res.status(200).json(districtNames);
  } else {
    res.status(404).json({ message: 'State not found' });
  }
};

// @desc    Get locations by district
// @route   GET /api/locations/locations/:state/:district
// @access  Public
const getLocationsByDistrict = (req, res) => {
  const { state, district } = req.params;
  const stateData = states.find((s) => s.state === state);
  if (stateData) {
    const districtData = stateData.districts.find(
      (d) => d.district === district
    );
    if (districtData) {
      res.status(200).json(districtData.areas);
    } else {
      res.status(404).json({ message: 'District not found' });
    }
  } else {
    res.status(404).json({ message: 'State not found' });
  }
};

export { getStates, getDistrictsByState, getLocationsByDistrict };
