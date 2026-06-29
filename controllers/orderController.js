import mongoose from 'mongoose';
import Order, { OrderItem, FactoryCounter } from '../models/Order.js';
import Product from '../models/Product.js';
import Factory from '../models/Factory.js';
import Model from '../models/Model.js';
import UserRole from '../models/UserRole.js';
import { checkFactoryAccess } from './factoryOrderController.js';

// Configuration for bulk operations
const BULK_BATCH_SIZE = 1000;

const arraysEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; ++i) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
};

// Utility function to process arrays in batches
const processBatches = async (items, batchSize, callback) => {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const result = await callback(batch, i);
    results.push(result);
  }
  return results;
};

// Generate order items efficiently
const generateOrderItems = (config) => {
  const {
    orderId,
    startCounter,
    totalUnits,
    unitsPerBox,
    itemSerialBase,
    month,
    year,
    category,
    modelId,
    factoryId,
    orderType,
    status = 'Pending',
  } = config;

  return Array.from({ length: totalUnits }, (_, i) => {
    const currentCounter = startCounter + i;
    const itemSerialNumber = `${itemSerialBase}${currentCounter}`;
    const boxNumber = Math.ceil((i + 1) / unitsPerBox);

    // Clean item data - don't include any date fields
    return {
      orderId,
      serialNumber: itemSerialNumber,
      month,
      year,
      category,
      model: modelId,
      factory: factoryId,
      status,
      orderType,
      unitsPerBox,
      boxNumber,
    };
  });
};

// Optimized bulk insert with batching
const bulkInsertOrderItems = async (orderItems, session) => {
  if (orderItems.length === 0) return [];

  if (orderItems.length <= BULK_BATCH_SIZE) {
    return await OrderItem.insertMany(orderItems, {
      session,
      ordered: false,
    });
  }

  const results = await processBatches(
    orderItems,
    BULK_BATCH_SIZE,
    async (batch) => {
      return await OrderItem.insertMany(batch, {
        session,
        ordered: false,
      });
    }
  );

  return results.flat();
};

// Optimized bulk update
const bulkUpdateOrderItems = async (filter, updateData, session = null) => {
  return await OrderItem.updateMany(
    filter,
    { $set: updateData },
    session ? { session } : {}
  );
};

// Optimized bulk delete
const bulkDeleteOrderItems = async (orderIds, session) => {
  if (!orderIds || orderIds.length === 0) return { deletedCount: 0 };
  return await OrderItem.deleteMany(
    { orderId: { $in: orderIds } },
    { session }
  );
};

export const getOrders = async (req, res) => {
  try {
    const { factory } = req.query;
    let matchQuery = {};

    if (factory) {
      const factoryObj = await Factory.findOne({ name: factory });
      if (factoryObj) {
        matchQuery.factory = factoryObj._id;
      } else {
        return res.status(200).json([]);
      }
    }

    // Access Control for Staff Members
    if (req.user.role === 'member') {
      const userRole = await UserRole.findById(req.user.id);
      const assignedFactories = userRole?.assignedFactories || [];

      if (matchQuery.factory) {
        // Check if the explicitly requested factory is assigned
        const requestedId = matchQuery.factory.toString();
        const assignedIds = assignedFactories.map((id) => id.toString());
        if (!assignedIds.includes(requestedId)) {
          return res.status(200).json([]);
        }
      } else {
        // Restrict to assigned factories
        if (assignedFactories.length === 0) {
          return res.status(200).json([]);
        }
        matchQuery.factory = { $in: assignedFactories };
      }
    }

    // OPTIMIZED: Use aggregation pipeline for counting
    const orders = await Order.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'orderitems',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'items',
        },
      },
      {
        $addFields: {
          pendingUnits: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.status', 'Pending'] },
              },
            },
          },
          completedUnits: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.status', 'Completed'] },
              },
            },
          },
          dispatchedUnits: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.status', 'Dispatched'] },
              },
            },
          },
        },
      },
      { $project: { items: 0 } },
      {
        $lookup: {
          from: 'factories',
          localField: 'factory',
          foreignField: '_id',
          as: 'factory',
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
        $lookup: {
          from: 'models',
          localField: 'model',
          foreignField: '_id',
          as: 'model',
        },
      },
      { $unwind: { path: '$factory', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$model', preserveNullAndEmptyArrays: true } },
    ]);

    res.status(200).json(orders);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      month,
      year,
      factory: factoryId,
      model: modelId,
      quantity,
      orderType,
      isManual,
      serialNumbers,
      ...orderData
    } = req.body;

    if (!month || !year || !factoryId || !modelId || !quantity || !orderType) {
      return res.status(400).json({
        message:
          'Month, year, factory, model, quantity, and orderType are required',
      });
    }

    // Access Control Check
    if (!(await checkFactoryAccess(req.user, factoryId))) {
      return res
        .status(403)
        .json({ message: 'Not authorized to create orders for this factory' });
    }

    // Remove any invalid date fields from orderData to prevent "invalid date" issues
    const cleanOrderData = { ...orderData };
    delete cleanOrderData.createdAt;
    delete cleanOrderData.updatedAt;
    delete cleanOrderData.completedAt;
    delete cleanOrderData.dispatchedAt;

    const unitsPerBox =
      orderType === '2_units' ? 2 : orderType === '3_units' ? 3 : 1;
    const totalUnits = quantity * unitsPerBox;

    const isManualOrder = isManual === true || isManual === 'true' || (Array.isArray(serialNumbers) && serialNumbers.length > 0);

    // Validate manual serial numbers if isManualOrder is true
    const serials = [];
    if (isManualOrder) {
      const parsedSerials = (Array.isArray(serialNumbers) ? serialNumbers :
        (typeof serialNumbers === 'string' ? serialNumbers.split(',') : [])
      )
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);

      if (parsedSerials.length !== totalUnits) {
        return res.status(400).json({
          message: `The number of pumps (${totalUnits}) does not match the number of serial numbers provided (${parsedSerials.length}).`,
        });
      }

      // Check for duplicate serials within the input array
      const uniqueSerials = [...new Set(parsedSerials)];
      if (uniqueSerials.length !== parsedSerials.length) {
        const duplicates = parsedSerials.filter((item, index) => parsedSerials.indexOf(item) !== index);
        return res.status(400).json({
          message: `Duplicate serial numbers found in input: ${[...new Set(duplicates)].join(', ')}`,
        });
      }

      // Check if any of these serials exist in OrderItem or Product database (case-insensitive)
      const regexSerials = parsedSerials.map(sn => new RegExp(`^${sn}$`, 'i'));
      const [existingItems, existingProducts] = await Promise.all([
        OrderItem.find({ serialNumber: { $in: regexSerials } }),
        Product.find({ serialNumber: { $in: regexSerials } })
      ]);
      if (existingItems.length > 0 || existingProducts.length > 0) {
        const dupSerials = [
          ...existingItems.map(item => item.serialNumber),
          ...existingProducts.map(p => p.serialNumber)
        ];
        const uniqueDupSerials = [...new Set(dupSerials)];
        return res.status(400).json({
          message: `The following serial numbers already exist in the database: ${uniqueDupSerials.join(', ')}`,
        });
      }
      serials.push(...parsedSerials);
    }

    const factory = await Factory.findById(factoryId);
    if (!factory) {
      return res.status(404).json({ message: 'Factory not found' });
    }

    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    let result;
    await session.withTransaction(async () => {
      // Generate unique order ID atomically
      const latestOrder = await Order.findOne(
        {},
        {},
        { sort: { orderId: -1 }, session }
      );
      let newOrderId;
      if (latestOrder) {
        const lastNumber = parseInt(latestOrder.orderId.replace('ORD', ''));
        newOrderId = `ORD${String(lastNumber + 1).padStart(5, '0')}`;
      } else {
        newOrderId = 'ORD00001';
      }

      let orderSerialNumber;
      let orderItems;

      if (isManualOrder) {
        orderSerialNumber = `MAN-${newOrderId}`;

        orderItems = serials.map((sn, i) => {
          const boxNumber = Math.ceil((i + 1) / unitsPerBox);
          return {
            orderId: newOrderId,
            serialNumber: sn,
            month,
            year,
            category: cleanOrderData.category,
            model: modelId,
            factory: factoryId,
            status: 'Pending',
            orderType,
            unitsPerBox,
            boxNumber,
            isManual: true,
          };
        });
      } else {
        // FIX: Handle factory counter initialization and increment separately
        let factoryCounter = await FactoryCounter.findOne(
          { factoryId },
          {},
          { session }
        );

        if (!factoryCounter) {
          // Initialize counter for first time
          const newCounter = await FactoryCounter.create(
            [{ factoryId, counter: 10000 }],
            { session }
          );
          factoryCounter = newCounter[0];
        }

        // Ensure counter is treated as number
        const currentCounter = parseInt(factoryCounter.counter);
        const startCounter = currentCounter + 1;
        const endCounter = startCounter + totalUnits - 1;

        // Now increment the counter
        await FactoryCounter.findOneAndUpdate(
          { factoryId },
          { $inc: { counter: totalUnits } },
          { session }
        );

        const monthStr = String(month).padStart(2, '0');
        const yearStr = String(year).slice(-2);
        const factoryCode = factory.code.toUpperCase();

        // Create serial number range for the order (includes model code)
        const modelCode = model.code.toUpperCase();
        const orderSerialBase = `${monthStr}${yearStr}${factoryCode}${modelCode}`;
        orderSerialNumber = `${orderSerialBase}${startCounter}-${endCounter}`;

        // OPTIMIZED: Generate all order items at once
        const itemSerialBase = `${monthStr}${yearStr}${factoryCode}${modelCode}`;
        orderItems = generateOrderItems({
          orderId: newOrderId,
          startCounter,
          totalUnits,
          unitsPerBox,
          itemSerialBase,
          month,
          year,
          category: cleanOrderData.category,
          modelId,
          factoryId,
          orderType,
        });
      }

      const order = {
        ...cleanOrderData,
        orderId: newOrderId,
        serialNumber: orderSerialNumber,
        month,
        year,
        quantity,
        factory: factoryId,
        model: modelId,
        orderType,
        unitsPerBox,
        totalUnits,
        isManual: isManualOrder,
      };

      const newOrder = new Order(order);
      await newOrder.save({ session });

      // OPTIMIZED: Bulk insert with batching
      await bulkInsertOrderItems(orderItems, session);

      result = await Order.findById(newOrder._id, {}, { session })
        .populate('factory')
        .populate('category')
        .populate('model');
    });

    res.status(201).json(result);
  } catch (error) {
    if (error.code === 11000) {
      // Handle duplicate key error specifically
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({
        message: `Duplicate ${duplicateField} detected. Please try again.`,
        error: 'DUPLICATE_KEY_ERROR',
      });
    }
    res.status(409).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const updateOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id: _id } = req.params;
    const orderData = req.body;

    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res
        .status(400)
        .json({ message: `Invalid order ID format: ${_id}` });
    }

    const existingOrder = await Order.findById(_id);
    if (!existingOrder) {
      return res
        .status(404)
        .json({ message: `Order not found with id: ${_id}` });
    }

    // Access Control Check
    if (
      !(await checkFactoryAccess(req.user, existingOrder.factory.toString()))
    ) {
      return res
        .status(403)
        .json({ message: 'Not authorized to update orders for this factory' });
    }

    const isManualOrder = existingOrder.isManual === true || (Array.isArray(newSerialNumbers) && newSerialNumbers.length > 0);
    let serialsChanged = false;
    let parsedSerials = [];

    if (isManualOrder) {
      parsedSerials = (Array.isArray(newSerialNumbers) ? newSerialNumbers :
        (typeof newSerialNumbers === 'string' ? newSerialNumbers.split(',') : [])
      )
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);

      // Check if serials changed
      if (parsedSerials.length > 0) {
        const existingItems = await OrderItem.find({ orderId: existingOrder.orderId });
        const existingSerials = existingItems.map(item => item.serialNumber.toUpperCase());
        if (!arraysEqual(parsedSerials, existingSerials)) {
          serialsChanged = true;
        }
      } else {
        // If not provided in req.body, keep the existing serials
        const existingItems = await OrderItem.find({ orderId: existingOrder.orderId });
        parsedSerials = existingItems.map(item => item.serialNumber);
      }
    }

    if (quantityChanged || orderTypeChanged || serialsChanged) {
      // Major change, need to regenerate items.

      await session.withTransaction(async () => {
        // Recalculate units
        const quantity = orderData.quantity || existingOrder.quantity;
        const orderType = orderData.orderType || existingOrder.orderType;
        const unitsPerBox =
          orderType === '2_units' ? 2 : orderType === '3_units' ? 3 : 1;
        const totalUnits = quantity * unitsPerBox;

        orderData.unitsPerBox = unitsPerBox;
        orderData.totalUnits = totalUnits;

        let orderItems;

        if (isManualOrder) {
          if (parsedSerials.length !== totalUnits) {
            throw new Error(`The number of pumps (${totalUnits}) does not match the number of serial numbers provided (${parsedSerials.length}).`);
          }

          // Check for duplicate serials within the input array
          const uniqueSerials = [...new Set(parsedSerials)];
          if (uniqueSerials.length !== parsedSerials.length) {
            const duplicates = parsedSerials.filter((item, index) => parsedSerials.indexOf(item) !== index);
            throw new Error(`Duplicate serial numbers found in input: ${[...new Set(duplicates)].join(', ')}`);
          }

          // Check if any of these serials exist in OrderItem or Product database (excluding current order, case-insensitive)
          const regexSerials = parsedSerials.map(sn => new RegExp(`^${sn}$`, 'i'));
          const [dbDuplicates, dbProductDuplicates] = await Promise.all([
            OrderItem.find({
              serialNumber: { $in: regexSerials },
              orderId: { $ne: existingOrder.orderId }
            }, {}, { session }),
            Product.find({
              serialNumber: { $in: regexSerials },
              orderId: { $ne: existingOrder.orderId }
            }, {}, { session })
          ]);

          if (dbDuplicates.length > 0 || dbProductDuplicates.length > 0) {
            const dupSerials = [
              ...dbDuplicates.map(item => item.serialNumber),
              ...dbProductDuplicates.map(p => p.serialNumber)
            ];
            const uniqueDupSerials = [...new Set(dupSerials)];
            throw new Error(`The following serial numbers already exist in the database: ${uniqueDupSerials.join(', ')}`);
          }

          // Delete old items
          await bulkDeleteOrderItems([existingOrder.orderId], session);

          // Generate new items
          orderItems = parsedSerials.map((sn, i) => {
            const boxNumber = Math.ceil((i + 1) / unitsPerBox);
            return {
              orderId: existingOrder.orderId,
              serialNumber: sn,
              month: orderData.month || existingOrder.month,
              year: orderData.year || existingOrder.year,
              category: orderData.category || existingOrder.category,
              model: orderData.model || existingOrder.model,
              factory: orderData.factory || existingOrder.factory,
              status: 'Pending',
              orderType,
              unitsPerBox,
              boxNumber,
              isManual: true,
            };
          });

          // Serial number range for Order
          orderData.serialNumber = `MAN-${existingOrder.orderId}`;
        } else {
          // 1. Extract starting counter from existing order's serialNumber
          const existingSerialMatch =
            existingOrder.serialNumber.match(/(\d+)-(\d+)$/);
          if (!existingSerialMatch) {
            throw new Error('Unable to parse existing serial number format');
          }

          const existingStartCounter = parseInt(existingSerialMatch[1]);

          // 2. OPTIMIZED: Bulk delete old items
          await bulkDeleteOrderItems([existingOrder.orderId], session);

          // 4. Get related data for serial number generation
          const factoryId = orderData.factory || existingOrder.factory;
          const modelId = orderData.model || existingOrder.model;
          const factory = await Factory.findById(factoryId);
          const model = await Model.findById(modelId);
          if (!factory || !model) {
            throw new Error('Factory or Model not found');
          }

          // 5. Calculate new counter range using the ORIGINAL start counter
          // This ensures edits reuse the same serial range without over-incrementing
          const startCounter = existingStartCounter;
          const endCounter = startCounter + totalUnits - 1;

          // 6. Update FactoryCounter to reflect the new end position (only if increased)
          const oldTotalUnits = existingOrder.totalUnits;
          if (totalUnits > oldTotalUnits) {
            // Only increment by the difference
            const difference = totalUnits - oldTotalUnits;
            await FactoryCounter.findOneAndUpdate(
              { factoryId },
              { $inc: { counter: difference } },
              { upsert: true, setDefaultsOnInsert: true, session }
            );
          } else if (totalUnits < oldTotalUnits) {
            // Decrement the counter if reducing units
            const difference = oldTotalUnits - totalUnits;
            await FactoryCounter.findOneAndUpdate(
              { factoryId },
              { $inc: { counter: -difference } },
              { upsert: true, setDefaultsOnInsert: true, session }
            );
          }
          // If equal, no counter change needed

          // 7. Generate new serial number range for Order
          const month = orderData.month || existingOrder.month;
          const year = orderData.year || existingOrder.year;
          const monthStr = String(month).padStart(2, '0');
          const yearStr = String(year).slice(-2);
          const factoryCode = factory.code.toUpperCase();

          // Order serial number (includes model code)
          const modelCode = model.code.toUpperCase();
          const orderSerialBase = `${monthStr}${yearStr}${factoryCode}${modelCode}`;
          orderData.serialNumber = `${orderSerialBase}${startCounter}-${endCounter}`;

          // 8. Create new items
          // 8. OPTIMIZED: Generate and bulk insert new items
          const itemSerialBase = `${monthStr}${yearStr}${factoryCode}${modelCode}`;
          orderItems = generateOrderItems({
            orderId: existingOrder.orderId,
            startCounter,
            totalUnits,
            unitsPerBox,
            itemSerialBase,
            month,
            year,
            category: orderData.category || existingOrder.category,
            modelId,
            factoryId,
            orderType,
          });
        }

        await bulkInsertOrderItems(orderItems, session);

        // 10. Update the Order document
        await Order.findByIdAndUpdate(_id, orderData, { new: true, session })
          .populate('factory')
          .populate('category')
          .populate('model');
      });

      // Fetch and return updated order after transaction
      const updatedOrder = await Order.findById(_id)
        .populate('factory')
        .populate('category')
        .populate('model');

      res.json(updatedOrder);
    } else {
      // Simple update, no quantity/type change
      const updatedOrder = await Order.findByIdAndUpdate(_id, orderData, {
        new: true,
      })
        .populate('factory')
        .populate('category')
        .populate('model');

      const updateData = {};
      if (orderData.factory) updateData.factory = orderData.factory;
      if (orderData.category) updateData.category = orderData.category;
      if (orderData.model) updateData.model = orderData.model;

      if (Object.keys(updateData).length > 0) {
        await bulkUpdateOrderItems(
          { orderId: existingOrder.orderId },
          updateData
        );
      }
      res.json(updatedOrder);
    }
  } catch (error) {
    if (error.code === 11000) {
      // Handle duplicate key error specifically
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({
        message: `Duplicate ${duplicateField} detected. Please try again.`,
        error: 'DUPLICATE_KEY_ERROR',
      });
    }
    res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const deleteOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Access Control Check
    if (!(await checkFactoryAccess(req.user, order.factory.toString()))) {
      return res
        .status(403)
        .json({ message: 'Not authorized to delete orders for this factory' });
    }

    await session.withTransaction(async () => {
      // Get the order's total units to decrement from factory counter
      const totalUnits = order.totalUnits || 0;

      // Delete order items and order
      await bulkDeleteOrderItems([order.orderId], session);
      await Order.deleteOne({ _id: id }, { session });

      // Decrement factory counter by the deleted order's units (if not manual)
      if (totalUnits > 0 && !order.isManual) {
        await FactoryCounter.findOneAndUpdate(
          { factoryId: order.factory },
          { $inc: { counter: -totalUnits } },
          { upsert: true, session }
        );
      }
    });

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const deleteMultipleOrders = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Order IDs are required.' });
    }

    // Validate all IDs
    const validIds = ids.every((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds) {
      return res.status(400).json({ message: 'Invalid order ID format(s).' });
    }

    const orders = await Order.find({ _id: { $in: ids } });
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ message: 'No orders found with the provided IDs.' });
    }

    await session.withTransaction(async () => {
      const orderIds = orders.map((order) => order.orderId);

      // Delete order items and orders
      await OrderItem.deleteMany({ orderId: { $in: orderIds } }, { session });
      await Order.deleteMany({ _id: { $in: ids } }, { session });

      // Group orders by factory and decrement counters
      // OPTIMIZED: Single bulk delete operation
      await bulkDeleteOrderItems(orderIds, session);
      await Order.deleteMany({ _id: { $in: ids } }, { session });

      // OPTIMIZED: Bulk update factory counters using bulkWrite
      const factoryTotals = {};
      orders.forEach((order) => {
        if (!order.isManual) {
          const factoryId = order.factory.toString();
          factoryTotals[factoryId] =
            (factoryTotals[factoryId] || 0) + (order.totalUnits || 0);
        }
      });

      const bulkOps = Object.entries(factoryTotals).map(
        ([factoryId, totalUnits]) => ({
          updateOne: {
            filter: { factoryId },
            update: { $inc: { counter: -totalUnits } },
            upsert: true,
          },
        })
      );

      if (bulkOps.length > 0) {
        await FactoryCounter.bulkWrite(bulkOps, { session });
      }
    });

    res.json({
      message: 'Orders deleted successfully.',
      deletedCount: orders.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const markOrderAsDispatched = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).send('No order with that id');
  }

  try {
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'Completed') {
      return res.status(400).json({
        message: 'Order must be completed before it can be dispatched',
      });
    }

    // FIX: Update status and dispatchedAt timestamp
    order.status = 'Dispatched';
    order.dispatchedAt = new Date();

    const updatedOrder = await order.save();

    // FIX: Update status and dispatchedAt on all associated order items
    await bulkUpdateOrderItems(
      { orderId: order.orderId },
      { status: 'Dispatched', dispatchedAt: new Date() }
    );

    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// FIX: Floating code block is now a correctly named function
export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).send('No order with that id');
  }

  const validStatuses = [
    'Pending',
    'In Progress',
    'Completed',
    'Cancelled',
    'Dispatched',
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  try {
    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Access Control Check
    if (
      !(await checkFactoryAccess(req.user, existingOrder.factory.toString()))
    ) {
      return res
        .status(403)
        .json({ message: 'Not authorized to update orders for this factory' });
    }

    const updateData = { status };
    // Set completion timestamp if status is 'Completed'
    if (status === 'Completed') {
      updateData.completedAt = new Date();
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, updateData, {
      new: true,
    })
      .populate('factory')
      .populate('category')
      .populate('model');

    if (!updatedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await bulkUpdateOrderItems({ orderId: updatedOrder.orderId }, updateData);

    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const cleanupOrphanedOrderItems = async (req, res) => {
  try {
    // OPTIMIZED: Use aggregation to find orphaned items
    const orphanedItems = await OrderItem.aggregate([
      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'order',
        },
      },
      {
        $match: {
          order: { $size: 0 },
        },
      },
      {
        $project: { _id: 1, orderId: 1 },
      },
    ]);

    if (orphanedItems.length > 0) {
      const orphanedIds = orphanedItems.map((item) => item._id);
      await OrderItem.deleteMany({ _id: { $in: orphanedIds } });

      res.json({
        message: `Cleaned up ${orphanedItems.length} orphaned order items`,
        deletedCount: orphanedItems.length,
      });
    } else {
      res.json({ message: 'No orphaned order items found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetFactoryCounters = async (req, res) => {
  try {
    const factories = await Factory.find({});

    // OPTIMIZED: Use aggregation to find last serial numbers
    const lastSerialsByFactory = await OrderItem.aggregate([
      {
        $group: {
          _id: '$factory',
          maxSerial: { $max: '$serialNumber' },
        },
      },
    ]);

    const serialMap = new Map(
      lastSerialsByFactory.map((item) => [item._id.toString(), item.maxSerial])
    );

    // OPTIMIZED: Prepare bulk operations
    const bulkOps = factories.map((factory) => {
      const lastSerial = serialMap.get(factory._id.toString());
      let newCounter = 10000;

      if (lastSerial) {
        const counterMatch = lastSerial.match(/(\d+)$/);
        if (counterMatch) {
          newCounter = parseInt(counterMatch[1]);
        }
      }

      return {
        updateOne: {
          filter: { factoryId: factory._id },
          update: { $set: { counter: newCounter } },
          upsert: true,
        },
      };
    });

    if (bulkOps.length > 0) {
      await FactoryCounter.bulkWrite(bulkOps);
    }

    const resetResults = factories.map((factory) => {
      const lastSerial = serialMap.get(factory._id.toString());
      let newCounter = 10000;

      if (lastSerial) {
        const counterMatch = lastSerial.match(/(\d+)$/);
        if (counterMatch) {
          newCounter = parseInt(counterMatch[1]);
        }
      }

      return {
        factoryId: factory._id,
        factoryName: factory.name,
        resetTo: newCounter,
      };
    });

    res.json({
      message: 'Factory counters reset successfully',
      results: resetResults,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const cleanupDuplicateSerialNumbers = async (req, res) => {
  try {
    // OPTIMIZED: Find and delete duplicates in one go
    const orderDuplicates = await Order.aggregate([
      {
        $group: {
          _id: '$serialNumber',
          count: { $sum: 1 },
          docs: { $push: '$_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    const orderIdsToRemove = [];
    for (const duplicate of orderDuplicates) {
      const [keep, ...remove] = duplicate.docs;
      orderIdsToRemove.push(...remove);
    }

    let orderDuplicatesRemoved = 0;
    if (orderIdsToRemove.length > 0) {
      const result = await Order.deleteMany({ _id: { $in: orderIdsToRemove } });
      orderDuplicatesRemoved = result.deletedCount;
    }

    const itemDuplicates = await OrderItem.aggregate([
      {
        $group: {
          _id: '$serialNumber',
          count: { $sum: 1 },
          docs: { $push: '$_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    const itemIdsToRemove = [];
    for (const duplicate of itemDuplicates) {
      const [keep, ...remove] = duplicate.docs;
      itemIdsToRemove.push(...remove);
    }

    let itemDuplicatesRemoved = 0;
    if (itemIdsToRemove.length > 0) {
      const result = await OrderItem.deleteMany({
        _id: { $in: itemIdsToRemove },
      });
      itemDuplicatesRemoved = result.deletedCount;
    }

    res.json({
      message: 'Duplicate serial numbers cleaned up successfully',
      orderDuplicatesRemoved,
      itemDuplicatesRemoved,
      totalDuplicatesFound: orderDuplicates.length + itemDuplicates.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderFactoryStats = async (req, res) => {
  try {
    const { id } = req.params;

    // OPTIMIZED: Use aggregation for statistics
    const stats = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: 'orderitems',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'items',
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
      { $unwind: '$factory' },
      {
        $project: {
          orderId: 1,
          factoryName: '$factory.name',
          totalItems: { $size: '$items' },
          completedItems: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $in: ['$$item.status', ['Completed', 'Dispatched']] },
              },
            },
          },
          dispatchedItems: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.status', 'Dispatched'] },
              },
            },
          },
          pendingItems: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $in: ['$$item.status', ['Pending', 'In Progress']] },
              },
            },
          },
        },
      },
      {
        $addFields: {
          completionPercentage: {
            $cond: {
              if: { $gt: ['$totalItems', 0] },
              then: {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$completedItems', '$totalItems'] },
                      100,
                    ],
                  },
                  0,
                ],
              },
              else: 0,
            },
          },
        },
      },
    ]);

    if (stats.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(stats[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderItems = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const orderItems = await OrderItem.find({ orderId: order.orderId })
      .populate('category')
      .populate('model')
      .populate('factory')
      .sort({ serialNumber: 1 });

    res.json(orderItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllOrderItems = async (req, res) => {
  try {
    const orderItems = await OrderItem.find({})
      .populate('category')
      .populate('model')
      .populate('factory')
      .sort({ serialNumber: 1 });

    res.json(orderItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const transferToProducts = async (req, res) => {
  try {
    const { orderItemIds } = req.body;

    if (!orderItemIds || !Array.isArray(orderItemIds)) {
      return res
        .status(400)
        .json({ message: 'orderItemIds must be provided as an array' });
    }

    const validIds = orderItemIds.every((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (!validIds) {
      return res.status(400).json({ message: 'Invalid order item ID(s)' });
    }

    const orderItems = await OrderItem.find({
      _id: { $in: orderItemIds },
      // FIX: Check for status 'Dispatched' instead of boolean
      status: 'Dispatched',
      isTransferredToProduct: { $ne: true },
    })
      .populate('factory')
      .populate('category')
      .populate('model');

    if (orderItems.length === 0) {
      return res.status(400).json({
        message:
          'No dispatched order items found for transfer or items already transferred',
      });
    }

    const convertedProducts = [];
    const errors = [];

    const latestProduct = await Product.findOne().sort({ productId: -1 });
    let lastNumber = 0;
    if (latestProduct && latestProduct.productId) {
      lastNumber = parseInt(latestProduct.productId.replace('PROD', ''));
    }

    for (const item of orderItems) {
      try {
        lastNumber++;
        const newProductId = `PROD${String(lastNumber).padStart(5, '0')}`;

        const productData = {
          productId: newProductId,
          productName: item.model.name,
          description: `Product from Order ${item.orderId}`,
          serialNumber: item.serialNumber,
          month: item.month,
          year: item.year,
          category: item.category,
          model: item.model,
          quantity: 1,
          orderType: item.orderType,
          unitsPerBox: item.unitsPerBox,
          factory: item.factory,
          orderId: item.orderId,
          boxNumber: item.boxNumber,
          unit: 'Piece',
          price: item.model.specifications?.mrpPrice || 0,
          minStockLevel: 10,
          status: 'Active',
        };

        const product = new Product(productData);
        const savedProduct = await product.save();
        convertedProducts.push(savedProduct);

        item.isTransferredToProduct = true;
        await item.save();
      } catch (error) {
        errors.push({ orderItemId: item._id, error: error.message });
      }
    }

    const orderIds = [...new Set(orderItems.map((item) => item.orderId))];
    for (const orderId of orderIds) {
      const allItems = await OrderItem.find({ orderId: orderId });
      const allTransferred = allItems.every(
        (item) => item.isTransferredToProduct
      );
      if (allTransferred) {
        await Order.findOneAndUpdate(
          { orderId: orderId },
          { isTransferredToProduct: true }
        );
      }
    }

    res.status(200).json({
      message: 'Order items processed',
      convertedProducts,
      errors,
      successCount: convertedProducts.length,
      errorCount: errors.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error converting order items to products',
      error: error.message,
    });
  }
};

export const checkDuplicates = async (req, res) => {
  try {
    const { serialNumbers } = req.body;
    if (!serialNumbers || !Array.isArray(serialNumbers)) {
      return res
        .status(400)
        .json({ message: 'serialNumbers array is required' });
    }
    const parsedSerials = serialNumbers
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (parsedSerials.length === 0) {
      return res.status(200).json({ duplicates: [] });
    }

    const regexSerials = parsedSerials.map((sn) => new RegExp(`^${sn}$`, 'i'));
    const [existingItems, existingProducts] = await Promise.all([
      OrderItem.find({ serialNumber: { $in: regexSerials } }),
      Product.find({ serialNumber: { $in: regexSerials } }),
    ]);

    const dupSerials = [
      ...existingItems.map((item) => item.serialNumber),
      ...existingProducts.map((p) => p.serialNumber),
    ];
    const uniqueDupSerials = [...new Set(dupSerials)];

    res.status(200).json({ duplicates: uniqueDupSerials });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
