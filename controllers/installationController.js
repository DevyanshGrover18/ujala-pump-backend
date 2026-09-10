import mongoose from 'mongoose';
import Installation from '../models/Installation.js';
import Product from '../models/Product.js';
import Model from '../models/Model.js';
import Plumber from '../models/Plumber.js';
import User from '../models/User.js';
import IncentiveClaim from '../models/IncentiveClaim.js';

export const getPlumberFromReq = async (req) => {
  if (!req?.user) return null;

  // 1. Try req.user.plumber
  if (req.user.plumber) {
    // 1a. If object with _id
    if (req.user.plumber._id && mongoose.Types.ObjectId.isValid(req.user.plumber._id)) {
      const plumber = await Plumber.findById(req.user.plumber._id);
      if (plumber) return plumber;
    }
    // 1b. If object with plumberId / phone / username
    if (req.user.plumber.plumberId) {
      const plumber = await Plumber.findOne({ plumberId: String(req.user.plumber.plumberId).trim() });
      if (plumber) return plumber;
    }
    if (req.user.plumber.phone) {
      const plumber = await Plumber.findOne({ phone: String(req.user.plumber.phone).trim() });
      if (plumber) return plumber;
    }
    if (req.user.plumber.username) {
      const rawU = String(req.user.plumber.username).trim();
      const plumber = await Plumber.findOne({
        username: { $regex: new RegExp(`^${rawU}$`, 'i') },
      });
      if (plumber) return plumber;
    }
    // 1c. If string (could be ObjectId, plumberId, phone, or username)
    if (typeof req.user.plumber === 'string') {
      const rawStr = req.user.plumber.trim();
      if (mongoose.Types.ObjectId.isValid(rawStr)) {
        const plumber = await Plumber.findById(rawStr);
        if (plumber) return plumber;
      }
      const plumber = await Plumber.findOne({
        $or: [
          { plumberId: rawStr },
          { phone: rawStr },
          { username: { $regex: new RegExp(`^${rawStr}$`, 'i') } },
        ],
      });
      if (plumber) return plumber;
    }
  }

  // 2. Try User document lookup by req.user.id
  if (req.user.id && mongoose.Types.ObjectId.isValid(req.user.id)) {
    const userDoc = await User.findById(req.user.id);
    if (userDoc) {
      if (userDoc.plumber && mongoose.Types.ObjectId.isValid(userDoc.plumber)) {
        const plumber = await Plumber.findById(userDoc.plumber);
        if (plumber) return plumber;
      }
      if (userDoc.plumber && typeof userDoc.plumber === 'string') {
        const plumber = await Plumber.findOne({
          $or: [
            { plumberId: userDoc.plumber.trim() },
            { phone: userDoc.plumber.trim() },
          ],
        });
        if (plumber) {
          await User.findByIdAndUpdate(userDoc._id, { plumber: plumber._id });
          return plumber;
        }
      }
      if (userDoc.username) {
        const rawU = String(userDoc.username).trim();
        const plumber = await Plumber.findOne({
          $or: [
            { username: { $regex: new RegExp(`^${rawU}$`, 'i') } },
            { plumberId: rawU },
            { phone: rawU },
          ],
        });
        if (plumber) {
          if (!userDoc.plumber || String(userDoc.plumber) !== String(plumber._id)) {
            await User.findByIdAndUpdate(userDoc._id, { plumber: plumber._id });
          }
          return plumber;
        }
      }
    }
  }

  // 3. Try req.user.username directly
  if (req.user.username) {
    const rawU = String(req.user.username).trim();
    const plumber = await Plumber.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${rawU}$`, 'i') } },
        { plumberId: rawU },
        { phone: rawU },
      ],
    });
    if (plumber) return plumber;
  }

  // 4. Try req.user.id directly as Plumber._id
  if (req.user.id && mongoose.Types.ObjectId.isValid(req.user.id)) {
    const plumber = await Plumber.findById(req.user.id);
    if (plumber) return plumber;
  }

  // 5. Check request body if plumberId was provided
  if (req.body?.plumberId) {
    const rawId = String(req.body.plumberId).trim();
    const plumber = await Plumber.findOne({
      $or: [
        { plumberId: rawId },
        { phone: rawId },
      ],
    });
    if (plumber) return plumber;
  }

  return null;
};

export const checkSerialNumber = async (req, res) => {
  try {
    const rawSerialNumber = req.params.serialNumber || '';
    const serialNumber = String(rawSerialNumber).trim().toUpperCase();

    // 1. Look up if product exists in inventory
    const product = await Product.findOne({ serialNumber })
      .populate('category')
      .populate('model')
      .populate('distributor');

    if (!product) {
      return res.status(404).json({ message: 'Serial number not found in product inventory' });
    }

    // Check if product is sold
    if (!product.sold) {
      return res.status(400).json({ message: 'This product has not been sold yet' });
    }

    // 2. Check if product is already installed
    const existingInstallation = await Installation.findOne({ serialNumber })
      .populate({
        path: 'plumber',
        select: 'name plumberId phone',
      });

    if (existingInstallation) {
      return res.status(400).json({
        alreadyInstalled: true,
        message: 'This motor has already been installed',
        installation: existingInstallation,
        product: {
          serialNumber: product.serialNumber,
          categoryName: product.category?.name,
          modelName: product.model?.name,
          specifications: product.model?.specifications,
        },
      });
    }

    // 3. Return product details for form pre-fill
    res.json({
      alreadyInstalled: false,
      product: {
        _id: product._id,
        serialNumber: product.serialNumber,
        categoryName: product.category?.name,
        model: product.model?._id,
        modelName: product.model?.name,
        specifications: product.model?.specifications,
        distributor: product.distributor ? {
          name: product.distributor.name,
          distributorId: product.distributor.distributorId,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error checking serial number:', error);
    res.status(500).json({ message: error.message });
  }
};

export const installMotor = async (req, res) => {
  try {
    const { serialNumber: rawSerialNumber, latitude, longitude, image } = req.body;
    const serialNumber = rawSerialNumber ? String(rawSerialNumber).trim().toUpperCase() : '';

    if (!serialNumber || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'Serial number and geolocation coordinates are required' });
    }

    // Find logged-in plumber
    const plumber = await getPlumberFromReq(req);
    if (!plumber) {
      return res.status(404).json({ message: 'Plumber profile not found' });
    }

    if (plumber.status !== 'Active') {
      return res.status(403).json({ message: 'Plumber account is inactive' });
    }

    // Check if product exists
    const product = await Product.findOne({ serialNumber }).populate('model');
    if (!product) {
      return res.status(404).json({ message: 'Serial number not found in product inventory' });
    }

    // Check if product is sold
    if (!product.sold) {
      return res.status(400).json({ message: 'This product has not been sold yet' });
    }

    // Check double installation
    const existingInstallation = await Installation.findOne({ serialNumber });
    if (existingInstallation) {
      return res.status(400).json({ message: 'This motor has already been installed' });
    }

    // Create Installation
    const installation = new Installation({
      plumber: plumber._id,
      product: product._id,
      serialNumber,
      model: product.model?._id,
      geolocation: {
        latitude,
        longitude,
      },
      image,
    });

    const savedInstallation = await installation.save();

    // Create Incentive Claim for the Plumber if eligible
    let plumberIncentive = 0;
    const isProductEligible = product.incentiveEligible !== false;
    const isPlumberEligible =
      plumber.eligibleForIncentive !== false &&
      plumber.eligibleForIncentive !== 'false';

    if (isProductEligible && isPlumberEligible) {
      plumberIncentive = Number(product.model?.plumberIncentive || 0);

      if (plumberIncentive > 0) {
        const claim = new IncentiveClaim({
          sellerType: 'Plumber',
          sellerId: plumber._id,
          sellerName: plumber.name,
          product: product._id,
          serialNumber: product.serialNumber,
          model: product.model?._id,
          modelName: product.model?.name,
          incentiveAmount: plumberIncentive,
          points: 0,
          installation: savedInstallation._id,
          status: 'Approval Pending',
        });

        await claim.save();
      }
    }

    // Return populated installation data
    const responseData = await Installation.findById(savedInstallation._id)
      .populate('model', 'name code')
      .populate('product', 'productName');

    res.status(201).json({
      message: 'Motor installed successfully',
      installation: responseData,
      incentiveAmount: plumberIncentive,
    });
  } catch (error) {
    console.error('Error installing motor:', error);
    res.status(400).json({ message: error.message });
  }
};

export const getPlumberInstallations = async (req, res) => {
  try {
    const plumber = await getPlumberFromReq(req);
    if (!plumber) {
      return res.json([]);
    }

    const installations = await Installation.find({ plumber: plumber._id })
      .populate('model', 'name code specifications')
      .populate('product', 'productName')
      .sort({ createdAt: -1 });

    res.json(installations);
  } catch (error) {
    console.error('Error fetching installations:', error);
    res.status(500).json({ message: error.message });
  }
};
