import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Model from '../models/Model.js';
import UserRole from '../models/UserRole.js';
import { login } from './authController.js';

// Helper to check factory access
export const checkFactoryAccess = async (user, factoryId) => {
  if (user.role === 'admin') return true;
  if (user.role === 'member') {
    const userRole = await UserRole.findById(user.id);
    if (userRole && userRole.assignedFactories) {
      const assignedIds = userRole.assignedFactories.map((id) => id.toString());
      if (assignedIds.includes(factoryId)) {
        return true;
      }
    }
  }
  // For 'factory' role users (User model), they are linked to a single factory
  if (
    user.role === 'factory' &&
    user.factory &&
    user.factory.toString() === factoryId
  ) {
    return true;
  }
  return false;
};

// @desc    Get all orders for a factory
// @route   GET /api/factory/orders
// @access  Private
const getOrders = asyncHandler(async (req, res) => {
  const { factoryId } = req.query;

  if (!(await checkFactoryAccess(req.user, factoryId))) {
    res.status(403);
    throw new Error('Not authorized to view orders for this factory');
  }

  const orders = await Order.find({ factory: factoryId });
  res.json(orders);
});

const getFactoriesModels = asyncHandler(async (req, res) => {
  const { id: factoryId } = req.params;
  if (!factoryId)
    return res.status(400).json({ message: 'Factory ID required' });

  if (!(await checkFactoryAccess(req.user, factoryId))) {
    res.status(403);
    throw new Error('Not authorized to view models for this factory');
  }

  const modelIds = await Order.find({ factory: factoryId }).distinct('model');
  const models = await Model.find({ _id: { $in: modelIds } });
  res.status(200).json(models);
});

// @desc    Create a new order for a factory
// @route   POST /api/factory/orders
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const {
    productName,
    description,
    category,
    quantity,
    unit,
    price,
    minStockLevel,
    status,
    factoryId,
  } = req.body;

  if (!(await checkFactoryAccess(req.user, factoryId))) {
    res.status(403);
    throw new Error('Not authorized to create orders for this factory');
  }

  // Find the latest order to get the last order ID
  const latestOrder = await Order.findOne().sort({ orderId: -1 });

  // Generate new order ID
  let newOrderId;
  if (latestOrder) {
    const lastNumber = parseInt(latestOrder.orderId.replace('ORD', ''));
    newOrderId = `ORD${String(lastNumber + 1).padStart(5, '0')}`;
  } else {
    newOrderId = 'ORD00001';
  }

  const order = new Order({
    orderId: newOrderId,
    productName,
    description,
    category,
    quantity,
    unit,
    price,
    minStockLevel,
    status,
    factory: factoryId,
  });

  const createdOrder = await order.save();
  res.status(201).json(createdOrder);
});

// @desc    Update an order for a factory
// @route   PUT /api/factory/orders/:id
// @access  Private
const updateOrder = asyncHandler(async (req, res) => {
  const {
    productName,
    description,
    category,
    quantity,
    unit,
    price,
    minStockLevel,
    status,
    factoryId,
  } = req.body;

  if (!(await checkFactoryAccess(req.user, factoryId))) {
    res.status(403);
    throw new Error('Not authorized to update orders for this factory');
  }

  const order = await Order.findById(req.params.id);

  if (order && order.factory.toString() === factoryId) {
    order.productName = productName;
    order.description = description;
    order.category = category;
    order.quantity = quantity;
    order.unit = unit;
    order.price = price;
    order.minStockLevel = minStockLevel;
    order.status = status;

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } else {
    res.status(404);
    throw new Error('Order not found or not authorized');
  }
});

// @desc    Delete an order for a factory
// @route   DELETE /api/factory/orders/:id
// @access  Private
const deleteOrder = asyncHandler(async (req, res) => {
  const { factoryId } = req.body;

  if (!(await checkFactoryAccess(req.user, factoryId))) {
    res.status(403);
    throw new Error('Not authorized to delete orders for this factory');
  }

  const order = await Order.findById(req.params.id);

  if (order && order.factory.toString() === factoryId) {
    await order.remove();
    res.json({ message: 'Order removed' });
  } else {
    res.status(404);
    throw new Error('Order not found or not authorized');
  }
});

// @desc    Update order status for a factory
// @route   PATCH /api/factory/orders/:id/status
// @access  Private
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, factoryId } = req.body;

  if (!(await checkFactoryAccess(req.user, factoryId))) {
    res.status(403);
    throw new Error('Not authorized to update order status for this factory');
  }

  const order = await Order.findById(id);

  if (order && order.factory.toString() === factoryId) {
    order.status = status;
    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } else {
    res.status(404);
    throw new Error('Order not found or not authorized');
  }
});

export {
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  updateOrderStatus,
  getFactoriesModels,
};
