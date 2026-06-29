import asyncHandler from 'express-async-handler';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Distributor from '../models/Distributor.js';

// @desc    Get all products for a distributor (from query param)
// @route   GET /api/distributor/products?distributorId=...
// @access  Private
const getProducts = asyncHandler(async (req, res) => {
  const { distributorId } = req.query;
  const products = await Product.find({ distributor: distributorId });
  res.json(products);
});

// @desc    Get products for a specific distributor (from URL param)
// @route   GET /api/distributor/products/:distributorId
// @access  Private
const getDistributorProducts = asyncHandler(async (req, res) => {
  const { distributorId } = req.params;
  const products = await Product.find({ distributor: distributorId }).populate(
    'category model factory'
  );
  res.json(products);
});

// @desc    Create a new product for a distributor
// @route   POST /api/distributor/products
// @access  Private
const createProduct = asyncHandler(async (req, res) => {
  const {
    productName,
    description,
    category,
    price,
    unit,
    quantity,
    minStockLevel,
    status,
    distributorId,
  } = req.body;

  const product = new Product({
    productName,
    description,
    category,
    price,
    unit,
    quantity,
    minStockLevel,
    status,
    distributor: distributorId,
  });

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
});

// @desc    Update a product for a distributor
// @route   PUT /api/distributor/products/:id
// @access  Private
const updateProduct = asyncHandler(async (req, res) => {
  const {
    productName,
    description,
    category,
    price,
    unit,
    quantity,
    minStockLevel,
    status,
    distributorId,
  } = req.body;

  const product = await Product.findById(req.params.id);

  if (product && product.distributor.toString() === distributorId) {
    product.productName = productName;
    product.description = description;
    product.category = category;
    product.price = price;
    product.unit = unit;
    product.quantity = quantity;
    product.minStockLevel = minStockLevel;
    product.status = status;

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } else {
    res.status(404);
    throw new Error('Product not found or not authorized');
  }
});

// @desc    Delete a product for a distributor
// @route   DELETE /api/distributor/products/:id
// @access  Private
const deleteProduct = asyncHandler(async (req, res) => {
  const { distributorId } = req.body;
  const product = await Product.findById(req.params.id);

  if (product && product.distributor.toString() === distributorId) {
    await product.remove();
    res.json({ message: 'Product removed' });
  } else {
    res.status(404);
    throw new Error('Product not found or not authorized');
  }
});

const assignProductsToDistributor = asyncHandler(async (req, res) => {
  const { productIds, distributorId } = req.body;

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    res.status(400);
    throw new Error('Product IDs array is required');
  }

  if (!distributorId) {
    res.status(400);
    throw new Error('Distributor ID is required');
  }

  const distributor = await Distributor.findById(distributorId);
  if (!distributor) {
    res.status(404);
    throw new Error('Distributor not found');
  }

  // Fetch products with model populated so we can determine warranty rules
  const products = await Product.find({ _id: { $in: productIds } }).populate(
    'model'
  );

  let modifiedCount = 0;
  const now = new Date();

  const pickWarrantyForDistributor = (model, distributor) => {
    if (!model || !Array.isArray(model.warranty) || model.warranty.length === 0)
      return null;
    const state = distributor.state?.toLowerCase();
    const district = distributor.district?.toLowerCase();

    // Exact match: state + city/district
    const exact = model.warranty.find(
      (w) =>
        w.state?.toLowerCase() === state && w.city?.toLowerCase() === district
    );
    if (exact) return exact;

    // State-only match
    const stateOnly = model.warranty.find(
      (w) => w.state?.toLowerCase() === state
    );
    if (stateOnly) return stateOnly;

    // Fallback to first
    return model.warranty[0] || null;
  };

  for (const product of products) {
    product.distributor = distributorId;
    product.assignedToDistributorAt = now;

    const warrantyEntry = pickWarrantyForDistributor(
      product.model,
      distributor
    );
    if (warrantyEntry) {
      product.assignedWarranty = {
        duration: warrantyEntry.duration,
        durationType: warrantyEntry.durationType,
        state: warrantyEntry.state,
        city: warrantyEntry.city,
      };
    } else {
      product.assignedWarranty = undefined;
    }

    await product.save();
    modifiedCount++;
  }

  if (modifiedCount === 0) {
    res.status(404);
    throw new Error('No products found or updated');
  }

  res.json({
    message: `${modifiedCount} products assigned to distributor ${distributorId}`,
  });
});

const assignProductBySerial = asyncHandler(async (req, res) => {
  const { serialNumber } = req.body;
  const userId = req.user.id;
  const user = await User.findById(userId);
  if (!user || !user.distributor) {
    res.status(401);
    throw new Error('User is not a distributor');
  }
  const distributorId = user.distributor;

  const distributor = await Distributor.findById(distributorId);
  if (!distributor) {
    res.status(404);
    throw new Error('Distributor not found');
  }

  if (!serialNumber) {
    res.status(400);
    throw new Error('Serial number is required');
  }

  const product = await Product.findOne({ serialNumber });

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  if (product.distributor) {
    res.status(400);
    throw new Error('Product already assigned to a distributor');
  }

  product.distributor = distributorId;
  product.assignedToDistributorAt = new Date();

  // Determine and store assigned warranty according to distributor location and model
  await product.populate('model');
  if (
    product.model &&
    Array.isArray(product.model.warranty) &&
    product.model.warranty.length > 0
  ) {
    const state = distributor.state?.toLowerCase();
    const district = distributor.district?.toLowerCase();
    const warrantyEntry =
      product.model.warranty.find(
        (w) =>
          w.state?.toLowerCase() === state && w.city?.toLowerCase() === district
      ) ||
      product.model.warranty.find((w) => w.state?.toLowerCase() === state) ||
      product.model.warranty[0];

    if (warrantyEntry) {
      product.assignedWarranty = {
        duration: warrantyEntry.duration,
        durationType: warrantyEntry.durationType,
        state: warrantyEntry.state,
        city: warrantyEntry.city,
      };
    }
  }

  await product.save();

  res.json({ message: 'Product assigned successfully', product });
});

const revertAssignedProducts = asyncHandler(async (req, res) => {
  const { productIds } = req.body;

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    res.status(400).json({ message: 'Product IDs array is required' });
    return;
  }

  try {
    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      {
        $set: {
          distributor: null,
          assignedToDistributorAt: null,
          dealer: null,
          assignedToDealerAt: null,
          subDealer: null,
          assignedToSubDealerAt: null,
        },
        $unset: {
          assignedWarranty: '',
        },
      }
    );

    if (result.modifiedCount === 0) {
      res.status(404).json({
        message:
          'No products found or updated. They may have already been reverted.',
      });
      return;
    }

    res.json({
      message: `${result.modifiedCount} products have been reverted and are no longer assigned.`,
    });
  } catch (error) {
    console.error('Error reverting products:', error);
    res.status(500).json({ message: 'Server error while reverting products' });
  }
});


export {
  getProducts,
  getDistributorProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  assignProductsToDistributor,
  assignProductBySerial,
  revertAssignedProducts,
};
