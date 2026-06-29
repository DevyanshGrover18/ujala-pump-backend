import Distributor from '../models/Distributor.js';
import Product from '../models/Product.js';
import User from '../models/User.js'; // Import User model
import Dealer from '../models/Dealer.js'; // Import Dealer model
import bcrypt from 'bcryptjs'; // Import bcrypt for password hashing
import mongoose from 'mongoose';
import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import Sale from '../models/Sale.js';

export const getDistributors = async (req, res) => {
  try {
    const { search } = req.query;
    let matchQuery = {};

    if (search) {
      matchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { state: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } },
        ],
      };
    }

    // Role-based authorization for executives
    if (req.user && req.user.role === 'executive') {
      const Executive = (await import('../models/Executive.js')).default;
      const exec = await Executive.findOne({ user: req.user.id });
      if (exec) {
        matchQuery._id = { $in: exec.distributors || [] };
      } else {
        matchQuery._id = { $in: [] };
      }
    }

    // Count only available products for each distributor: not sold and not assigned to any dealer
    const distributors = await Distributor.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'products',
          let: { distributorId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$distributor', '$$distributorId'] },
                    { $ne: ['$sold', true] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'distributordealerproducts',
                localField: '_id',
                foreignField: 'product',
                as: 'assignment',
              },
            },
            { $match: { $expr: { $eq: [{ $size: '$assignment' }, 0] } } },
          ],
          as: 'availableProducts',
        },
      },
      {
        $lookup: {
          from: 'dealers',
          localField: 'dealers',
          foreignField: '_id',
          as: 'dealerDetails',
        },
      },
      {
        $lookup: {
          from: 'distributordealerproducts',
          localField: '_id',
          foreignField: 'distributor',
          as: 'dealerSales',
        },
      },
      {
        $lookup: {
          from: 'sales',
          let: { distId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$distributor', '$$distId'] },
                    { $eq: [{ $ifNull: ['$dealer', null] }, null] }
                  ]
                }
              }
            }
          ],
          as: 'customerSales',
        },
      },
      {
        $addFields: {
          productCount: { $size: '$availableProducts' },
          inventoryCount: { $size: '$availableProducts' },
          salesCount: { $add: [{ $size: '$dealerSales' }, { $size: '$customerSales' }] },
          dealerCount: {
            $size: {
              $filter: {
                input: '$dealerDetails',
                as: 'dealer',
                cond: { $eq: ['$$dealer.status', 'Active'] },
              },
            },
          },
        },
      },
      {
        $project: {
          availableProducts: 0,
          dealerDetails: 0, // Clean up the temporary field
          dealerSales: 0,
          customerSales: 0,
        },
      },
      { $sort: { name: 1 } },
    ]);

    res.json(distributors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createDistributor = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      addressLine1,
      addressLine2,
      username,
      password,
      state,
      district,
      location,
      pincode,
      gstNumber,
      contactPerson,
      contactPhone,
    } = req.body;

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: 'Password must be at least 8 characters' });
    }

    // Check if username already exists in User model
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Find the latest distributor to get the last distributor ID
    const latestDistributor = await Distributor.findOne().sort({
      distributorId: -1,
    });

    // Generate new distributor ID
    let newDistributorId;
    if (latestDistributor) {
      const lastNumber = parseInt(
        latestDistributor.distributorId.replace('DIST', '')
      );
      newDistributorId = `DIST${String(lastNumber + 1).padStart(5, '0')}`;
    } else {
      newDistributorId = 'DIST00001';
    }

    // Create the Distributor entry
    const distributor = new Distributor({
      name,
      email,
      phone,
      addressLine1,
      addressLine2,
      username,
      password, // Password will be hashed by pre-save hook in Distributor model
      state,
      district,
      location,
      pincode,
      gstNumber,
      contactPerson,
      contactPhone,
      distributorId: newDistributorId,
    });

    const createdDistributor = await distributor.save();

    await User.create({
      username,
      password: password,
      role: 'distributor',
      distributor: createdDistributor._id, // Link to the newly created distributor
    });

    res.status(201).json(createdDistributor);
  } catch (error) {
    console.error('Error creating distributor:', error);
    res.status(400).json({ message: error.message });
  }
};

export const updateDistributor = async (req, res) => {
  try {
    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) {
      return res.status(404).json({ message: 'Distributor not found' });
    }

    const { username, password, ...updateData } = req.body;

    if (username && username !== distributor.username) {
      const userExists = await User.findOne({
        username,
        _id: { $ne: distributor._id },
      });

      if (userExists) {
        return res.status(400).json({ message: 'Username already taken' });
      }

      updateData.username = username;

      await User.findOneAndUpdate(
        { distributor: distributor._id },
        { username }
      );
    }

    if (password) {
      // Update Distributor password - will be hashed by pre-save middleware
      distributor.password = password;
      await distributor.save();

      // Update User password - will be hashed by pre-save middleware
      const user = await User.findOne({ distributor: distributor._id });
      if (user) {
        user.password = password;
        await user.save();
      }
    } else {
      // If no password change, just update other fields
      await Distributor.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );
    }

    // Re-fetch distributor with updated fields
    const updatedDistributor = await Distributor.findById(req.params.id)

    res.json(updatedDistributor);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteDistributor = async (req, res) => {
  try {
    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) {
      return res.status(404).json({ message: 'Distributor not found' });
    }

    await distributor.deleteOne();
    res.json({ message: 'Distributor removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteMultipleDistributors = async (req, res) => {
  try {
    const { distributorIds } = req.body;
    if (!distributorIds || distributorIds.length === 0) {
      return res.status(400).json({ message: 'No distributor IDs provided' });
    }
    await Distributor.deleteMany({ _id: { $in: distributorIds } });
    res.json({ message: 'Distributors deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDistributorProducts = async (req, res) => {
  try {
    const { id } = req.params; // Distributor ID

    const products = await Product.aggregate([
      {
        $match: {
          distributor: new mongoose.Types.ObjectId(id),
          sold: { $ne: true },
        },
      },
      {
        $lookup: {
          from: 'distributordealerproducts',
          localField: '_id',
          foreignField: 'product',
          as: 'assignment',
        },
      },
      {
        $match: {
          assignment: { $size: 0 },
        },
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'category',
        },
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'models',
          localField: 'model',
          foreignField: '_id',
          as: 'model',
        },
      },
      {
        $unwind: {
          path: '$model',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'factories',
          localField: 'factory',
          foreignField: '_id',
          as: 'factory',
        },
      },
      {
        $unwind: {
          path: '$factory',
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDistributorProductModels = async (req, res) => {
  try {
    const { id } = req.params; // Distributor ID

    const models = await Product.aggregate([
      {
        $match: {
          distributor: new mongoose.Types.ObjectId(id),
          sold: { $ne: true },
        },
      },

      {
        $lookup: {
          from: 'distributordealerproducts',
          localField: '_id',
          foreignField: 'product',
          as: 'assignment',
        },
      },
      {
        $match: {
          assignment: { $size: 0 },
        },
      },

      {
        $lookup: {
          from: 'models',
          localField: 'model',
          foreignField: '_id',
          as: 'model',
        },
      },
      { $unwind: '$model' },

      {
        $group: {
          _id: '$model._id',
          name: { $first: '$model.name' },
        },
      },

      {
        $sort: { name: 1 },
      },
    ]);

    res.json(models);
  } catch (error) {
    console.error('Distributor product models error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const updateDistributorStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const distributor = await Distributor.findById(req.params.id);

    if (!distributor) {
      return res.status(404).json({ message: 'Distributor not found' });
    }

    distributor.status = status;
    await distributor.save();

    res.json(distributor);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getDistributorDealers = async (req, res) => {
  try {
    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) {
      return res.status(404).json({ message: 'Distributor not found' });
    }

    const dealers = await Distributor.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(req.params.id) },
      },
      { $unwind: '$dealers' },
      {
        $lookup: {
          from: 'dealers',
          localField: 'dealers',
          foreignField: '_id',
          as: 'dealerInfo',
        },
      },
      { $unwind: '$dealerInfo' },
      {
        $lookup: {
          from: 'sales',
          let: { dId: '$dealerInfo._id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$dealer', '$$dId'] },
                // Sales table filter: Sub-dealer aur Customer nahi hone chahiye
                subDealer: { $exists: false },
                customerName: { $exists: false },
              },
            },
            // Product table se check karna ki 'sold' true toh nahi hai
            {
              $lookup: {
                from: 'products',
                localField: 'product',
                foreignField: '_id',
                as: 'productDetails',
              },
            },
            { $unwind: '$productDetails' },
            {
              $match: {
                'productDetails.sold': { $ne: true }, // Sirf wo count honge jo sold: true nahi hain
              },
            },
            {
              $group: { _id: '$product' }, // Unique product count
            },
          ],
          as: 'inventoryItems',
        },
      },
      {
        $addFields: {
          'dealerInfo.productCount': { $size: '$inventoryItems' },
        },
      },
      {
        $lookup: {
          from: 'subdealers',
          localField: 'dealerInfo._id',
          foreignField: 'dealer',
          as: 'subDealers',
        },
      },
      {
        $addFields: {
          'dealerInfo.subDealerCount': { $size: '$subDealers' },
        },
      },
      { $replaceRoot: { newRoot: '$dealerInfo' } },
      { $project: { password: 0 } },
    ]);

    res.json(dealers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createDealerForDistributor = async (req, res) => {
  try {
    const { id } = req.params; // Distributor ID
    const {
      name,
      email,
      contactPhone,
      addressLine1,
      addressLine2,
      district,
      pincode,
      username,
      password,
      state,
      location,
      contactPerson,
    } = req.body;

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: 'Password must be at least 8 characters' });
    }

    // Check required fields manually (optional but clean)
    if (!addressLine1 || !district || !pincode) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: {
          addressLine1: !addressLine1 ? 'addressLine1 is required' : undefined,
          district: !district ? 'district is required' : undefined,
          pincode: !pincode ? 'pincode is required' : undefined,
        },
      });
    }

    // Check if username already exists
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Find the latest dealer to get the last dealer ID
    const latestDealer = await Dealer.findOne().sort({ dealerId: -1 });

    // Generate new dealer ID
    let newDealerId;
    if (latestDealer) {
      const lastNumber = parseInt(latestDealer.dealerId.replace('DEAL', ''));
      newDealerId = `DEAL${String(lastNumber + 1).padStart(5, '0')}`;
    } else {
      newDealerId = 'DEAL00001';
    }

    // Create the Dealer entry including new fields
    const dealer = new Dealer({
      name,
      email,
      contactPhone,
      addressLine1,
      addressLine2,
      district,
      pincode,
      username,
      password,
      state,
      location,
      contactPerson,
      distributor: id,
      dealerId: newDealerId,
    });

    const createdDealer = await dealer.save();

    // Add dealer to distributor's dealers array
    await Distributor.findByIdAndUpdate(
      id,
      { $push: { dealers: createdDealer._id } },
      { new: true }
    );

    // Create a corresponding User entry for authentication
    // Password will be hashed by User model's pre-save middleware
    await User.create({
      username,
      password: password,
      role: 'dealer',
      dealer: createdDealer._id,
    });

    const dealerResponse = createdDealer.toObject();
    delete dealerResponse.password;

    res.status(201).json(dealerResponse);
  } catch (error) {
    console.error('Error creating dealer for distributor:', error);

    // Handle mongoose validation errors cleanly
    if (error.name === 'ValidationError') {
      const errors = {};
      for (let field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      return res.status(400).json({
        message: 'Dealer validation failed',
        errors,
      });
    }

    res.status(400).json({ message: error.message });
  }
};

export const updateDealerForDistributor = async (req, res) => {
  try {
    const { dealerId } = req.params; // Distributor ID and Dealer ID

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer not found' });
    }

    // Exclude username and password from update data
    const { username, password, ...updateData } = req.body;

    // Only update username if it's provided and different
    if (username && username !== dealer.username) {
      // Check if new username already exists
      const userExists = await User.findOne({
        username,
        _id: { $ne: dealer._id },
      });
      if (userExists) {
        return res.status(400).json({ message: 'Username already taken' });
      }
      updateData.username = username;

      // Update username in User model as well
      await User.findOneAndUpdate(
        { dealer: dealer._id },
        { username: username }
      );
    }

    // Only update password if it's provided
    if (password) {
      // Update Dealer password - will be hashed by pre-save middleware
      dealer.password = password;
      await dealer.save();

      // Update User password - will be hashed by pre-save middleware
      const user = await User.findOne({ dealer: dealer._id });
      if (user) {
        user.password = password;
        await user.save();
      }
    } else {
      // If no password change, just update other fields
      await Dealer.findByIdAndUpdate(dealerId, updateData, {
        new: true,
        runValidators: true,
      });
    }

    // Re-fetch dealer with updated fields
    const updatedDealer = await Dealer.findById(dealerId).select('-password');

    res.json(updatedDealer);
  } catch (error) {
    console.error('Error updating dealer for distributor:', error);
    res.status(400).json({ message: error.message });
  }
};

export const getDistributorSalesCombined = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate request role-based access if executive
    if (req.user && req.user.role === 'executive') {
      const Executive = (await import('../models/Executive.js')).default;
      const exec = await Executive.findOne({ user: req.user.id });
      if (!exec || !exec.distributors.includes(id)) {
        return res.status(403).json({ message: 'Access denied. This distributor is not assigned to you.' });
      }
    }

    const dealerSales = await DistributorDealerProduct.find({ distributor: id })
      .populate({
        path: 'product',
        populate: { path: 'model' }
      })
      .populate('dealer', 'name');

    const customerSales = await Sale.find({
      distributor: id,
      dealer: null,
      subDealer: null,
      customerName: { $exists: true, $ne: '' }
    })
      .populate({
        path: 'product',
        populate: { path: 'model' }
      });

    const combined = [
      ...dealerSales.map(ds => ({
        _id: ds._id,
        serialNumber: ds.product?.serialNumber,
        modelName: ds.product?.model?.name || 'Unknown',
        type: 'Dealer Sale',
        soldTo: ds.dealer?.name || 'Unknown Dealer',
        date: ds.createdAt
      })),
      ...customerSales.map(cs => ({
        _id: cs._id,
        serialNumber: cs.product?.serialNumber,
        modelName: cs.product?.model?.name || 'Unknown',
        type: 'Direct Customer Sale',
        soldTo: cs.customerName || 'Customer',
        date: cs.createdAt
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(combined);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
