import Plumber from '../models/Plumber.js';
import User from '../models/User.js';
import Installation from '../models/Installation.js';
import IncentiveClaim from '../models/IncentiveClaim.js';

export const getPlumbers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { plumberId: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { state: { $regex: search, $options: 'i' } },
          { district: { $regex: search, $options: 'i' } },
        ],
      };
    }

    const plumbers = await Plumber.find(query).sort({ name: 1 });
    res.json(plumbers);
  } catch (error) {
    console.error('Error fetching plumbers:', error);
    res.status(500).json({ message: error.message });
  }
};

export const createPlumber = async (req, res) => {
  try {
    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      state,
      district,
      location,
      pincode,
      username,
      password,
    } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check username uniqueness
    const userExists = await User.findOne({ username: username.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Generate unique plumberId
    const latestPlumber = await Plumber.findOne().sort({ plumberId: -1 });
    let newPlumberId = 'PLUM0001';
    if (latestPlumber && latestPlumber.plumberId) {
      const match = latestPlumber.plumberId.match(/PLUM(\d+)/);
      if (match) {
        const nextNum = parseInt(match[1]) + 1;
        newPlumberId = `PLUM${String(nextNum).padStart(4, '0')}`;
      }
    }

    const plumber = new Plumber({
      name,
      phone,
      addressLine1,
      addressLine2,
      state,
      district,
      location,
      pincode,
      username: username.toLowerCase(),
      password,
      plumberId: newPlumberId,
    });

    const createdPlumber = await plumber.save();

    await User.create({
      username: username.toLowerCase(),
      password,
      role: 'plumber',
      plumber: createdPlumber._id,
    });

    res.status(201).json(createdPlumber);
  } catch (error) {
    console.error('Error creating plumber:', error);
    res.status(400).json({ message: error.message });
  }
};

export const registerPlumber = async (req, res) => {
  // Public registration endpoint
  return createPlumber(req, res);
};

export const updatePlumber = async (req, res) => {
  try {
    const plumber = await Plumber.findById(req.params.id);
    if (!plumber) {
      return res.status(404).json({ message: 'Plumber not found' });
    }

    const { username, password, status, ...updateData } = req.body;

    if (username && username.toLowerCase() !== plumber.username) {
      const userExists = await User.findOne({
        username: username.toLowerCase(),
        _id: { $ne: plumber._id },
      });
      if (userExists) {
        return res.status(400).json({ message: 'Username already taken' });
      }

      plumber.username = username.toLowerCase();
      await User.findOneAndUpdate(
        { plumber: plumber._id },
        { username: username.toLowerCase() }
      );
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }
      plumber.password = password; // pre-save hook will hash it
      const dbUser = await User.findOne({ plumber: plumber._id });
      if (dbUser) {
        dbUser.password = password;
        await dbUser.save();
      }
    }

    if (status) {
      plumber.status = status;
      await User.findOneAndUpdate(
        { plumber: plumber._id },
        { isActive: status === 'Active' }
      );
    }

    Object.assign(plumber, updateData);
    const updatedPlumber = await plumber.save();

    res.json(updatedPlumber);
  } catch (error) {
    console.error('Error updating plumber:', error);
    res.status(400).json({ message: error.message });
  }
};

export const deletePlumber = async (req, res) => {
  try {
    const plumber = await Plumber.findById(req.params.id);
    if (!plumber) {
      return res.status(404).json({ message: 'Plumber not found' });
    }

    // Instead of hard deleting, we deactivate to preserve installation/incentive history
    plumber.status = 'Inactive';
    await plumber.save();

    await User.findOneAndUpdate({ plumber: plumber._id }, { isActive: false });

    res.json({ message: 'Plumber deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating plumber:', error);
    res.status(500).json({ message: error.message });
  }
};
