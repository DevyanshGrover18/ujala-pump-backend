import Factory from '../models/Factory.js';
import Order, { OrderItem } from '../models/Order.js';
import UserRole from '../models/UserRole.js';
// import Product from '../models/Product.js';
import Dealer from '../models/Dealer.js';
import Distributor from '../models/Distributor.js';
import Model from '../models/Model.js';
import Sale from '../models/Sale.js';

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
