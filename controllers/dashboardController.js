import Factory from '../models/Factory.js';
import Order, { OrderItem } from '../models/Order.js';
import UserRole from '../models/UserRole.js';
import Product from '../models/Product.js';
import Dealer from '../models/Dealer.js';
import Distributor from '../models/Distributor.js';
import SubDealer from '../models/SubDealer.js';
import Plumber from '../models/Plumber.js';
import Model from '../models/Model.js';
import Sale from '../models/Sale.js';
import Executive from '../models/Executive.js';
import ProductReplacement from '../models/ProductReplacement.js';
import IncentiveClaim from '../models/IncentiveClaim.js';
import PayoutRequest from '../models/PayoutRequest.js';

// Helper to get date boundaries
const getDateFilter = (period) => {
  const now = new Date();
  let start = new Date();

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { $gte: start, $lte: now };
    case 'week':
    case '7days':
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { $gte: start, $lte: now };
    case '30days':
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { $gte: start, $lte: now };
    case 'month':
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: start, $lte: now };
    case 'lastMonth': {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { $gte: firstDayLastMonth, $lte: lastDayLastMonth };
    }
    case '3months':
      start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { $gte: start, $lte: now };
    case '6months':
      start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return { $gte: start, $lte: now };
    case 'year':
    case 'thisYear':
      start = new Date(now.getFullYear(), 0, 1);
      return { $gte: start, $lte: now };
    case 'all':
    default:
      return null;
  }
};

/**
 * 1. Progress Overview & Business KPIs
 */
export const getDashboardOverview = async (req, res) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // 1. Entity Counts & New this month
    const [
      factoryCount,
      factoriesThisMonth,
      modelCount,
      modelsThisMonth,
      distributorCount,
      distributorsThisMonth,
      dealerCount,
      dealersThisMonth,
      orderCount,
      ordersThisMonth,
      productCount,
      productsThisMonth,
    ] = await Promise.all([
      Factory.countDocuments(),
      Factory.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      Model.countDocuments(),
      Model.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      Distributor.countDocuments(),
      Distributor.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      Dealer.countDocuments(),
      Dealer.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      Product.countDocuments(),
      Product.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
    ]);

    // 2. Business KPIs: Revenue & Units Sold (This month vs Last month)
    const [salesThisMonth, salesLastMonth] = await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: startOfThisMonth, $lte: now } } },
        {
          $lookup: {
            from: 'products',
            localField: 'product',
            foreignField: '_id',
            as: 'productDoc',
          },
        },
        { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'models',
            localField: 'productDoc.model',
            foreignField: '_id',
            as: 'modelDoc',
          },
        },
        { $unwind: { path: '$modelDoc', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            units: { $sum: 1 },
            revenue: {
              $sum: {
                $ifNull: ['$productDoc.price', { $ifNull: ['$modelDoc.specifications.mrpPrice', 0] }],
              },
            },
          },
        },
      ]),
      Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: 'product',
            foreignField: '_id',
            as: 'productDoc',
          },
        },
        { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'models',
            localField: 'productDoc.model',
            foreignField: '_id',
            as: 'modelDoc',
          },
        },
        { $unwind: { path: '$modelDoc', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            units: { $sum: 1 },
            revenue: {
              $sum: {
                $ifNull: ['$productDoc.price', { $ifNull: ['$modelDoc.specifications.mrpPrice', 0] }],
              },
            },
          },
        },
      ]),
    ]);

    const revenueThisMonth = salesThisMonth[0]?.revenue || 0;
    const unitsThisMonth = salesThisMonth[0]?.units || 0;
    const revenueLastMonth = salesLastMonth[0]?.revenue || 0;
    const unitsLastMonth = salesLastMonth[0]?.units || 0;

    const revenueGrowth =
      revenueLastMonth > 0
        ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
        : revenueThisMonth > 0
          ? 100
          : 0;

    const unitsGrowth =
      unitsLastMonth > 0
        ? ((unitsThisMonth - unitsLastMonth) / unitsLastMonth) * 100
        : unitsThisMonth > 0
          ? 100
          : 0;

    // 3. Units in Inventory
    const [unitsInInventory, inventoryThisMonthCount] = await Promise.all([
      Product.countDocuments({ sold: { $ne: true } }),
      Product.countDocuments({ sold: { $ne: true }, createdAt: { $gte: startOfThisMonth } }),
    ]);

    const inventoryGrowth =
      productCount > 0 ? (inventoryThisMonthCount / productCount) * 100 : 0;

    // 4. Pending Approvals count (Replacements + Incentives + Payouts)
    const [pendingReplacements, pendingIncentives, pendingPayouts] =
      await Promise.all([
        ProductReplacement.countDocuments({ status: 'Pending' }),
        IncentiveClaim.countDocuments({ status: 'Approval Pending' }),
        PayoutRequest.countDocuments({ status: 'Pending' }),
      ]);

    const totalPendingApprovals =
      pendingReplacements + pendingIncentives + pendingPayouts;

    res.json({
      progressOverview: {
        factories: { total: factoryCount, changeThisMonth: factoriesThisMonth },
        models: { total: modelCount, changeThisMonth: modelsThisMonth },
        distributors: { total: distributorCount, changeThisMonth: distributorsThisMonth },
        dealers: { total: dealerCount, changeThisMonth: dealersThisMonth },
        orders: { total: orderCount, changeThisMonth: ordersThisMonth },
        products: { total: productCount, changeThisMonth: productsThisMonth },
      },
      businessKPIs: {
        totalRevenue: {
          value: revenueThisMonth,
          growthPercent: Number(revenueGrowth.toFixed(1)),
          previousPeriodValue: revenueLastMonth,
        },
        unitsSold: {
          value: unitsThisMonth,
          growthPercent: Number(unitsGrowth.toFixed(1)),
          previousPeriodValue: unitsLastMonth,
        },
        inventory: {
          value: unitsInInventory,
          growthPercent: Number(inventoryGrowth.toFixed(1)),
        },
        pendingApprovals: {
          value: totalPendingApprovals,
          breakdown: {
            replacements: pendingReplacements,
            incentives: pendingIncentives,
            payouts: pendingPayouts,
          },
        },
      },
    });
  } catch (error) {
    console.error('Error in getDashboardOverview:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 2. Order Items Status Chart
 */
export const getOrderItemStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    let query = {};

    if (req.user && req.user.role === 'member') {
      const userRole = await UserRole.findById(req.user.id);
      const assignedFactories = userRole?.assignedFactories || [];
      query = { factory: { $in: assignedFactories } };
    } else if (req.user && req.user.role === 'factory') {
      query = { factory: req.user.factory };
    }

    const dateFilter = getDateFilter(period);
    if (dateFilter) {
      query.createdAt = dateFilter;
    }

    const [pendingItems, completedItems, dispatchedItems] = await Promise.all([
      OrderItem.countDocuments({ ...query, status: 'Pending' }),
      OrderItem.countDocuments({ ...query, status: 'Completed' }),
      OrderItem.countDocuments({ ...query, status: 'Dispatched' }),
    ]);

    const total = pendingItems + completedItems + dispatchedItems;

    res.json({
      total,
      pending: pendingItems,
      completed: completedItems,
      dispatched: dispatchedItems,
    });
  } catch (error) {
    console.error('Error in getOrderItemStats:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 3. Sales Trend (Units Sold & Revenue)
 */
export const getSalesTrend = async (req, res) => {
  try {
    const { period = '6months' } = req.query;
    const now = new Date();
    let dateFilter = {};
    let isDaily = false;

    if (period === '7days') {
      const start = new Date();
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      dateFilter = { $gte: start, $lte: now };
      isDaily = true;
    } else if (period === '30days') {
      const start = new Date();
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      dateFilter = { $gte: start, $lte: now };
      isDaily = true;
    } else if (period === '3months') {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      dateFilter = { $gte: start, $lte: now };
    } else if (period === 'year' || period === 'thisYear') {
      const start = new Date(now.getFullYear(), 0, 1);
      dateFilter = { $gte: start, $lte: now };
    } else {
      // Default: 6months
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      dateFilter = { $gte: start, $lte: now };
    }

    const aggregationPipeline = [
      { $match: { createdAt: dateFilter } },
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productDoc',
        },
      },
      { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'models',
          localField: 'productDoc.model',
          foreignField: '_id',
          as: 'modelDoc',
        },
      },
      { $unwind: { path: '$modelDoc', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: isDaily
            ? {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' },
              }
            : {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
              },
          unitsSold: { $sum: 1 },
          revenue: {
            $sum: {
              $ifNull: ['$productDoc.price', { $ifNull: ['$modelDoc.specifications.mrpPrice', 0] }],
            },
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ];

    const results = await Sale.aggregate(aggregationPipeline);

    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const formattedData = results.map((item) => {
      let label = '';
      if (isDaily) {
        label = `${item._id.day} ${monthNames[item._id.month - 1]}`;
      } else {
        label = `${monthNames[item._id.month - 1]}`;
      }
      return {
        label,
        unitsSold: item.unitsSold || 0,
        revenue: item.revenue || 0,
        revenueLakhs: Number(((item.revenue || 0) / 100000).toFixed(2)),
      };
    });

    res.json(formattedData);
  } catch (error) {
    console.error('Error in getSalesTrend:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 4. Top Selling Models
 */
export const getTopSellingModels = async (req, res) => {
  try {
    const { period = 'thisMonth', sortBy = 'units' } = req.query;
    const dateFilter = getDateFilter(period);

    const matchQuery = dateFilter ? { createdAt: dateFilter } : {};

    const topModels = await Sale.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productDoc',
        },
      },
      { $unwind: '$productDoc' },
      {
        $lookup: {
          from: 'models',
          localField: 'productDoc.model',
          foreignField: '_id',
          as: 'modelDoc',
        },
      },
      { $unwind: '$modelDoc' },
      {
        $group: {
          _id: '$modelDoc._id',
          modelName: { $first: '$modelDoc.name' },
          modelCode: { $first: '$modelDoc.code' },
          unitsSold: { $sum: 1 },
          revenue: {
            $sum: {
              $ifNull: ['$productDoc.price', { $ifNull: ['$modelDoc.specifications.mrpPrice', 0] }],
            },
          },
        },
      },
      {
        $sort: sortBy === 'revenue' ? { revenue: -1 } : { unitsSold: -1 },
      },
      { $limit: 10 },
    ]);

    const formatted = topModels.map((item, idx) => ({
      rank: idx + 1,
      modelId: item._id,
      modelName: item.modelName || item.modelCode || 'Unknown Model',
      modelCode: item.modelCode || '',
      unitsSold: item.unitsSold,
      revenue: item.revenue,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error in getTopSellingModels:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 5. Recent Orders
 */
export const getRecentOrders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const orders = await Order.find()
      .populate('factory', 'name')
      .populate('model', 'name code')
      .sort({ createdAt: -1 })
      .limit(limit);

    const formatted = orders.map((o) => ({
      _id: o._id,
      orderId: o.orderId,
      factoryName: o.factory?.name || 'N/A',
      modelName: o.model?.name || o.model?.code || 'N/A',
      quantity: o.quantity,
      status: o.status,
      date: o.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error in getRecentOrders:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 6. Low Stock Alerts
 */
export const getLowStockAlerts = async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 10;

    // Group unsold active products by model
    const stockAggregation = await Product.aggregate([
      { $match: { sold: { $ne: true }, status: 'Active' } },
      {
        $group: {
          _id: '$model',
          currentStock: { $sum: 1 },
          minStockLevel: { $first: '$minStockLevel' },
        },
      },
    ]);

    const stockMap = new Map();
    stockAggregation.forEach((item) => {
      if (item._id) {
        stockMap.set(item._id.toString(), {
          currentStock: item.currentStock,
          minStockLevel: item.minStockLevel || threshold,
        });
      }
    });

    const models = await Model.find({ status: 'Active' }).select('name code');

    const lowStockItems = [];

    models.forEach((m) => {
      const stockInfo = stockMap.get(m._id.toString()) || {
        currentStock: 0,
        minStockLevel: threshold,
      };

      const itemThreshold = stockInfo.minStockLevel || threshold;
      if (stockInfo.currentStock <= itemThreshold) {
        lowStockItems.push({
          modelId: m._id,
          modelName: m.name,
          modelCode: m.code,
          currentStock: stockInfo.currentStock,
          threshold: itemThreshold,
          isCritical: stockInfo.currentStock <= Math.floor(itemThreshold / 2),
        });
      }
    });

    lowStockItems.sort((a, b) => a.currentStock - b.currentStock);

    res.json(lowStockItems.slice(0, 10));
  } catch (error) {
    console.error('Error in getLowStockAlerts:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 7. Recent Activity Timeline
 */
export const getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const [
      recentReplacements,
      recentClaims,
      recentDealers,
      recentDistributors,
      recentPayouts,
      recentDispatches,
    ] = await Promise.all([
      ProductReplacement.find()
        .populate('requestedBy', 'name')
        .sort({ createdAt: -1 })
        .limit(3),
      IncentiveClaim.find().sort({ createdAt: -1 }).limit(3),
      Dealer.find().sort({ createdAt: -1 }).limit(2),
      Distributor.find().sort({ createdAt: -1 }).limit(2),
      PayoutRequest.find().sort({ createdAt: -1 }).limit(2),
      Order.find({ status: 'Dispatched' })
        .populate('factory', 'name')
        .sort({ updatedAt: -1 })
        .limit(2),
    ]);

    const activities = [];

    recentReplacements.forEach((r) => {
      activities.push({
        id: `rep-${r._id}`,
        type: 'replacement',
        title: 'New replacement request',
        description: `${r.oldSerialNumber || 'Unit'} from ${r.requesterModel} (${r.status})`,
        timestamp: r.createdAt,
      });
    });

    recentClaims.forEach((c) => {
      activities.push({
        id: `claim-${c._id}`,
        type: 'claim',
        title: 'Incentive claim submitted',
        description: `${c.sellerName} (₹${c.incentiveAmount}) - ${c.status}`,
        timestamp: c.createdAt,
      });
    });

    recentDealers.forEach((d) => {
      activities.push({
        id: `dealer-${d._id}`,
        type: 'dealer',
        title: 'New dealer registered',
        description: `${d.name} (${d.district || d.state || 'Active'})`,
        timestamp: d.createdAt,
      });
    });

    recentDistributors.forEach((dist) => {
      activities.push({
        id: `dist-${dist._id}`,
        type: 'distributor',
        title: 'New distributor registered',
        description: `${dist.name} (${dist.state || 'Active'})`,
        timestamp: dist.createdAt,
      });
    });

    recentPayouts.forEach((p) => {
      activities.push({
        id: `payout-${p._id}`,
        type: 'payout',
        title: p.status === 'Approved' ? 'Payout processed' : 'Payout requested',
        description: `₹${p.amount?.toLocaleString('en-IN')} to ${p.requesterName}`,
        timestamp: p.createdAt,
      });
    });

    recentDispatches.forEach((ord) => {
      activities.push({
        id: `disp-${ord._id}`,
        type: 'order',
        title: 'Order dispatched',
        description: `${ord.orderId} - ${ord.factory?.name || 'Factory'}`,
        timestamp: ord.updatedAt || ord.createdAt,
      });
    });

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(activities.slice(0, limit));
  } catch (error) {
    console.error('Error in getRecentActivity:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 8. User / Partner Summary
 */
export const getPartnerSummary = async (req, res) => {
  try {
    const [
      executivesCount,
      distributorsCount,
      dealersCount,
      subDealersCount,
      plumbersCount,
      staffCount,
    ] = await Promise.all([
      Executive.countDocuments(),
      Distributor.countDocuments(),
      Dealer.countDocuments(),
      SubDealer.countDocuments(),
      Plumber.countDocuments(),
      UserRole.countDocuments(),
    ]);

    res.json({
      executives: executivesCount,
      distributors: distributorsCount,
      dealers: dealersCount,
      subDealers: subDealersCount,
      plumbers: plumbersCount,
      staff: staffCount,
    });
  } catch (error) {
    console.error('Error in getPartnerSummary:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 9. Pending Actions Center
 */
export const getPendingActions = async (req, res) => {
  try {
    const [
      pendingReplacements,
      pendingIncentives,
      pendingPayouts,
      stockAggregation,
      models,
    ] = await Promise.all([
      ProductReplacement.countDocuments({ status: 'Pending' }),
      IncentiveClaim.countDocuments({ status: 'Approval Pending' }),
      PayoutRequest.countDocuments({ status: 'Pending' }),
      Product.aggregate([
        { $match: { sold: { $ne: true }, status: 'Active' } },
        { $group: { _id: '$model', count: { $sum: 1 } } },
      ]),
      Model.find({ status: 'Active' }).select('_id'),
    ]);

    const stockMap = new Map();
    stockAggregation.forEach((item) => {
      if (item._id) stockMap.set(item._id.toString(), item.count);
    });

    let lowStockCount = 0;
    models.forEach((m) => {
      const stock = stockMap.get(m._id.toString()) || 0;
      if (stock <= 10) lowStockCount++;
    });

    res.json({
      replacementRequests: pendingReplacements,
      incentiveApprovals: pendingIncentives,
      payoutsToProcess: pendingPayouts,
      lowStockItems: lowStockCount,
    });
  } catch (error) {
    console.error('Error in getPendingActions:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Legacy support for existing endpoints
 */
export const getOrderStats = async (req, res) => {
  try {
    const [totalOrders, pendingOrders, completedOrders, dispatchedOrders] =
      await Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ status: 'Pending' }),
        Order.countDocuments({ status: 'Completed' }),
        Order.countDocuments({ status: 'Dispatched' }),
      ]);

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

export const getDashboardStats = async (req, res) => {
  try {
    const [factoryCount, orderCount, dealerCount, distributorCount, modelCount] =
      await Promise.all([
        Factory.countDocuments(),
        Order.countDocuments(),
        Dealer.countDocuments(),
        Distributor.countDocuments(),
        Model.countDocuments(),
      ]);

    res.json({
      factories: factoryCount,
      orders: orderCount,
      dealers: dealerCount,
      distributors: distributorCount,
      models: modelCount,
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
          total: { $sum: 1 },
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
    const execId = req.user.executive;
    let exec = execId ? await Executive.findById(execId) : null;
    if (!exec && req.user.id) {
      exec =
        (await Executive.findOne({ user: req.user.id })) ||
        (await Executive.findOne({ username: req.user.username }));
    }
    if (!exec) {
      return res.status(404).json({ message: 'Executive profile not found' });
    }

    const totalDistributors = exec.distributors?.length || 0;
    const totalDealers = exec.dealers?.length || 0;
    const totalSubDealers = exec.subDealers?.length || 0;

    const totalCustomers = await Sale.countDocuments({
      distributor: { $in: exec.distributors || [] },
      customerName: { $exists: true, $ne: '' },
    });

    res.json({
      counts: {
        distributors: totalDistributors,
        dealers: totalDealers,
        subDealers: totalSubDealers,
        customers: totalCustomers,
        sales: totalCustomers,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
