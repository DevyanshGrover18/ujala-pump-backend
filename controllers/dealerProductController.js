import asyncHandler from 'express-async-handler';
import Product from '../models/Product.js';
import User from '../models/User.js';
import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import mongoose from 'mongoose';

const assignProductToDealerBySerial = asyncHandler(async (req, res) => {
  const { serialNumber } = req.body;
  const userId = req.user.id;

  const user = await User.findById(userId).populate('dealer');
  if (!user || !user.dealer) {
    res.status(401);
    throw new Error('User is not a dealer');
  }
  const dealerId = user.dealer._id;
  const distributorId = user.dealer.distributor;

  if (!serialNumber) {
    res.status(400);
    throw new Error('Serial number is required');
  }

  const product = await Product.findOne({ serialNumber });

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  if (product.distributor?.toString() !== distributorId.toString()) {
    res.status(400);
    throw new Error('Product is not assigned to your distributor');
  }

  const existingAssignment = await DistributorDealerProduct.findOne({
    product: product._id,
  });
  if (existingAssignment) {
    res.status(400);
    throw new Error('Product already assigned to a dealer');
  }

  await DistributorDealerProduct.create({
    distributor: distributorId,
    dealer: dealerId,
    product: product._id,
  });

  res.json({ message: 'Product assigned successfully' });
});

const getProductBySerialNumber = asyncHandler(async (req, res) => {
  const { serialNumber } = req.params;
  const userId = req.user.id;

  const user = await User.findById(userId).populate('dealer');
  if (!user || !user.dealer) {
    res.status(401);
    throw new Error('User is not a dealer');
  }
  const dealerId = user.dealer._id;

  const product = await Product.findOne({ serialNumber });

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const assignment = await DistributorDealerProduct.findOne({
    product: product._id,
    dealer: dealerId,
  });

  if (!assignment) {
    res.status(404);
    throw new Error('Product not assigned to this dealer');
  }

  res.json(product);
});

const getDealerProducts = async (req, res) => {
  try {
    const { id } = req.params;

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

// const gettDealerProductModels = async (req, res) => {
//   try {
//     const { id } = req.params; // Distributor ID

//     const models = await Product.aggregate([
//       {
//         $match: {
//           distributor: new mongoose.Types.ObjectId(id),
//           sold: { $ne: true }
//         }
//       },

//       {
//         $lookup: {
//           from: 'distributordealerproducts',
//           localField: '_id',
//           foreignField: 'product',
//           as: 'assignment'
//         }
//       },
//       {
//         $match: {
//           assignment: { $size: 0 }
//         }
//       },

//       {
//         $lookup: {
//           from: 'models',
//           localField: 'model',
//           foreignField: '_id',
//           as: 'model'
//         }
//       },
//       { $unwind: '$model' },

//       {
//         $group: {
//           _id: '$model._id',
//           name: { $first: '$model.name' }
//         }
//       },

//       {
//         $sort: { name: 1 }
//       }
//     ]);

//     res.json(models);
//   } catch (error) {
//     console.error('Distributor product models error:', error);
//     res.status(500).json({ message: error.message });
//   }
// };

const gettDealerProductModels = async (req, res) => {
  try {
    const dealerId = req.params.id;

    if (!dealerId) {
      return res.status(400).json({ message: 'Dealer ID required' });
    }

    const models = await DistributorDealerProduct.aggregate([
      {
        $match: {
          dealer: new mongoose.Types.ObjectId(dealerId),
        },
      },

      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },

      {
        $match: {
          'product.status': { $ne: 'Inactive' },
          'product.sold': { $ne: true },
        },
      },

      {
        $lookup: {
          from: 'models',
          localField: 'product.model',
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
    console.error('Dealer product models error:', error);
    res.status(500).json({ message: error.message });
  }
};

export {
  assignProductToDealerBySerial,
  getProductBySerialNumber,
  getDealerProducts,
  gettDealerProductModels,
};
