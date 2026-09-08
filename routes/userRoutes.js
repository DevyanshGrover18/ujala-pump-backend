import express from 'express';
import UserRole from '../models/UserRole.js';
import {
  verifyToken,
  checkPermission,
  checkSectionAccess,
} from '../middleware/roleMiddleware.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Create new user (requires management.add permission)
router.post(
  '/',
  verifyToken,
  checkPermission('management', 'add'),
  async (req, res) => {
    try {
      const {
        name,
        phone,
        username,
        password,
        accessControl,
        assignedFactories,
      } = req.body;

      // Check if username already exists
      const existingUser = await UserRole.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      const cleanPhone = phone ? String(phone).trim() : '';
      if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
      }

      // Create new user
      const user = new UserRole({
        name,
        phone: cleanPhone,
        username,
        password, // Pass plain password, model middleware will hash it
        accessControl,
        assignedFactories: assignedFactories || [],
        createdBy: req.user.id,
      });

      await user.save();

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      res.status(201).json(userResponse);
    } catch (error) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((val) => val.message);
        return res.status(400).json({ message: messages.join(', ') });
      }
      res
        .status(500)
        .json({ message: 'Error creating user', error: error.message });
    }
  }
);

// Get all users (requires any management permission)
router.get(
  '/',
  verifyToken,
  checkSectionAccess('management'),
  async (req, res) => {
    try {
      const users = await UserRole.find()
        .select('-password')
        .populate('createdBy', 'name username');
      res.json(users);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error fetching users', error: error.message });
    }
  }
);

// Get user by ID (requires management.modify permission)
router.get(
  '/:id',
  verifyToken,
  checkPermission('management', 'modify'),
  async (req, res) => {
    try {
      const user = await UserRole.findById(req.params.id)
        .select('-password')
        .populate('createdBy', 'name username');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error fetching user', error: error.message });
    }
  }
);

// Update user (requires management.modify permission)
router.put(
  '/:id',
  verifyToken,
  checkPermission('management', 'modify'),
  async (req, res) => {
    try {
      const {
        name,
        phone,
        username,
        password,
        accessControl,
        isActive,
        assignedFactories,
      } = req.body;

      if (phone !== undefined) {
        const cleanPhone = String(phone).trim();
        if (!/^\d{10}$/.test(cleanPhone)) {
          return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
        }
      }

      // Check if username exists for other users
      if (username) {
        const existingUser = await UserRole.findOne({
          username,
          _id: { $ne: req.params.id },
        });
        if (existingUser) {
          return res.status(400).json({ message: 'Username already exists' });
        }
      }

      let updateData = {
        name,
        phone: phone ? String(phone).trim() : undefined,
        username,
        accessControl,
        isActive,
        assignedFactories,
      };

      // Only update password if provided
      if (password) {
        updateData.password = password; // Pass plain password, model middleware will hash it
      }

      const user = await UserRole.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // We need to use save() to trigger the pre-save hook for password hashing
      // So we update properties manually instead of using findByIdAndUpdate
      if (name) user.name = name;
      if (phone) user.phone = String(phone).trim();
      if (username) user.username = username;
      if (accessControl) user.accessControl = accessControl;
      if (typeof isActive !== 'undefined') user.isActive = isActive;
      if (assignedFactories) user.assignedFactories = assignedFactories;
      if (password) user.password = password;

      await user.save();

      // Return user without password
      const userResponse = user.toObject();
      delete userResponse.password;

      res.json(userResponse);
    } catch (error) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((val) => val.message);
        return res.status(400).json({ message: messages.join(', ') });
      }
      res
        .status(500)
        .json({ message: 'Error updating user', error: error.message });
    }
  }
);

// Delete user (requires management.delete permission)
router.delete(
  '/:id',
  verifyToken,
  checkPermission('management', 'delete'),
  async (req, res) => {
    try {
      const user = await UserRole.findByIdAndDelete(req.params.id);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error deleting user', error: error.message });
    }
  }
);

// Get current user's permissions
router.get('/me/permissions', verifyToken, async (req, res) => {
  try {
    const user = await UserRole.findById(req.user.id).select('accessControl');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.accessControl);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching permissions', error: error.message });
  }
});

export default router;
