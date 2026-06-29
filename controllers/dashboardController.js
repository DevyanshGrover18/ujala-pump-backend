import Factory from '../models/Factory.js';
import Order, { OrderItem } from '../models/Order.js';
import UserRole from '../models/UserRole.js';
import Product from '../models/Product.js';
import Dealer from '../models/Dealer.js';
import Distributor from '../models/Distributor.js';
import Model from '../models/Model.js';
import Sale from '../models/Sale.js';
import Executive from '../models/Executive.js';

export const getOrderStats = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'member') {
      const userRole = await UserRole.findById(req.user.id);
      const assignedFactories = userRole?.assignedFactories || [];
      query = { factory: { $in: assignedFactories } };
    } else if (req.user.role === 'factory') {
      // Factory users can only see their own orders
      query = { factory: req.user.factory };
    }

    const totalOrders = await Order.countDocuments(query);
    const pendingOrders = await Order.countDocuments({
      ...query,
      status: 'Pending',
    });
    const completedOrders = await Order.countDocuments({
      ...query,
      status: 'Completed',
    });
    // FIX: Changed the query to use the 'status' field, consistent with your schema
    const dispatchedOrders = await Order.countDocuments({
      ...query,
      status: 'Dispatched',
    });

    res.json({
      total: totalOrders,
      pending: pendingOrders,
      completed: completedOrders,
      dispatched: dispatchedOrders,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// FIX: The floating try...catch block is now wrapped in a proper exported function.
export const getDashboardStats = async (req, res) => {
  try {
    let factoryQuery = {};
    let orderQuery = {};

    if (req.user.role === 'member') {
      const userRole = await UserRole.findById(req.user.id);
      const assignedFactories = userRole?.assignedFactories || [];
      factoryQuery = { _id: { $in: assignedFactories } };
      orderQuery = { factory: { $in: assignedFactories } };
    } else if (req.user.role === 'factory') {
      factoryQuery = { _id: req.user.factory };
      orderQuery = { factory: req.user.factory };
    }

    const factoryCount = await Factory.countDocuments(factoryQuery);
    const orderCount = await Order.countDocuments(orderQuery);
    // const productCount = await Product.countDocuments();
    const dealerCount = await Dealer.countDocuments();
    const distributorCount = await Distributor.countDocuments();
    const modelCount = await Model.countDocuments();

    res.json({
      factories: factoryCount,
      orders: orderCount,
      // products: productCount,
      dealers: dealerCount,
      distributors: distributorCount,
      models: modelCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderItemStats = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'member') {
      const userRole = await UserRole.findById(req.user.id);
      const assignedFactories = userRole?.assignedFactories || [];
      query = { factory: { $in: assignedFactories } };
    } else if (req.user.role === 'factory') {
      query = { factory: req.user.factory };
    }

    const pendingItems = await OrderItem.countDocuments({
      ...query,
      status: 'Pending',
    });
    const completedItems = await OrderItem.countDocuments({
      ...query,
      status: 'Completed',
    });
    const dispatchedItems = await OrderItem.countDocuments({
      ...query,
      status: 'Dispatched',
    });

    res.json({
      pending: pendingItems,
      completed: completedItems,
      dispatched: dispatchedItems,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMonthlySalesData = async (req, res) => {
  try {
    const salesData = await Sale.aggregate([
      {
        $group: {
          _id: { $month: '$createdAt' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json(salesData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getExecutiveDashboardStats = async (req, res) => {
  try {
    const exec = await Executive.findOne({ user: req.user.id });
    if (!exec) {
      return res.status(404).json({ message: 'Executive profile not found' });
    }

    // 1. Entity Counts
    const totalDistributors = exec.distributors.length;
    const totalDealers = exec.dealers.length;
    const totalSubDealers = exec.subDealers.length;

    // 2. Total Customers & Sales (direct or dealer/subdealer sales to customer)
    const totalCustomers = await Sale.countDocuments({
      distributor: { $in: exec.distributors },
      customerName: { $exists: true, $ne: '' }
    });

    const totalSales = totalCustomers; // Each sold item is a sale in WMS

    // 3. Inventory Summary
    const distributorInventory = await Product.aggregate([
      { $match: { distributor: { $in: exec.distributors }, sold: { $ne: true } } },
      { $lookup: { from: 'distributordealerproducts', localField: '_id', foreignField: 'product', as: 'assignment' } },
      { $match: { assignment: { $size: 0 } } },
      { $count: 'count' }
    ]);
    const distStock = distributorInventory[0]?.count || 0;

    const dealerStock = await Sale.countDocuments({
      dealer: { $in: exec.dealers },
      subDealer: null,
      customerName: { $exists: false }
    });

    const subDealerStock = await Sale.countDocuments({
      subDealer: { $in: exec.subDealers },
      customerName: { $exists: false }
    });

    const inventorySummary = {
      distributors: distStock,
      dealers: dealerStock,
      subDealers: subDealerStock,
      total: distStock + dealerStock + subDealerStock
    };

    // 4. Recent Orders
    const productOrderIds = await Product.find({ distributor: { $in: exec.distributors } }).distinct('orderId');
    const recentOrders = await Order.find({ orderId: { $in: productOrderIds } })
      .populate('category', 'name')
      .populate('model', 'name')
      .populate('factory', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    // 5. Low Stock Products (grouping distributor stock by model, count <= 5)
    const lowStockAggregation = await Product.aggregate([
      {
        $match: {
          distributor: { $in: exec.distributors },
          sold: { $ne: true }
        }
      },
      {
        $lookup: {
          from: 'distributordealerproducts',
          localField: '_id',
          foreignField: 'product',
          as: 'dealerAssignment'
        }
      },
      {
        $match: {
          dealerAssignment: { $size: 0 }
        }
      },
      {
        $group: {
          _id: '$model',
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $lte: 5 }
        }
      },
      {
        $lookup: {
          from: 'models',
          localField: '_id',
          foreignField: '_id',
          as: 'modelDetails'
        }
      },
      { $unwind: '$modelDetails' }
    ]);

    const lowStockProducts = lowStockAggregation.map(item => ({
      modelId: item._id,
      name: item.modelDetails.name,
      code: item.modelDetails.code,
      stock: item.count
    }));

    // 6. Recent Customer Activity (recent sales where customerName is present)
    const recentCustomerActivity = await Sale.find({
      distributor: { $in: exec.distributors },
      customerName: { $exists: true, $ne: '' }
    })
      .populate('distributor', 'name')
      .populate('dealer', 'name')
      .populate('subDealer', 'name')
      .populate({
        path: 'product',
        populate: { path: 'model' }
      })
      .sort({ saleDate: -1, createdAt: -1 })
      .limit(5);

    res.json({
      counts: {
        distributors: totalDistributors,
        dealers: totalDealers,
        subDealers: totalSubDealers,
        customers: totalCustomers,
        sales: totalSales
      },
      inventorySummary,
      recentOrders,
      lowStockProducts,
      recentCustomerActivity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
