import SubDealer from '../models/SubDealer.js';
import Dealer from '../models/Dealer.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

export const getSubDealers = async (req, res) => {
  try {
    const dealerIdParam = req.params?.dealerId;
    const dealerIdQuery = req.query?.dealerId;
    const dealerId = dealerIdParam || dealerIdQuery;

    let matchQuery = {};

    if (req.path === '/dealer/my-sub-dealers' && req.user.role === 'dealer') {
      matchQuery.dealer = new mongoose.Types.ObjectId(req.user.dealer);
    } else if (dealerId) {
      matchQuery.dealer = new mongoose.Types.ObjectId(dealerId);
    }

    const subDealers = await SubDealer.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'sales',
          let: { subDealerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$subDealer', '$$subDealerId'] },
                // Logic: Sub-dealer ki inventory tabhi mani jayegi
                // jab customerName nahi bhara gaya ho
                customerName: { $exists: false },
              },
            },
            // Ensure product collection mein bhi 'sold' true na ho
            {
              $lookup: {
                from: 'products',
                localField: 'product',
                foreignField: '_id',
                as: 'productInfo',
              },
            },
            { $unwind: '$productInfo' },
            { $match: { 'productInfo.sold': { $ne: true } } },
            { $group: { _id: '$product' } }, // Unique product count
          ],
          as: 'inventoryItems',
        },
      },
      {
        $addFields: {
          productCount: { $size: '$inventoryItems' },
        },
      },
      {
        $lookup: {
          from: 'dealers',
          localField: 'dealer',
          foreignField: '_id',
          as: 'dealer',
        },
      },
      {
        $unwind: {
          path: '$dealer',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          inventoryItems: 0,
          password: 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    res.json(subDealers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createSubDealer = async (req, res) => {
  try {
    const { username, password, dealer: dealerBody, ...rest } = req.body;
    const dealerParam = req.params.dealerId;

    let dealerIdToUse = dealerParam || dealerBody;

    // If dealer is creating their own sub-dealer, use their dealer ID
    if (req.path === '/dealer/sub-dealers' && req.user.role === 'dealer') {
      dealerIdToUse = req.user.dealer;
    }

    // Check username
    const userExists = await User.findOne({ username });
    if (userExists)
      return res.status(400).json({ message: 'Username already taken' });

    // Generate subDealerId
    const latest = await SubDealer.findOne().sort({ subDealerId: -1 });
    let newId;
    if (latest) {
      const lastNumber = parseInt(latest.subDealerId.replace('SUBD', ''));
      newId = `SUBD${String(lastNumber + 1).padStart(5, '0')}`;
    } else {
      newId = 'SUBD00001';
    }

    const subDealer = new SubDealer({
      ...rest,
      username,
      password,
      subDealerId: newId,
      dealer: dealerIdToUse,
    });
    const created = await subDealer.save();

    // Password will be hashed by User model's pre-save middleware
    await User.create({
      username,
      password: password,
      role: 'subdealer',
      subDealer: created._id,
    });

    if (dealerIdToUse) {
      await Dealer.findByIdAndUpdate(dealerIdToUse, {
        $push: { subDealers: created._id },
      });
    }

    const response = created.toObject();
    delete response.password;
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateSubDealer = async (req, res) => {
  try {
    const subDealer = await SubDealer.findById(req.params.id);
    if (!subDealer)
      return res.status(404).json({ message: 'Sub-dealer not found' });

    // If dealer is updating, ensure they can only update their own sub-dealers
    if (
      req.path.includes('/dealer/sub-dealers') &&
      req.user.role === 'dealer'
    ) {
      if (subDealer.dealer?.toString() !== req.user.dealer) {
        return res.status(403).json({
          message: 'Access denied. You can only update your own sub-dealers.',
        });
      }
    }

    const { username, password, dealer: newDealer, ...updateData } = req.body;

    if (username && username !== subDealer.username) {
      const exists = await User.findOne({
        username,
        _id: { $ne: subDealer._id },
      });
      if (exists)
        return res.status(400).json({ message: 'Username already taken' });
      updateData.username = username;
      await User.findOneAndUpdate({ subDealer: subDealer._id }, { username });
    }

    if (password) {
      // Update SubDealer password - will be hashed by pre-save middleware
      subDealer.password = password;
      await subDealer.save();

      // Update User password - will be hashed by pre-save middleware
      const user = await User.findOne({ subDealer: subDealer._id });
      if (user) {
        user.password = password;
        await user.save();
      }
    } else {
      // If no password change, just update other fields
      await SubDealer.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );
    }

    const updated = await SubDealer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (newDealer && subDealer.dealer?.toString() !== newDealer) {
      if (subDealer.dealer) {
        await Dealer.findByIdAndUpdate(subDealer.dealer, {
          $pull: { subDealers: subDealer._id },
        });
      }
      await Dealer.findByIdAndUpdate(newDealer, {
        $push: { subDealers: subDealer._id },
      });
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteSubDealer = async (req, res) => {
  try {
    const subDealer = await SubDealer.findById(req.params.id);
    if (!subDealer)
      return res.status(404).json({ message: 'Sub-dealer not found' });

    // If dealer is deleting, ensure they can only delete their own sub-dealers
    if (
      req.path.includes('/dealer/sub-dealers') &&
      req.user.role === 'dealer'
    ) {
      if (subDealer.dealer?.toString() !== req.user.dealer) {
        return res.status(403).json({
          message: 'Access denied. You can only delete your own sub-dealers.',
        });
      }
    }

    if (subDealer.dealer) {
      await Dealer.findByIdAndUpdate(subDealer.dealer, {
        $pull: { subDealers: subDealer._id },
      });
    }

    // Delete associated user account
    await User.findOneAndDelete({ subDealer: subDealer._id });

    await subDealer.deleteOne();
    res.json({ message: 'Sub-dealer removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteMultipleSubDealers = async (req, res) => {
  try {
    const { subDealerIds } = req.body;
    if (!subDealerIds || subDealerIds.length === 0)
      return res.status(400).json({ message: 'No IDs provided' });

    const subDealers = await SubDealer.find({ _id: { $in: subDealerIds } });
    const dealerMap = subDealers.reduce((m, s) => {
      if (s.dealer) {
        const id = s.dealer.toString();
        if (!m[id]) m[id] = [];
        m[id].push(s._id);
      }
      return m;
    }, {});

    for (const dealerId in dealerMap) {
      await Dealer.findByIdAndUpdate(dealerId, {
        $pull: { subDealers: { $in: dealerMap[dealerId] } },
      });
    }

    // Delete associated user accounts
    await User.deleteMany({ subDealer: { $in: subDealerIds } });

    await SubDealer.deleteMany({ _id: { $in: subDealerIds } });
    res.json({ message: 'Sub-dealers deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
