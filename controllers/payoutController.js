import mongoose from 'mongoose';
import PayoutSetting from '../models/PayoutSetting.js';
import PayoutRequest from '../models/PayoutRequest.js';
import Distributor from '../models/Distributor.js';
import Dealer from '../models/Dealer.js';
import SubDealer from '../models/SubDealer.js';
import Plumber from '../models/Plumber.js';
import UserRole from '../models/UserRole.js';

// Helper to fetch seller/plumber document
const getSellerModel = (sellerType) => {
  if (sellerType === 'Distributor') return Distributor;
  if (sellerType === 'Dealer') return Dealer;
  if (sellerType === 'SubDealer') return SubDealer;
  if (sellerType === 'Plumber') return Plumber;
  return null;
};

// GET /api/payouts/thresholds - Get current minimum payout threshold for all roles
export const getThresholds = async (req, res) => {
  try {
    const settings = await PayoutSetting.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('getThresholds error:', err);
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/payouts/thresholds - Admin: Update payout thresholds
export const updateThresholds = async (req, res) => {
  try {
    const {
      distributorMinPayout,
      dealerMinPayout,
      subDealerMinPayout,
      plumberMinPayout,
    } = req.body;

    let settings = await PayoutSetting.getSettings();

    if (distributorMinPayout !== undefined)
      settings.distributorMinPayout = Math.max(0, Number(distributorMinPayout));
    if (dealerMinPayout !== undefined)
      settings.dealerMinPayout = Math.max(0, Number(dealerMinPayout));
    if (subDealerMinPayout !== undefined)
      settings.subDealerMinPayout = Math.max(0, Number(subDealerMinPayout));
    if (plumberMinPayout !== undefined)
      settings.plumberMinPayout = Math.max(0, Number(plumberMinPayout));

    await settings.save();
    res.json({ message: 'Payout thresholds updated successfully', settings });
  } catch (err) {
    console.error('updateThresholds error:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/payouts/request - Seller / Plumber: Request a payout (Disabled: auto-created on incentive approval)
export const requestPayout = async (req, res) => {
  return res.status(403).json({
    message:
      'Manual payout requests are disabled. Payouts are automatically created once incentives are approved.',
  });
};

// GET /api/payouts/my - Seller / Plumber: View their payout history
export const getMyPayouts = async (req, res) => {
  try {
    let sellerType, sellerId;
    if (req.user.distributor) {
      sellerType = 'Distributor';
      sellerId = req.user.distributor;
    } else if (req.user.dealer) {
      sellerType = 'Dealer';
      sellerId = req.user.dealer;
    } else if (req.user.subDealer) {
      sellerType = 'SubDealer';
      sellerId = req.user.subDealer;
    } else if (req.user.plumber) {
      sellerType = 'Plumber';
      sellerId = req.user.plumber;
    } else return res.status(403).json({ message: 'Unauthorized' });

    const Model = getSellerModel(sellerType);
    let seller = await Model.findById(sellerId);
    if (!seller && req.user.id) {
      seller =
        (await Model.findOne({ user: req.user.id })) ||
        (await Model.findOne({ username: req.user.username }));
    }
    const finalSellerId = seller ? seller._id : sellerId;

    const payouts = await PayoutRequest.find({ requesterId: finalSellerId })
      .sort({ requestedAt: -1 })
      .lean();

    res.json({
      payouts,
      savedPayoutDetails: seller?.savedPayoutDetails || null,
    });
  } catch (err) {
    console.error('getMyPayouts error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/payouts - Admin: View all payout requests with metrics and filters
export const getAllPayouts = async (req, res) => {
  try {
    const { status, requesterType, search, startDate, endDate } = req.query;
    let query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (requesterType && requesterType !== 'All') {
      query.requesterType = requesterType;
    }

    if (startDate || endDate) {
      query.requestedAt = {};
      if (startDate) query.requestedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.requestedAt.$lte = end;
      }
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { requesterName: { $regex: term, $options: 'i' } },
        { requesterPhone: { $regex: term, $options: 'i' } },
        { referenceId: { $regex: term, $options: 'i' } },
        { upiId: { $regex: term, $options: 'i' } },
        { 'bankDetails.accountNumber': { $regex: term, $options: 'i' } },
      ];
    }

    const allPayouts = await PayoutRequest.find(query)
      .populate({
        path: 'processedBy',
        select: 'username role accountsMember',
        populate: { path: 'accountsMember', select: 'name accountsId' },
      })
      .sort({ requestedAt: -1 })
      .lean();

    const unresolvedIds = allPayouts
      .filter((p) => p.processedBy && mongoose.Types.ObjectId.isValid(p.processedBy) && !p.processedBy.username)
      .map((p) => p.processedBy);

    if (unresolvedIds.length > 0) {
      const userRoles = await UserRole.find({ _id: { $in: unresolvedIds } }).select('name username').lean();
      const userRoleMap = new Map();
      userRoles.forEach((ur) => userRoleMap.set(String(ur._id), ur));
      for (const p of allPayouts) {
        if (p.processedBy && !p.processedBy.username && userRoleMap.has(String(p.processedBy))) {
          p.processedBy = { ...userRoleMap.get(String(p.processedBy)), role: 'staff' };
        }
      }
    }

    // Summary metrics across all records in DB
    const allRecords = await PayoutRequest.find().lean();
    const stats = {
      totalCount: allRecords.length,
      totalRequestedAmount: allRecords.reduce((sum, r) => sum + (r.amount || 0), 0),
      pendingCount: allRecords.filter((r) => r.status === 'Pending').length,
      pendingAmount: allRecords
        .filter((r) => r.status === 'Pending')
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      approvedCount: allRecords.filter((r) => r.status === 'Approved').length,
      approvedAmount: allRecords
        .filter((r) => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      rejectedCount: allRecords.filter((r) => r.status === 'Rejected').length,
    };

    const thresholds = await PayoutSetting.getSettings();

    res.json({
      payouts: allPayouts,
      stats,
      thresholds,
    });
  } catch (err) {
    console.error('getAllPayouts error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/payouts/pending-count - Admin & Accounts: Get count of pending payout requests
export const getPendingPayoutsCount = async (req, res) => {
  try {
    const count = await PayoutRequest.countDocuments({ status: 'Pending' });
    res.json({ count });
  } catch (err) {
    console.error('getPendingPayoutsCount error:', err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/payouts - Admin: Delete multiple payout requests
export const deleteMultiplePayouts = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No payout request IDs provided' });
    }

    const result = await PayoutRequest.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} payout request(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error('deleteMultiplePayouts error:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/payouts/:id/process - Admin: Approve or Reject a payout request
export const processPayout = async (req, res) => {
  try {
    const { action, rejectionReason, paymentMethod, referenceId, paymentProofImage } = req.body;
    const payout = await PayoutRequest.findById(req.params.id);

    if (!payout) {
      return res.status(404).json({ message: 'Payout request not found' });
    }

    if (payout.status !== 'Pending') {
      return res.status(400).json({
        message: `This payout request has already been ${payout.status.toLowerCase()}`,
      });
    }

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ message: 'Invalid action. Must be approve or reject' });
    }

    if (action === 'reject') {
      if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({ message: 'Rejection reason is required' });
      }

      payout.status = 'Rejected';
      payout.rejectionReason = rejectionReason.trim();
      payout.processedAt = new Date();
      payout.processedBy = req.user.id;
      await payout.save();

      return res.json({
        message: 'Payout request rejected',
        payout,
      });
    }

    if (action === 'approve') {
      if (!paymentMethod) {
        return res.status(400).json({ message: 'Payment method is required' });
      }

      if (!paymentProofImage) {
        return res.status(400).json({ message: 'Payment proof image is required' });
      }

      payout.status = 'Approved';
      payout.paymentMethod = paymentMethod;
      payout.referenceId = referenceId?.trim() || '';
      payout.paymentProofImage = paymentProofImage;
      payout.processedAt = new Date();
      payout.processedBy = req.user.id;
      await payout.save();

      return res.json({
        message: 'Payout request approved and marked as paid',
        payout,
      });
    }
  } catch (err) {
    console.error('processPayout error:', err);
    res.status(500).json({ message: err.message });
  }
};
