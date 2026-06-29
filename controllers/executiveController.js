import Executive from '../models/Executive.js';
import User from '../models/User.js';
import Dealer from '../models/Dealer.js';
import SubDealer from '../models/SubDealer.js';
import mongoose from 'mongoose';
import Sale from '../models/Sale.js';

// Create a new Executive
export const createExecutive = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      name,
      phone,
      username,
      password,
      distributors,
      dealers,
      subDealers,
      isActive,
      state,
      district,
      location,
      addressLine1,
      addressLine2,
      pincode,
      gstNumber,
      contactPerson,
      contactPhone,
      email,
    } = req.body;

    // Check if username already exists
    const userExists = await User.findOne({ username });
    if (userExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Server-side validation of hierarchy
    // 1. Check that all selected dealers belong to selected distributors
    if (dealers && dealers.length > 0) {
      const dealerDocs = await Dealer.find({ _id: { $in: dealers } }).session(session);
      for (const d of dealerDocs) {
        if (!distributors.includes(d.distributor.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: `Dealer ${d.name} does not belong to the selected distributors.` });
        }
      }
    }

    // 2. Check that all selected subdealers belong to selected dealers
    if (subDealers && subDealers.length > 0) {
      const subDealerDocs = await SubDealer.find({ _id: { $in: subDealers } }).session(session);
      for (const sd of subDealerDocs) {
        if (!dealers.includes(sd.dealer.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: `Sub Dealer ${sd.name} does not belong to the selected dealers.` });
        }
      }
    }

    // Generate ObjectId for the Executive beforehand to resolve User model schema validation
    const executiveId = new mongoose.Types.ObjectId();

    // Create User record
    const user = new User({
      username,
      password,
      role: 'executive',
      executive: executiveId,
      isActive: typeof isActive !== 'undefined' ? isActive : true,
    });
    const savedUser = await user.save({ session });

    // Create Executive record
    const executive = new Executive({
      _id: executiveId,
      name,
      phone,
      username,
      distributors: distributors || [],
      dealers: dealers || [],
      subDealers: subDealers || [],
      isActive: typeof isActive !== 'undefined' ? isActive : true,
      user: savedUser._id,
      state,
      district,
      location,
      addressLine1,
      addressLine2,
      pincode,
      gstNumber,
      contactPerson,
      contactPhone,
      email,
    });
    const savedExecutive = await executive.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(savedExecutive);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};

// Get all Executives
export const getExecutives = async (req, res) => {
  try {
    const executives = await Executive.find()
      .populate('distributors', 'name distributorId')
      .populate('dealers', 'name dealerId')
      .populate('subDealers', 'name subDealerId')
      .sort({ createdAt: -1 });
    res.json(executives);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single Executive
export const getExecutive = async (req, res) => {
  try {
    const executive = await Executive.findById(req.params.id)
      .populate('distributors')
      .populate('dealers')
      .populate('subDealers');
    if (!executive) {
      return res.status(404).json({ message: 'Executive not found' });
    }
    res.json(executive);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Executive
export const updateExecutive = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      name,
      phone,
      username,
      password,
      distributors,
      dealers,
      subDealers,
      isActive,
      state,
      district,
      location,
      addressLine1,
      addressLine2,
      pincode,
      gstNumber,
      contactPerson,
      contactPhone,
      email,
    } = req.body;
    const executive = await Executive.findById(req.params.id).session(session);

    if (!executive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Executive not found' });
    }

    // Username unique check
    if (username && username !== executive.username) {
      const userExists = await User.findOne({ username, _id: { $ne: executive.user } }).session(session);
      if (userExists) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Username already taken' });
      }
      executive.username = username;
      await User.findByIdAndUpdate(executive.user, { username }, { session });
    }

    // Server-side validation of hierarchy
    // 1. Check that all selected dealers belong to selected distributors
    if (dealers && dealers.length > 0) {
      const dealerDocs = await Dealer.find({ _id: { $in: dealers } }).session(session);
      for (const d of dealerDocs) {
        if (!distributors.includes(d.distributor.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: `Dealer ${d.name} does not belong to the selected distributors.` });
        }
      }
    }

    // 2. Check that all selected subdealers belong to selected dealers
    if (subDealers && subDealers.length > 0) {
      const subDealerDocs = await SubDealer.find({ _id: { $in: subDealers } }).session(session);
      for (const sd of subDealerDocs) {
        if (!dealers.includes(sd.dealer.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: `Sub Dealer ${sd.name} does not belong to the selected dealers.` });
        }
      }
    }

    if (name) executive.name = name;
    if (phone) executive.phone = phone;
    if (distributors) executive.distributors = distributors;
    if (dealers) executive.dealers = dealers;
    if (subDealers) executive.subDealers = subDealers;
    if (typeof isActive !== 'undefined') {
      executive.isActive = isActive;
      await User.findByIdAndUpdate(executive.user, { isActive }, { session });
    }

    if (state !== undefined) executive.state = state;
    if (district !== undefined) executive.district = district;
    if (location !== undefined) executive.location = location;
    if (addressLine1 !== undefined) executive.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) executive.addressLine2 = addressLine2;
    if (pincode !== undefined) executive.pincode = pincode;
    if (gstNumber !== undefined) executive.gstNumber = gstNumber;
    if (contactPerson !== undefined) executive.contactPerson = contactPerson;
    if (contactPhone !== undefined) executive.contactPhone = contactPhone;
    if (email !== undefined) executive.email = email;

    // Update password if provided
    if (password) {
      const userObj = await User.findById(executive.user).session(session);
      if (userObj) {
        userObj.password = password; // Trigger hashing pre-save
        await userObj.save({ session });
      }
    }

    const updated = await executive.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Executive.findById(updated._id)
      .populate('distributors')
      .populate('dealers')
      .populate('subDealers');

    res.json(populated);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};

// Delete Executive
export const deleteExecutive = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const executive = await Executive.findById(req.params.id).session(session);
    if (!executive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Executive not found' });
    }

    await User.findByIdAndDelete(executive.user).session(session);
    await Executive.findByIdAndDelete(req.params.id).session(session);

    await session.commitTransaction();
    session.endSession();
    res.json({ message: 'Executive deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};

export const getExecutiveCustomers = async (req, res) => {
  try {
    const exec = await Executive.findOne({ user: req.user.id });
    if (!exec) {
      return res.status(404).json({ message: 'Executive profile not found' });
    }

    const { search } = req.query;
    let query = {
      distributor: { $in: exec.distributors },
      customerName: { $exists: true, $ne: '' }
    };

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { customerAddress: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await Sale.find(query)
      .populate('distributor', 'name')
      .populate('dealer', 'name')
      .populate('subDealer', 'name')
      .populate({
        path: 'product',
        populate: { path: 'model' }
      })
      .sort({ saleDate: -1, createdAt: -1 });

    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
