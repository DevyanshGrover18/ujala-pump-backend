import mongoose from 'mongoose';
import Order, { OrderItem, FactoryCounter } from '../models/Order.js';
import Factory from '../models/Factory.js';

/**
 * Utility functions to clean up duplicate serial numbers and reset factory counters
 */

/**
 * Find and remove duplicate serial numbers in orders
 */
export const cleanupDuplicateSerialNumbers = async () => {
  try {
    console.log('Starting cleanup of duplicate serial numbers...');

    // Find duplicate serial numbers in Orders
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

    console.log(
      `Found ${orderDuplicates.length} duplicate serial numbers in Orders`
    );

    // Remove duplicates, keeping the first one
    for (const duplicate of orderDuplicates) {
      const [keep, ...remove] = duplicate.docs;
      if (remove.length > 0) {
        await Order.deleteMany({ _id: { $in: remove } });
        console.log(
          `Removed ${remove.length} duplicate orders with serial number: ${duplicate._id}`
        );
      }
    }

    // Find duplicate serial numbers in OrderItems
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

    console.log(
      `Found ${itemDuplicates.length} duplicate serial numbers in OrderItems`
    );

    // Remove duplicates, keeping the first one
    for (const duplicate of itemDuplicates) {
      const [keep, ...remove] = duplicate.docs;
      if (remove.length > 0) {
        await OrderItem.deleteMany({ _id: { $in: remove } });
        console.log(
          `Removed ${remove.length} duplicate order items with serial number: ${duplicate._id}`
        );
      }
    }

    console.log('Cleanup completed successfully');
    return {
      orderDuplicatesRemoved: orderDuplicates.reduce(
        (sum, dup) => sum + (dup.docs.length - 1),
        0
      ),
      itemDuplicatesRemoved: itemDuplicates.reduce(
        (sum, dup) => sum + (dup.docs.length - 1),
        0
      ),
    };
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
};

/**
 * Reset factory counters based on the highest existing serial number
 */
export const resetFactoryCounters = async () => {
  try {
    console.log('Resetting factory counters...');

    const factories = await Factory.find({});
    const resetResults = [];

    for (const factory of factories) {
      // Find all items for this factory and get the highest counter
      const factoryItems = await OrderItem.find({ factory: factory._id });

      let newCounter = 10000;

      if (factoryItems.length > 0) {
        // Extract all counter numbers and find the maximum
        const counters = factoryItems
          .map((item) => {
            const counterMatch = item.serialNumber.match(/(\d+)$/);
            return counterMatch ? parseInt(counterMatch[1]) : 0;
          })
          .filter((counter) => counter > 0);

        if (counters.length > 0) {
          newCounter = Math.max(...counters);
        }
      }

      // Update or create factory counter
      await FactoryCounter.findOneAndUpdate(
        { factoryId: factory._id },
        { counter: newCounter },
        { upsert: true }
      );

      resetResults.push({
        factoryId: factory._id,
        factoryName: factory.name,
        factoryCode: factory.code,
        resetTo: newCounter,
      });

      console.log(
        `Reset counter for factory ${factory.name} (${factory.code}) to ${newCounter}`
      );
    }

    console.log('Factory counters reset completed');
    return resetResults;
  } catch (error) {
    console.error('Error resetting factory counters:', error);
    throw error;
  }
};

/**
 * Complete cleanup and reset process
 */
export const performCompleteCleanup = async () => {
  try {
    console.log('Starting complete cleanup process...');

    // Step 1: Clean up duplicates
    const cleanupResult = await cleanupDuplicateSerialNumbers();
    console.log('Cleanup result:', cleanupResult);

    // Step 2: Reset factory counters
    const resetResult = await resetFactoryCounters();
    console.log('Reset result:', resetResult);

    return {
      cleanupResult,
      resetResult,
    };
  } catch (error) {
    console.error('Error during complete cleanup:', error);
    throw error;
  }
};
