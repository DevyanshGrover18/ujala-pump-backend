import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import UserRole from '../models/UserRole.js';

export const getProducts = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'member') {
      const userRole = await UserRole.findById(req.user.id);
      const assignedFactories = userRole?.assignedFactories || [];
      if (assignedFactories.length === 0) {
        return res.status(200).json([]);
      }
      query = { factory: { $in: assignedFactories } };
    }

    const products = await Product.find(query)
      .populate('category')
      .populate('model')
      .populate('factory')
      .populate('distributor')
      .sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// export const getProductBySerialNumber = async (req, res) => {
//     try {
//         const { serialNumber } = req.params;
//         const product = await Product.findOne({ serialNumber });

//         if (!product) {
//             return res.status(404).json({ message: 'Product not found' });
//         }

//         res.json(product);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

// export const getProductBySerialNumber = async (req, res) => {
//     try {
//         // const { serialNumber } = req.params;
//         // const product = await Product.findOne({ serialNumber });

//         // if (!product) {
//         //     return res.status(404).json({ message: 'Product not found' });
//         // }

//         // res.json(product);

//         const distributorId = req.user?.distributor;

//         if (!distributorId) return res.status(401).json({ message: 'Unauthorized' });

//         const { serialNumber } = req.params;
//         if (!serialNumber) return res.status(400).json({ message: 'Serial number required' });

//         const product = await Product.findOne({
//             distributor: distributorId,
//             serialNumber
//         })
//             .populate("category")
//             .populate("model")
//             .populate("factory")
//             .lean();

//         if (!product) return res.status(400).json({ message: "Product not found in inventory" });

//         const dealerAssigned = await DistributorDealerProduct.findOne({ product: product._id });

//         if (dealerAssigned) return res.status(400).json({ message: "Product already assigned to dealer" });

//         const sold = await Sale.findOne({ product: product._id });

//         if (sold) return res.status(400).json({ message: "Product already sold" });

//         const productDetails = {
//             productId: product._id,
//             serialNumber: product.serialNumber,
//             orderId: product.orderId,
//             category: product.category ? { _id: product.category._id, name: product.category.name } : null,
//             model: product.model ? { _id: product.model._id, name: product.model.name, specifications: product.model.specifications } : null,
//             factory: product.factory ? { _id: product.factory._id, name: product.factory.name } : null,
//             status: product.status,
//             orderType: product.orderType,
//             boxNumber: product.boxNumber,
//             manufacturingDate: product.createdAt
//         };

//         res.status(200).json(productDetails);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

export const getProductBySerialNumber = async (req, res) => {
  try {
    const { serialNumber } = req.params;
    const distributorId = req.user?.distributor;
    const dealerId = req.user?.dealer;

    // 1. Product dhundho
    const product = await Product.findOne({ serialNumber })
      .populate('category model factory')
      .lean();
    if (!product)
      return res.status(400).json({ message: 'Product not found in system' });

    // 2. Role-based Inventory check
    if (distributorId) {
      // Distributor ke liye: Check karo ki kya dealer ko toh nahi de diya
      const assignedToDealer = await DistributorDealerProduct.findOne({
        product: product._id,
      });
      if (assignedToDealer) {
        return res
          .status(400)
          .json({ message: 'Product already assigned to a dealer' });
      }
    } else if (dealerId) {
      // Dealer ke liye: Check karo ki kya ye usey mila bhi hai
      const assignedToMe = await DistributorDealerProduct.findOne({
        dealer: dealerId,
        product: product._id,
      });
      if (!assignedToMe) {
        return res
          .status(400)
          .json({ message: 'This product is not in your inventory' });
      }
    }

    // 3. 🔹 ASLI FIX: Sale check tabhi trigger ho agar CUSTOMER ko bika ho
    // Agar aapke Sale table mein 'customerName' hai, toh hi usey 'Sold' maanein
    const soldToCustomer = await Sale.findOne({
      product: product._id,
      customerName: { $exists: true, $ne: '' }, // Check ki customer name khali na ho
    });

    if (soldToCustomer) {
      return res
        .status(400)
        .json({ message: 'Product already sold to a customer' });
    }

    // 4. Sab sahi hai, details bhej do
    res.status(200).json({
      productId: product._id,
      serialNumber: product.serialNumber,
      category: product.category,
      model: product.model,
      factory: product.factory,
      status: product.status,
      distributorId: product.distributor,
      dealerId: dealerId || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const uploadOfflineProducts = async (req, res) => {
  try {
    const { factoryId, modelId, serialNumbers } = req.body;

    if (!factoryId || !modelId || !serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
      return res.status(400).json({ message: 'Factory, model, and an array of serial numbers are required.' });
    }

    // Determine current month and year automatically
    const now = new Date();
    const month = now.getMonth() + 1; // getMonth() is 0-indexed
    const year = now.getFullYear();

    // Verify factory and model exist
    const Factory = (await import('../models/Factory.js')).default;
    const factory = await Factory.findById(factoryId);
    if (!factory) {
      return res.status(404).json({ message: 'Factory not found' });
    }

    const Model = (await import('../models/Model.js')).default;
    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Check for existing serial numbers to prevent duplicates
    const existingProducts = await Product.find({ serialNumber: { $in: serialNumbers } });
    if (existingProducts.length > 0) {
      const existingSerials = existingProducts.map(p => p.serialNumber).join(', ');
      return res.status(400).json({ 
        message: 'Some serial numbers already exist in the database.',
        existing: existingSerials
      });
    }

    // Generate new product IDs
    const latestProduct = await Product.findOne().sort({ productId: -1 });
    let lastNumber = 0;
    if (latestProduct && latestProduct.productId) {
      const match = latestProduct.productId.match(/\d+$/);
      if (match) {
        lastNumber = parseInt(match[0], 10);
      }
    }

    // Construct product documents
    const productsToInsert = serialNumbers.map((serial) => {
      lastNumber++;
      const newProductId = `PROD${String(lastNumber).padStart(5, '0')}`;

      return {
        productId: newProductId,
        productName: model.name,
        description: `Offline manually uploaded product`,
        serialNumber: serial,
        month,
        year,
        category: model.category,
        model: model._id,
        quantity: 1,
        orderType: 'Offline',
        unitsPerBox: 1,
        factory: factory._id,
        unit: 'Piece',
        price: model.specifications?.mrpPrice || 0,
        minStockLevel: 10,
        status: 'Active',
      };
    });

    // Bulk insert
    const insertedProducts = await Product.insertMany(productsToInsert);

    res.status(201).json({
      message: `${insertedProducts.length} products successfully uploaded.`,
      count: insertedProducts.length
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate serial number or product ID detected.',
        error: error.message
      });
    }
    res.status(500).json({ message: error.message });
  }
};
