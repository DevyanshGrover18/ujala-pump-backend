import DistributorRequest from '../models/DistributorRequest.js';
import Distributor from '../models/Distributor.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// @desc    Request to register as a distributor
// @route   POST /api/distributor-requests
// @access  Public
export const createDistributorRequest = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      addressLine1,
      addressLine2,
      state,
      district,
      pincode,
      location,
      territory,
      contactPerson,
      contactPhone,
    } = req.body;

    // Check if a request with this email already exists
    const existingRequest = await DistributorRequest.findOne({
      email,
      status: 'pending',
    });
    if (existingRequest) {
      return res
        .status(400)
        .json({ message: 'A pending request with this email already exists.' });
    }

    const distributorRequest = new DistributorRequest({
      name,
      email,
      phone,
      addressLine1,
      addressLine2,
      state,
      district,
      pincode,
      location,
      territory,
      contactPerson,
      contactPhone,
    });

    const createdRequest = await distributorRequest.save();
    res.status(201).json(createdRequest);
  } catch (error) {
    console.error('Error creating distributor request:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all pending distributor requests
// @route   GET /api/distributor-requests/pending
// @access  Private/Admin
export const getPendingDistributorRequests = async (req, res) => {
  try {
    const requests = await DistributorRequest.find({ status: 'pending' }).sort({
      requestedAt: -1,
    });
    res.json(requests);
  } catch (error) {
    console.error('Error fetching pending distributor requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Approve a distributor request and create distributor/user
// @route   PUT /api/distributor-requests/:id/approve
// @access  Private/Admin
export const approveDistributorRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password } = req.body; // Admin sets username and password

    const request = await DistributorRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: 'Distributor request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending.' });
    }

    // Validate username and password provided by admin
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: 'Username and password are required for approval.' });
    }

    // Check if username already exists in User model or Distributor model
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Username already taken.' });
    }
    const distributorWithUsernameExists = await Distributor.findOne({
      username,
    });
    if (distributorWithUsernameExists) {
      return res
        .status(400)
        .json({ message: 'Username already taken by another distributor.' });
    }

    // Generate new distributor ID
    const latestDistributor = await Distributor.findOne().sort({
      distributorId: -1,
    });
    let newDistributorId;
    if (latestDistributor) {
      const lastNumber = parseInt(
        latestDistributor.distributorId.replace('DIST', '')
      );
      newDistributorId = `DIST${String(lastNumber + 1).padStart(5, '0')}`;
    } else {
      newDistributorId = 'DIST00001';
    }

    // 1. Create the Distributor entry
    const newDistributor = new Distributor({
      name: request.name,
      email: request.email,
      phone: request.phone,
      addressLine1: request.addressLine1,
      addressLine2: request.addressLine2,
      state: request.state,
      district: request.district,
      pincode: request.pincode,
      location: request.location,
      territory: request.territory,
      contactPerson: request.contactPerson,
      contactPhone: request.contactPhone,
      username: username, // Use admin-provided username
      password: password, // Password will be hashed by pre-save hook in Distributor model
      distributorId: newDistributorId, // Set the generated distributorId
    });
    const createdDistributor = await newDistributor.save();

    // 2. Create a corresponding User entry for authentication
    // Password will be hashed by User model's pre-save middleware
    await User.create({
      username: username,
      password: password,
      role: 'distributor',
      distributor: createdDistributor._id, // Link to the newly created distributor
    });

    // 3. Update the request status
    request.status = 'approved';
    await request.save();

    res.json({
      message:
        'Distributor request approved and distributor created successfully.',
      distributor: createdDistributor,
    });
  } catch (error) {
    console.error('Error approving distributor request:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Reject a distributor request
// @route   PUT /api/distributor-requests/:id/reject
// @access  Private/Admin
export const rejectDistributorRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await DistributorRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: 'Distributor request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending.' });
    }

    request.status = 'rejected';
    await request.save();

    res.json({ message: 'Distributor request rejected successfully.' });
  } catch (error) {
    console.error('Error rejecting distributor request:', error);
    res.status(400).json({ message: error.message });
  }
};
