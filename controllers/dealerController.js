import Dealer from '../models/Dealer.js';
import Distributor from '../models/Distributor.js';
import SubDealer from '../models/SubDealer.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import Sale from '../models/Sale.js';
import DealerSubDealerProduct from '../models/DealerSubDealerProduct.js';

export const getDealers = async (req, res) => {
  try {
    const { search } = req.query;
    let matchQuery = {};

    if (search) {
      matchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { addressLine1: { $regex: search, $options: 'i' } },
          { state: { $regex: search, $options: 'i' } },
          { district: { $regex: search, $options: 'i' } },
        ],
      };
    }

    // Role-based authorization for executives
    if (req.user && req.user.role === 'executive') {
      const Executive = (await import('../models/Executive.js')).default;
      const exec = await Executive.findOne({ user: req.user.id });
      if (exec) {
        matchQuery._id = { $in: exec.dealers || [] };
      } else {
        matchQuery._id = { $in: [] };
      }
    }

    const dealers = await Dealer.aggregate([
      { $match: matchQuery },
      // Inventory Count Logic
      {
        $lookup: {
          from: 'sales',
          let: { dId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$dealer', '$$dId'] },
                // Filter: Aage kahi nahi gaya hona chahiye
                subDealer: { $exists: false },
                customerName: { $exists: false },
              },
            },
            // Product details check for 'sold' status
            {
              $lookup: {
                from: 'products',
                localField: 'product',
                foreignField: '_id',
                as: 'productInfo',
              },
            },
            { $unwind: '$productInfo' },
            {
              $match: { 'productInfo.sold': { $ne: true } },
            },
            { $group: { _id: '$product' } }, // Unique product count
          ],
          as: 'inventoryItems',
        },
      },
      // Sales Count Logic
      {
        $lookup: {
          from: 'sales',
          let: { dId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$dealer', '$$dId'] },
                $or: [
                  { subDealer: { $exists: true, $ne: null } },
                  { customerName: { $exists: true, $ne: null, $ne: '' } }
                ]
              }
            }
          ],
          as: 'salesItems',
        },
      },
      {
        $addFields: {
          productCount: { $size: '$inventoryItems' },
          inventoryCount: { $size: '$inventoryItems' },
          salesCount: { $size: '$salesItems' },
        },
      },
      // Sub-dealer Count
      {
        $lookup: {
          from: 'subdealers',
          localField: '_id',
          foreignField: 'dealer',
          as: 'subDealers',
        },
      },
      {
        $addFields: {
          subDealerCount: { $size: '$subDealers' },
        },
      },
      // Distributor Info
      {
        $lookup: {
          from: 'distributors',
          localField: 'distributor',
          foreignField: '_id',
          as: 'distributorInfo',
        },
      },
      {
        $unwind: {
          path: '$distributorInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          distributor: '$distributorInfo',
        },
      },
      {
        $project: {
          inventoryItems: 0,
          salesItems: 0,
          subDealers: 0,
          password: 0,
          distributorInfo: 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    res.json(dealers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createDealer = async (req, res) => {
  try {
    const { username, password, ...dealerData } = req.body;

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

    const dealer = new Dealer({
      ...dealerData,
      username,
      password,
      dealerId: newDealerId,
    });

    const createdDealer = await dealer.save();

    // Create a corresponding User entry for authentication
    // Password will be hashed by User model's pre-save middleware
    await User.create({
      username,
      password: password,
      role: 'dealer',
      dealer: createdDealer._id,
    });

    if (req.body.distributor) {
      await Distributor.findByIdAndUpdate(
        req.body.distributor,
        { $push: { dealers: createdDealer._id } },
        { new: true, useFindAndModify: false }
      );
    }

    const populatedDealer = await Dealer.findById(createdDealer._id)
      .populate('distributor')
      .select('-password');
    res.status(201).json(populatedDealer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);
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
      const updatedDealer = await Dealer.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );
    }

    // Re-fetch dealer with updated fields
    const updatedDealer = await Dealer.findById(req.params.id)
      .select('-password')
      .populate('distributor');

    // If the distributor is changed, update the old and new distributors
    if (
      req.body.distributor &&
      dealer.distributor?.toString() !== req.body.distributor
    ) {
      // Remove dealer from old distributor
      if (dealer.distributor) {
        await Distributor.findByIdAndUpdate(dealer.distributor, {
          $pull: { dealers: dealer._id },
        });
      }

      // Add dealer to new distributor
      await Distributor.findByIdAndUpdate(req.body.distributor, {
        $push: { dealers: dealer._id },
      });
    }

    res.json(updatedDealer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer not found' });
    }

    // Remove dealer from associated distributor's dealers array
    if (dealer.distributor) {
      await Distributor.findByIdAndUpdate(dealer.distributor, {
        $pull: { dealers: dealer._id },
      });
    }

    // Delete associated user account
    await User.findOneAndDelete({ dealer: dealer._id });

    await dealer.deleteOne();
    res.json({ message: 'Dealer removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteMultipleDealers = async (req, res) => {
  try {
    const { dealerIds } = req.body;
    if (!dealerIds || dealerIds.length === 0) {
      return res.status(400).json({ message: 'No dealer IDs provided' });
    }

    // Find all dealers to be deleted to get their distributor IDs
    const dealers = await Dealer.find({ _id: { $in: dealerIds } });
    if (dealers.length === 0) {
      return res.status(404).json({ message: 'No dealers found' });
    }

    // Group dealers by distributor
    const distributorMap = dealers.reduce((map, dealer) => {
      if (dealer.distributor) {
        const distributorId = dealer.distributor.toString();
        if (!map[distributorId]) {
          map[distributorId] = [];
        }
        map[distributorId].push(dealer._id);
      }
      return map;
    }, {});

    // Remove dealers from their respective distributors
    for (const distributorId in distributorMap) {
      await Distributor.findByIdAndUpdate(distributorId, {
        $pull: { dealers: { $in: distributorMap[distributorId] } },
      });
    }

    // Delete associated user accounts
    await User.deleteMany({ dealer: { $in: dealerIds } });

    await Dealer.deleteMany({ _id: { $in: dealerIds } });
    res.json({ message: 'Dealers deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDealersToSubDealer = async (req, res) => {
  try {
    const dealerId = req.params.id;

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer not found' });
    }

    const subDealers = await SubDealer.find({ dealer: dealerId })
      .select('-password')
      .lean();

    res.json(subDealers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getDealerSalesCombined = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request role-based access if executive
    if (req.user && req.user.role === 'executive') {
      const Executive = (await import('../models/Executive.js')).default;
      const exec = await Executive.findOne({ user: req.user.id });
      if (!exec || !exec.dealers.includes(id)) {
        return res.status(403).json({ message: 'Access denied. This dealer is not assigned to you.' });
      }
    }

    const subDealerSales = await DealerSubDealerProduct.find({ dealer: id })
      .populate({
        path: 'product',
        populate: { path: 'model' }
      })
      .populate('subDealer', 'name');

    const customerSales = await Sale.find({
      dealer: id,
      subDealer: null,
      customerName: { $exists: true, $ne: '' }
    })
      .populate({
        path: 'product',
        populate: { path: 'model' }
      });

    const combined = [
      ...subDealerSales.map(s => ({
        _id: s._id,
        serialNumber: s.product?.serialNumber,
        modelName: s.product?.model?.name || 'Unknown',
        type: 'Sub Dealer Sale',
        soldTo: s.subDealer?.name || 'Unknown Sub Dealer',
        date: s.createdAt
      })),
      ...customerSales.map(c => ({
        _id: c._id,
        serialNumber: c.product?.serialNumber,
        modelName: c.product?.model?.name || 'Unknown',
        type: 'Direct Customer Sale',
        soldTo: c.customerName || 'Customer',
        date: c.createdAt
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(combined);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDealerInventoryCombined = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request role-based access if executive
    if (req.user && req.user.role === 'executive') {
      const Executive = (await import('../models/Executive.js')).default;
      const exec = await Executive.findOne({ user: req.user.id });
      if (!exec || !exec.dealers.includes(id)) {
        return res.status(403).json({ message: 'Access denied. This dealer is not assigned to you.' });
      }
    }

    const inventory = await Sale.find({
      dealer: id,
      subDealer: null,
      customerName: { $exists: false }
    })
      .populate({
        path: 'product',
        populate: { path: 'model' }
      });

    res.json(inventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
