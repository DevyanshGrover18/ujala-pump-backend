import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import DealerSubDealerProduct from '../models/DealerSubDealerProduct.js';
import Dealer from '../models/Dealer.js';
import mongoose from 'mongoose';
import { login } from './authController.js';

export const getDealerSales = async (req, res) => {
  try {
    const distributorId = new mongoose.Types.ObjectId(req.user.distributor);

    const dealerSales = await Dealer.aggregate([
      {
        $match: { distributor: distributorId },
      },
      {
        $lookup: {
          from: 'distributordealerproducts',
          localField: '_id',
          foreignField: 'dealer',
          as: 'assignedProducts',
        },
      },
      {
        $unwind: '$assignedProducts',
      },
      {
        $lookup: {
          from: 'products',
          localField: 'assignedProducts.product',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      {
        $unwind: '$productDetails',
      },
      {
        $lookup: {
          from: 'models',
          localField: 'productDetails.model',
          foreignField: '_id',
          as: 'modelDetails',
        },
      },
      {
        $unwind: '$modelDetails',
      },
      {
        $lookup: {
          from: 'sales',
          localField: 'productDetails._id',
          foreignField: 'product',
          as: 'saleInfo',
        },
      },
      {
        $unwind: {
          path: '$saleInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: {
            dealerId: '$_id',
            modelId: '$modelDetails._id',
          },
          dealerName: { $first: '$name' },
          modelName: { $first: '$modelDetails.name' },
          products: {
            $push: {
              serialNumber: '$productDetails.serialNumber',
              dateAssigned: '$assignedProducts.createdAt',
              status: { $ifNull: ['$saleInfo', 'Not Sold'] },
            },
          },
          totalProducts: { $sum: 1 },
          soldProducts: {
            $sum: { $cond: [{ $ifNull: ['$saleInfo', false] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          status: {
            $cond: {
              if: { $eq: ['$soldProducts', '$totalProducts'] },
              then: 'Sold',
              else: {
                $cond: {
                  if: { $gt: ['$soldProducts', 0] },
                  then: 'Partially Sold',
                  else: 'Not Sold',
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$_id.dealerId',
          dealerName: { $first: '$dealerName' },
          models: {
            $push: {
              modelId: '$_id.modelId',
              modelName: '$modelName',
              products: '$products',
              status: '$status',
            },
          },
          productCount: { $sum: '$totalProducts' },
        },
      },
      {
        $project: {
          _id: 1,
          name: '$dealerName',
          productCount: 1,
          models: 1,
        },
      },
    ]);

    res.json(dealerSales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createSale = async (req, res) => {
  const {
    productId,
    dealerId,
    distributorId,
    customerName,
    customerPhone,
    customerAddress,
    plumberName,
    alternateMobileNumber,
    plumberMobileNumber,
    subDealerId, // Agar sub-dealer ko sell ho raha hai
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);

    if (!product) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check ki kya is Product ki entry Sales mein pehle se hai?
    // Hum product ID se search karenge kyunki ek product ki ek hi active lifecycle honi chahiye
    const existingSale = await Sale.findOne({ product: productId }).session(
      session
    );

    const saleData = {
      product: productId,
      distributor: distributorId,
      dealer: dealerId,
      subDealer: subDealerId || null, // Agar sub-dealer hai toh update ho jayega
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerAddress: customerAddress || null,
      plumberName: plumberName || null,
      alternateMobileNumber: alternateMobileNumber || null,
      plumberMobileNumber: plumberMobileNumber || null,
      soldAt: new Date(),
      saleDate: new Date(),
    };

    let sale;
    if (existingSale) {
      // Agar entry hai, toh purani entry ko update karo (Customer/Sub-dealer details ke sath)
      sale = await Sale.findOneAndUpdate(
        { product: productId },
        { $set: saleData },
        { new: true, session }
      );
    } else {
      // Agar entry nahi hai (fresh sale), toh nayi create karo
      sale = new Sale(saleData);
      await sale.save({ session });
    }

    // Product ka status update karein (Agar customer ko sell ho gaya hai tabhi sold true karein)
    if (customerName) {
      product.sold = true;
      product.status = 'Inactive';
      product.saleDate = new Date();
    }

    await product.save({ session });

    // Dealer assignment table se hata dein kyunki ab wo inventory se bahar hai
    if (dealerId) {
      await DistributorDealerProduct.deleteOne({
        product: productId,
        dealer: dealerId,
      }).session(session);
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: existingSale
        ? 'Sale updated successfully'
        : 'Product sold successfully',
      saleId: sale._id,
      serialNumber: product.serialNumber,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Sale Error:', error);
    return res
      .status(500)
      .json({ message: 'Something went wrong while creating/updating sale' });
  }
};

export const distributorBulkAssignDealer = async (req, res) => {
  const distributorId = req.user.distributor;
  const { dealerId, products } = req.body;

  if (!distributorId) return res.status(401).json({ message: 'Unauthorized' });

  if (!dealerId) return res.status(400).json({ message: 'Select dealer' });

  if (!Array.isArray(products) || products.length === 0)
    return res.status(400).json({ message: 'No products selected' });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];

    for (const item of products) {
      const product = await Product.findOne({
        serialNumber: item.serialNumber,
        distributor: distributorId,
      }).session(session);

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ message: `Product not found: ${item.serialNumber}` });
      }

      if (product.sold) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: `Product already sold: ${item.serialNumber}` });
      }

      const alreadyAssigned = await DistributorDealerProduct.findOne({
        product: product._id,
      }).session(session);

      if (alreadyAssigned) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: `Product already assigned: ${item.serialNumber}` });
      }

      // ✅ Distributor → Dealer assignment
      const assignment = new DistributorDealerProduct({
        product: product._id,
        distributor: distributorId,
        dealer: dealerId,
      });
      await assignment.save({ session });

      // ✅ Sale document create (for distributor → dealer)
      const sale = new Sale({
        product: product._id,
        distributor: distributorId,
        dealer: dealerId,
        soldAt: new Date(),
        saleDate: new Date(),
      });
      await sale.save({ session });

      results.push({
        serialNumber: product.serialNumber,
        saleId: sale._id,
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: 'Products assigned successfully',
      total: results.length,
      results,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

export const dealerBulkAssignSubDealer = async (req, res) => {
  const dealerId = req.user.dealer;
  const { subDealerId, products } = req.body;

  if (!dealerId) return res.status(401).json({ message: 'Unauthorized' });

  if (!subDealerId)
    return res.status(400).json({ message: 'Select sub dealer' });

  if (!Array.isArray(products) || products.length === 0)
    return res.status(400).json({ message: 'No products selected' });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];

    for (const item of products) {
      const product = await Product.findOne({
        serialNumber: item.serialNumber,
      }).session(session);

      if (!product) {
        throw new Error(`Product not found: ${item.serialNumber}`);
      }

      const sale = await Sale.findOne({
        product: product._id,
        dealer: dealerId,
      }).session(session);

      if (!sale) {
        throw new Error(
          `Product not in dealer inventory: ${item.serialNumber}`
        );
      }

      if (sale.subDealer) {
        throw new Error(`Already assigned to sub dealer: ${item.serialNumber}`);
      }

      const dealerProduct = await DistributorDealerProduct.findOne({
        dealer: dealerId,
        product: product._id,
      }).session(session);

      if (!dealerProduct) {
        throw new Error(`Product not assigned to dealer: ${item.serialNumber}`);
      }

      const existingAssignment = await DealerSubDealerProduct.findOne({
        dealer: dealerId,
        subDealer: subDealerId,
        product: product._id,
      }).session(session);

      if (existingAssignment) {
        throw new Error(
          `Product already assigned to this sub dealer: ${item.serialNumber}`
        );
      }

      await DealerSubDealerProduct.create(
        [
          {
            distributor: dealerProduct.distributor,
            dealer: dealerId,
            subDealer: subDealerId,
            product: product._id,
          },
        ],
        { session }
      );

      sale.subDealer = subDealerId;
      sale.subDealerAssignedAt = new Date();
      await sale.save({ session });

      results.push({
        serialNumber: product.serialNumber,
        productId: product._id,
        saleId: sale._id,
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: 'Products assigned to sub dealer successfully',
      total: results.length,
      results,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);

    return res.status(400).json({
      message: error.message,
    });
  }
};

export const adminSaleProductRemove = async (req, res) => {
  const productId = req.params.productId;

  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);

    if (!product) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.sold) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Cannot remove a sold product' });
    }

    if (product.assignedToDistributorAt) {
      const now = new Date();
      const assignedDate = new Date(product.assignedToDistributorAt);
      const diffTime = Math.abs(now - assignedDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 5) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message:
            'This product was assigned more than 5 days ago and cannot be deleted',
        });
      }
    }

    product.distributor = null;
    product.saleDate = null;

    await Sale.deleteOne({ product: product._id }).session(session);

    await product.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: 'Product removed successfully',
      serialNumber: product.serialNumber,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: error.message });
  }
};

export const adminBulkDispatch = async (req, res) => {
  const { distributorId, products } = req.body;

  if (!distributorId) {
    return res.status(400).json({ message: 'Distributor ID is required' });
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'Products array is required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];

    for (const item of products) {
      const product = await Product.findOne({
        serialNumber: item.serialNumber,
      }).session(session);

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ message: `Product not found: ${item.serialNumber}` });
      }

      if (product.sold) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: `Product already sold: ${item.serialNumber}` });
      }

      if (
        product.orderId !== item.orderId ||
        product.model.toString() !== item.modelId ||
        product.factory.toString() !== item.factoryId ||
        product.orderType !== item.orderType
      ) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: `Product data mismatch: ${item.serialNumber}` });
      }

      product.distributor = distributorId;
      product.saleDate = new Date();
      product.assignedToDistributorAt = new Date();

      // const sale = new Sale({
      //   product: product._id,
      //   distributor: distributorId,
      //   orderId: product.orderId,
      //   model: product.model,
      //   factory: product.factory,
      //   orderType: product.orderType
      // });

      await product.save({ session });
      // await sale.save({ session });

      results.push({
        serialNumber: product.serialNumber,
        // saleId: sale._id
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: 'Bulk dispatch completed successfully',
      totalProcessed: results.length,
      results,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getSalesByDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const sales = await Sale.find({
      dealer: dealerId,

      // Direct sale only
      subDealer: null,

      // Customer details must exist
      customerName: { $exists: true, $ne: '' },
      customerPhone: { $exists: true, $ne: '' },
      customerAddress: { $exists: true, $ne: '' },
    })
      .populate({
        path: 'product',
        populate: {
          path: 'model',
          model: 'Model',
        },
      })
      .populate('dealer', 'name')
      .sort({ createdAt: -1 });

    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const {
      customerName,
      customerPhone,
      customerAddress,
      plumberName,
      alternateMobileNumber,
      plumberMobileNumber,
    } = req.body;

    const sale = await Sale.findById(saleId);

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    sale.customerName = customerName || sale.customerName;
    sale.customerPhone = customerPhone || sale.customerPhone;
    sale.customerAddress = customerAddress || sale.customerAddress;
    sale.plumberName = plumberName || sale.plumberName;
    sale.alternateMobileNumber =
      alternateMobileNumber || sale.alternateMobileNumber;
    sale.plumberMobileNumber = plumberMobileNumber || sale.plumberMobileNumber;

    const updatedSale = await sale.save();
    res.json(updatedSale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createSubDealerSale = async (req, res) => {
  const {
    productId,
    subDealerId,
    customerName,
    customerPhone,
    customerAddress,
    plumberName,
    alternateMobileNumber,
    plumberMobileNumber,
  } = req.body;

  try {
    // Verify the product is assigned to this sub-dealer
    const assignment = await DealerSubDealerProduct.findOne({
      product: productId,
      subDealer: subDealerId,
    })
      .populate('dealer')
      .populate('distributor');

    if (!assignment) {
      return res
        .status(400)
        .json({ message: 'Product not assigned to this sub-dealer' });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.sold) {
      return res.status(400).json({ message: 'Product already sold' });
    }

    const sale = new Sale({
      product: productId,
      dealer: assignment.dealer._id,
      distributor: assignment.distributor._id,
      subDealer: subDealerId,
      customerName,
      customerPhone,
      customerAddress,
      plumberName,
      alternateMobileNumber,
      plumberMobileNumber,
    });

    product.sold = true;
    product.status = 'Inactive';
    product.saleDate = new Date();

    await sale.save();
    await product.save();

    res.status(201).json(sale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
/*
export const getSalesBySubDealer = async (req, res) => {
  try {
    const sales = await Sale.find({ subDealer: req.params.subDealerId })
      .populate({
        path: 'product',
        populate: {
          path: 'model',
          model: 'Model'
        }
      })
      .populate('subDealer')
      .sort({ createdAt: -1 });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
*/

export const getSalesBySubDealer = async (req, res) => {
  try {
    const sales = await Sale.find({
      subDealer: req.params.subDealerId,
      customerName: { $exists: true, $ne: '' },
    })
      .populate({
        path: 'product',
        populate: {
          path: 'model',
          model: 'Model',
        },
      })
      .populate('subDealer')
      .sort({ createdAt: -1 });

    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
export const getAssignedProducts = async (req, res) => {
  try {
    // Get all products that are assigned to distributors
    const products = await Product.find({
      distributor: { $ne: null }
    })
      .populate('model')
      .populate('distributor')
      .populate('factory')
      .sort({ assignedToDistributorAt: -1, createdAt: -1 });

    // Get dealer assignments for these products
    const productIds = products.map(p => p._id);
    const dealerAssignments = await DistributorDealerProduct.find({
      product: { $in: productIds }
    })
      .populate('dealer')
      .populate('distributor');

    // Get sub-dealer assignments for these products
    const subDealerAssignments = await DealerSubDealerProduct.find({
      product: { $in: productIds }
    })
      .populate('subDealer')
      .populate('dealer');

    // Get sales information for these products
    const sales = await Sale.find({
      product: { $in: productIds }
    })
      .populate('subDealer')
      .populate('dealer');

    // Create maps for quick lookup
    const dealerMap = {};
    dealerAssignments.forEach(assignment => {
      dealerMap[assignment.product.toString()] = assignment.dealer;
    });

    const subDealerMap = {};
    subDealerAssignments.forEach(assignment => {
      subDealerMap[assignment.product.toString()] = assignment.subDealer;
    });

    const salesMap = {};
    sales.forEach(sale => {
      salesMap[sale.product.toString()] = sale;
    });

    // Add dealer, sub-dealer info and assignment date to products
    const enrichedProducts = products.map(product => {
      const productObj = product.toObject();
      const sale = salesMap[product._id.toString()];

      productObj.dealer = dealerMap[product._id.toString()] || null;
      productObj.subDealer = subDealerMap[product._id.toString()] || (sale?.subDealer) || null;
      productObj.assignedToDistributorAt = product.updatedAt; // When distributor was assigned
      // Add sale object to product object - 20-12
      productObj.sale = sale || null;
      // End of change - 20-12
      return productObj;
    });

    res.json(enrichedProducts);
  } catch (error) {
    console.error('Error fetching assigned products:', error);
    res.status(500).json({ message: error.message });
  }
};
*/

export const getAssignedProducts = async (req, res) => {
  try {
    // Get all products that are assigned to distributors
    const products = await Product.find({
      distributor: { $ne: null },
    })
      .populate('model')
      .populate('distributor')
      .populate('factory')
      .sort({ assignedToDistributorAt: -1, createdAt: -1 });

    // Get dealer assignments for these products
    const productIds = products.map((p) => p._id);
    const dealerAssignments = await DistributorDealerProduct.find({
      product: { $in: productIds },
    })
      .populate('dealer')
      .populate('distributor');

    // Get sub-dealer assignments for these products
    const subDealerAssignments = await DealerSubDealerProduct.find({
      product: { $in: productIds },
    })
      .populate('subDealer')
      .populate('dealer');

    // Get sales information for these products
    const sales = await Sale.find({
      product: { $in: productIds },
    })
      .populate('subDealer')
      .populate('dealer');

    // Create maps for quick lookup
    const dealerMap = {};
    dealerAssignments.forEach((assignment) => {
      dealerMap[assignment.product.toString()] = assignment.dealer;
    });

    const subDealerMap = {};
    subDealerAssignments.forEach((assignment) => {
      subDealerMap[assignment.product.toString()] = assignment.subDealer;
    });

    const salesMap = {};
    sales.forEach((sale) => {
      salesMap[sale.product.toString()] = sale;
    });

    // Add dealer, sub-dealer info and assignment date to products
    const enrichedProducts = products.map((product) => {
      const productObj = product.toObject();
      const sale = salesMap[product._id.toString()];

      // productObj.dealer = dealerMap[product._id.toString()] || null;
      // productObj.subDealer = subDealerMap[product._id.toString()] || (sale?.subDealer) || null;

      const assignedDealer = dealerMap[product._id.toString()];
      const assignedSubDealer = subDealerMap[product._id.toString()];

      productObj.dealer = assignedDealer || sale?.dealer || null;

      productObj.subDealer = assignedSubDealer || sale?.subDealer || null;

      productObj.assignedToDistributorAt = product.updatedAt; // When distributor was assigned
      // Add sale object to product object - 20-12
      productObj.sale = sale || null;
      // End of change - 20-12
      return productObj;
    });

    res.json(enrichedProducts);
  } catch (error) {
    console.error('Error fetching assigned products:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getDealerToSubDealerAssignedProducts = async (req, res) => {
  try {
    const dealerId = req.user.dealer;
    if (!dealerId) return res.status(401).json({ message: 'Unauthorized' });

    const sales = await Sale.find({
      dealer: dealerId,
      subDealer: { $exists: true, $ne: null },
    })
      .populate('dealer')
      .populate('subDealer');

    if (sales.length === 0) return res.json([]);

    const productIds = sales.map((s) => s.product);

    const products = await Product.find({ _id: { $in: productIds } })
      .populate('model')
      .populate('factory')
      .populate('distributor')
      .sort({ updatedAt: -1 });

    const dealerAssignments = await DistributorDealerProduct.find({
      dealer: dealerId,
      product: { $in: productIds },
    });

    const saleMap = {};
    sales.forEach((s) => {
      saleMap[s.product.toString()] = s;
    });

    const assignedAtMap = {};
    dealerAssignments.forEach((a) => {
      assignedAtMap[a.product.toString()] = a.createdAt;
    });

    const enrichedProducts = products.map((product) => {
      const obj = product.toObject();
      const pid = product._id.toString();
      const sale = saleMap[pid];

      return {
        ...obj,
        dealer: sale?.dealer || null,
        subDealer: sale?.subDealer || null,
        assignedToDealerAt: assignedAtMap[pid] || sale?.createdAt || null,
        sale: sale,
      };
    });

    res.json(enrichedProducts);
  } catch (error) {
    console.error('Distributor → Dealer products error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getDistributorToDealerAssignedProducts = async (req, res) => {
  try {
    const distributorId = req.user.distributor;

    if (!distributorId)
      return res.status(401).json({ message: 'Unauthorized' });

    const sales = await Sale.find({
      distributor: distributorId,
      dealer: { $exists: true, $ne: null },
    })
      .populate('dealer')
      .populate('subDealer');

    if (sales.length === 0) return res.json([]);

    const productIds = sales.map((s) => s.product);

    const products = await Product.find({ _id: { $in: productIds } })
      .populate('model')
      .populate('factory')
      .populate('distributor')
      .sort({ updatedAt: -1 });

    const dealerAssignments = await DistributorDealerProduct.find({
      distributor: distributorId,
      product: { $in: productIds },
    });

    const saleMap = {};
    sales.forEach((s) => {
      saleMap[s.product.toString()] = s;
    });

    const assignedAtMap = {};
    dealerAssignments.forEach((a) => {
      assignedAtMap[a.product.toString()] = a.createdAt;
    });

    const enrichedProducts = products.map((product) => {
      const obj = product.toObject();
      const pid = product._id.toString();
      const sale = saleMap[pid];

      return {
        ...obj,
        dealer: sale?.dealer || null,
        subDealer: sale?.subDealer || null,
        assignedToDealerAt: assignedAtMap[pid] || sale?.createdAt || null,
        sale: sale,
      };
    });

    res.json(enrichedProducts);
  } catch (error) {
    console.error('Distributor → Dealer products error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const distributorSaleProductRemove = async (req, res) => {
  const distributorId = req.user.distributor;
  const productId = req.params.productId;

  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);
    const distributordealerproducts = await DistributorDealerProduct.findOne({
      product: productId,
      distributor: distributorId,
    }).session(session);
    const distributordealerSaleproducts = await Sale.findOne({
      product: productId,
      distributor: distributorId,
    }).session(session);

    if (!product) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if product belongs to this distributor
    if (
      !product.distributor ||
      product.distributor.toString() !== distributorId
    ) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(403)
        .json({ message: 'You are not authorized to remove this product' });
    }

    /*
    console.log(distributordealerSaleproducts.soldAt);
    if (distributordealerSaleproducts.soldAt) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Cannot remove a sold product" });
    }
    */

    // Check if assigned to dealer > 5 days (distributor perspective)
    if (distributordealerproducts && distributordealerproducts.createdAt) {
      const now = new Date();
      const assignedDate = new Date(distributordealerproducts.createdAt);
      const diffTime = Math.abs(now - assignedDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 5) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message:
            'You cannot remove this product assigned more than 5 days ago',
        });
      }
    }

    await Sale.deleteOne({
      product: product._id,
      distributor: distributorId,
    }).session(session);
    await DistributorDealerProduct.deleteMany({
      product: product._id,
      distributor: distributorId,
    }).session(session);

    product.sold = false;
    await product.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message:
        'Product dealer assignment removed successfully. Product remains with distributor.',
      serialNumber: product.serialNumber,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: error.message });
  }
};

export const dealerSaleProductRemove = async (req, res) => {
  const dealerId = req.user.dealer;
  const { productId } = req.params;

  if (!dealerId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);

    if (!product) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Product not found' });
    }

    const sale = await Sale.findOne({
      product: productId,
      dealer: dealerId,
    }).session(session);

    if (!sale) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        message: 'Product not found in dealer inventory',
      });
    }

    if (sale.customerName || sale.sold === true) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Cannot remove a sold product',
      });
    }

    const now = new Date();
    const assignedDate = new Date(sale.createdAt);
    const diffDays = Math.ceil(
      Math.abs(now - assignedDate) / (1000 * 60 * 60 * 24)
    );

    if (diffDays > 5) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'You cannot remove this product after 5 days',
      });
    }

    await Sale.deleteOne({ _id: sale._id }).session(session);

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: 'Product removed from dealer inventory successfully',
      serialNumber: product.serialNumber,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    return res.status(500).json({
      message: 'Something went wrong',
    });
  }
};

export const adminCreateSale = async (req, res) => {
  const {
    productId,
    customerName,
    customerPhone,
    customerAddress,
    plumberName,
    alternateMobileNumber,
    plumberMobileNumber,
    saleDate
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);

    if (!product) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.sold) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Product already sold' });
    }

    // Determine current assignments to preserve history
    const distributorIdDb = product.distributor;
    const dealerAssignment = await DistributorDealerProduct.findOne({ product: productId }).session(session);
    const subDealerAssignment = await DealerSubDealerProduct.findOne({ product: productId }).session(session);

    const dealerIdDb = dealerAssignment ? dealerAssignment.dealer : null;
    const subDealerIdDb = subDealerAssignment ? subDealerAssignment.subDealer : null;

    let sale = await Sale.findOne({ product: productId }).session(session);

    const saleData = {
      product: productId,
      distributor: distributorIdDb,
      dealer: dealerIdDb,
      subDealer: subDealerIdDb,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerAddress: customerAddress || null,
      plumberName: plumberName || null,
      alternateMobileNumber: alternateMobileNumber || null,
      plumberMobileNumber: plumberMobileNumber || null,
      soldAt: saleDate ? new Date(saleDate) : new Date(),
      saleDate: saleDate ? new Date(saleDate) : new Date(),
    };

    if (sale) {
      sale = await Sale.findOneAndUpdate(
        { product: productId },
        { $set: saleData },
        { new: true, session }
      );
    } else {
      sale = new Sale(saleData);
      await sale.save({ session });
    }

    product.sold = true;
    product.status = 'Inactive';
    product.saleDate = saleData.saleDate;
    await product.save({ session });

    // Remove from active inventory of dealer/subdealer if applicable
    if (dealerIdDb) {
      await DistributorDealerProduct.deleteOne({ product: productId, dealer: dealerIdDb }).session(session);
    }
    if (subDealerIdDb) {
      await DealerSubDealerProduct.deleteOne({ product: productId, subDealer: subDealerIdDb }).session(session);
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: 'Product sold by Admin successfully',
      saleId: sale._id,
      serialNumber: product.serialNumber,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Admin Sale Error:', error);
    return res.status(500).json({ message: 'Something went wrong while creating admin sale' });
  }
};
