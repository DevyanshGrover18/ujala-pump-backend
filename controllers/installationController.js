import Installation from '../models/Installation.js';
import Product from '../models/Product.js';
import Model from '../models/Model.js';
import Plumber from '../models/Plumber.js';
import IncentiveClaim from '../models/IncentiveClaim.js';

export const checkSerialNumber = async (req, res) => {
  try {
    const { serialNumber } = req.params;

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
    const { serialNumber, latitude, longitude, image } = req.body;

    if (!serialNumber || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'Serial number and geolocation coordinates are required' });
    }

    // Find logged-in plumber
    const plumber = await Plumber.findById(req.user.plumber);
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

    // Create Incentive Claim for the Plumber
    const plumberIncentive = product.model?.plumberIncentive || 0;

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
    const plumberId = req.user.plumber;
    const installations = await Installation.find({ plumber: plumberId })
      .populate('model', 'name code specifications')
      .populate('product', 'productName')
      .sort({ createdAt: -1 });

    res.json(installations);
  } catch (error) {
    console.error('Error fetching installations:', error);
    res.status(500).json({ message: error.message });
  }
};
