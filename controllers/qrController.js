import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import Model from '../models/Model.js';
import { OrderItem } from '../models/Order.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';

export const getProductDetails = async (req, res) => {
  try {
    const { serialNumber } = req.params;

    const orderItem = await OrderItem.findOne({ serialNumber })
      .populate('category')
      .populate('model')
      .populate('factory');

    if (!orderItem) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const productDetails = {
      id: orderItem._id,
      serialNumber: orderItem.serialNumber,
      orderId: orderItem.orderId,
      category: orderItem.category?.name,
      model: {
        _id: orderItem.model?._id,
        name: orderItem.model?.name,
        specifications: orderItem.model?.specifications,
      },
      // Return both id and name so clients can validate ownership
      factory: orderItem.factory
        ? { id: orderItem.factory._id, name: orderItem.factory.name }
        : null,
      status: orderItem.status,
      orderType: orderItem.orderType,
      boxNumber: orderItem.boxNumber,
      manufacturingDate: orderItem.createdAt,
    };

    res.json(productDetails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProductDetailsAdminInventory = async (req, res) => {
  try {
    const { serialNumber } = req.params;
    const product = await Product.findOne({ serialNumber })
      .populate('category')
      .populate('model')
      .populate('factory')
      .populate('distributor');

    if (!product) return res.status(404).json({ message: 'Product not found' });

    const sale = await Sale.findOne({ product: product._id });

    if (product && product.distributor) {
      return res
        .status(400)
        .json({ message: 'Product already assigned to distributor' });
    }

    res.json({
      serialNumber: product.serialNumber,
      productId: product._id,
      productName: product.productName,
      orderId: product.orderId,
      category: product.category
        ? { _id: product.category._id, name: product.category.name }
        : null,
      model: product.model
        ? {
            _id: product.model._id,
            name: product.model.name,
            specifications: product.model.specifications,
          }
        : null,
      factory: product.factory
        ? { _id: product.factory._id, name: product.factory.name }
        : null,
      distributor: product.distributor
        ? { _id: product.distributor._id, name: product.distributor.name }
        : null,
      month: product.month,
      year: product.year,
      orderType: product.orderType,
      unitsPerBox: product.unitsPerBox,
      boxNumber: product.boxNumber,
      unit: product.unit,
      price: product.price,
      minStockLevel: product.minStockLevel,
      status: product.status,
      sold: product.sold,
      // saleDate: product.saleDate || null,
      assignedToDistributorAt: product.assignedToDistributorAt || null,
      warranty: product.assignedWarranty || null,
      sold: !!sale,
      saleDate: sale?.saleDate || null,
      manufacturingDate: product.createdAt,
    });
  } catch (error) {
    console.error('QR Product Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getProductDetailsDistributorInventory = async (req, res) => {
  try {
    const distributorId = req.user?.distributor;

    if (!distributorId)
      return res.status(401).json({ message: 'Unauthorized' });

    const { serialNumber } = req.params;
    if (!serialNumber)
      return res.status(400).json({ message: 'Serial number required' });

    const product = await Product.findOne({
      distributor: distributorId,
      serialNumber,
    })
      .populate('category')
      .populate('model')
      .populate('factory')
      .lean();

    if (!product)
      return res
        .status(400)
        .json({ message: 'Product not found in inventory' });

    const dealerAssigned = await DistributorDealerProduct.findOne({
      product: product._id,
    });

    if (dealerAssigned)
      return res
        .status(400)
        .json({ message: 'Product already assigned to dealer' });

    const sold = await Sale.findOne({ product: product._id });

    if (sold) return res.status(400).json({ message: 'Product already sold' });

    const productDetails = {
      productId: product._id,
      serialNumber: product.serialNumber,
      orderId: product.orderId,
      category: product.category
        ? { _id: product.category._id, name: product.category.name }
        : null,
      model: product.model
        ? {
            _id: product.model._id,
            name: product.model.name,
            specifications: product.model.specifications,
          }
        : null,
      factory: product.factory
        ? { _id: product.factory._id, name: product.factory.name }
        : null,
      status: product.status,
      orderType: product.orderType,
      boxNumber: product.boxNumber,
      manufacturingDate: product.createdAt,
    };

    res.status(200).json(productDetails);
  } catch (error) {
    console.error('Distributor product detail error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getProductDetailsDealerInventory = async (req, res) => {
  try {
    const dealerId = req.user.dealer;

    if (!dealerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { serialNumber } = req.params;
    if (!serialNumber) {
      return res.status(400).json({ message: 'Serial number required' });
    }

    /**
     * 1️⃣ Find product by serial
     */
    const product = await Product.findOne({ serialNumber })
      .populate('category')
      .populate('model')
      .populate('factory');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    /**
     * 2️⃣ Check SALE (truth source)
     * Dealer ke paas hona chahiye
     * SubDealer ko sale NAHI hua hona chahiye
     */
    const sale = await Sale.findOne({
      product: product._id,
      dealer: dealerId,
    });

    // ❌ dealer ka product hi nahi
    if (!sale) {
      return res
        .status(404)
        .json({ message: 'Product not in dealer inventory' });
    }

    // ❌ already subDealer ko de diya
    if (sale.subDealer) {
      return res
        .status(400)
        .json({ message: 'Product already assigned to sub dealer' });
    }

    /**
     * 3️⃣ SUCCESS RESPONSE
     */
    res.json({
      serialNumber: product.serialNumber,
      productId: product._id,
      orderId: product.orderId,
      category: product.category?.name || null,
      model: product.model
        ? {
            _id: product.model._id,
            name: product.model.name,
            specifications: product.model.specifications,
          }
        : null,
      factory: product.factory
        ? {
            _id: product.factory._id,
            name: product.factory.name,
          }
        : null,
      status: product.status,
      orderType: product.orderType,
      boxNumber: product.boxNumber,
      manufacturingDate: product.createdAt,
      assignedToDealerAt: sale.createdAt,
    });
  } catch (error) {
    console.error('Dealer inventory product error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getProductDetailsSubDealerInventory = async (req, res) => {
  try {
    // 🔑 subDealer id (JWT se)
    const subDealerId = req.user.subDealer || req.user._id;

    if (!subDealerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { serialNumber } = req.params;
    if (!serialNumber) {
      return res.status(400).json({ message: 'Serial number required' });
    }

    /**
     * 1️⃣ Product find by serial number
     */
    const product = await Product.findOne({ serialNumber })
      .populate('category')
      .populate('model')
      .populate('factory');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    /**
     * 2️⃣ SALE = single source of truth
     * ✅ subDealer ke inventory me hona chahiye
     * ❌ sold nahi hona chahiye
     */
    const sale = await Sale.findOne({
      product: product._id,
      subDealer: subDealerId,

      // ❌ agar customer ko sell ho chuka hai to reject
      $or: [
        { customerName: { $exists: false } },
        { customerName: null },
        { customerName: '' },
      ],
    });

    // ❌ subDealer ke paas product hi nahi
    if (!sale) {
      return res.status(404).json({
        message: 'Product not in sub-dealer inventory or already sold',
      });
    }

    /**
     * 3️⃣ SUCCESS RESPONSE
     */
    return res.json({
      serialNumber: product.serialNumber,
      productId: product._id,
      orderId: product.orderId,
      category: product.category?.name || null,
      model: product.model
        ? {
            _id: product.model._id,
            name: product.model.name,
            specifications: product.model.specifications,
          }
        : null,
      factory: product.factory
        ? {
            _id: product.factory._id,
            name: product.factory.name,
          }
        : null,
      status: product.status,
      orderType: product.orderType,
      boxNumber: product.boxNumber,
      manufacturingDate: product.createdAt,

      // 🔥 important timestamps
      assignedToSubDealerAt: sale.createdAt,
    });
  } catch (error) {
    console.error('SubDealer inventory product error:', error);
    return res.status(500).json({ message: error.message });
  }
};

export const updateProductStatusAndFactory = async (req, res) => {
  try {
    const { serialNumber } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['Pending', 'Completed', 'Dispatched'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const orderItem = await OrderItem.findOne({ serialNumber });

    if (!orderItem) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const now = new Date();
    const oldStatus = orderItem.status;

    orderItem.status = status;

    if (status === 'Pending') {
      orderItem.completedAt = null;
      orderItem.dispatchedAt = null;

      if (orderItem.isTransferredToProduct) {
        let temp = await Product.deleteOne({ serialNumber });
        orderItem.isTransferredToProduct = false;
      }
    }

    if (status === 'Completed') {
      orderItem.completedAt = now;
      orderItem.dispatchedAt = null;

      if (orderItem.isTransferredToProduct) {
        await Product.deleteOne({ serialNumber });
        orderItem.isTransferredToProduct = false;
      }
    }

    if (status === 'Dispatched') {
      orderItem.completedAt = now;
      orderItem.dispatchedAt = now;

      if (!orderItem.isTransferredToProduct) {
        const latestProduct = await Product.findOne().sort({ createdAt: -1 });

        let lastNumber = 0;
        if (latestProduct?.productId) {
          lastNumber = parseInt(latestProduct.productId.replace('PROD', ''));
        }

        const newProductId = `PROD${String(lastNumber + 1).padStart(5, '0')}`;
        const model = await Model.findById(orderItem.model);

        const productData = {
          productId: newProductId,
          productName: model?.name || 'Unknown Product',
          description: `Product from Order ${orderItem.orderId}`,
          serialNumber: orderItem.serialNumber,
          month: orderItem.month,
          year: orderItem.year,
          category: orderItem.category,
          model: orderItem.model,
          quantity: 1,
          orderType: orderItem.orderType,
          unitsPerBox: orderItem.unitsPerBox,
          factory: orderItem.factory,
          orderId: orderItem.orderId,
          boxNumber: orderItem.boxNumber,
          unit: 'Piece',
          price: model?.specifications?.mrpPrice || 0,
          minStockLevel: 10,
          status: 'Active',
        };

        await Product.create(productData);
        orderItem.isTransferredToProduct = true;
      }
    }

    await orderItem.save();

    const updatedItem = await OrderItem.findById(orderItem._id)
      .populate('category')
      .populate('model');

    res.status(200).json(updatedItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
