import User from '../models/User.js';

// Create a new user
export const createUser = async (req, res) => {
  try {
    const { name, phone, username, password, privileges } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const user = await User.create({
      name,
      phone,
      username,
      password,
      privileges,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      phone: user.phone,
      username: user.username,
      privileges: user.privileges,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all users
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update user privileges
export const updateUserPrivileges = async (req, res) => {
  try {
    const { id } = req.params;
    const { privileges } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.privileges = privileges;
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      privileges: user.privileges,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.remove();
    res.json({ message: 'User removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
