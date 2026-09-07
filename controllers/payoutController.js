import PayoutSetting from '../models/PayoutSetting.js';
import PayoutRequest from '../models/PayoutRequest.js';
import Distributor from '../models/Distributor.js';
import Dealer from '../models/Dealer.js';
import SubDealer from '../models/SubDealer.js';
import Plumber from '../models/Plumber.js';

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

// POST /api/payouts/request - Seller / Plumber: Request a payout
export const requestPayout = async (req, res) => {
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
    } else {
      return res.status(403).json({ message: 'Unauthorized role for payout requests' });
    }

    const { amount, payoutMethod, bankDetails, upiId, notes, saveDetails } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ message: 'Please enter a valid payout amount' });
    }

    if (!payoutMethod || (payoutMethod !== 'Bank' && payoutMethod !== 'UPI')) {
      return res.status(400).json({ message: 'Please select a payout method (Bank or UPI)' });
    }

    if (payoutMethod === 'UPI' && (!upiId || !upiId.trim())) {
      return res.status(400).json({ message: 'UPI ID is required' });
    }

    if (payoutMethod === 'Bank') {
      if (!bankDetails?.accountNumber || !bankDetails?.ifscCode || !bankDetails?.accountHolderName) {
        return res.status(400).json({
          message: 'Account number, IFSC code, and account holder name are required for bank transfer',
        });
      }
    }

    const Model = getSellerModel(sellerType);
    let seller = await Model.findById(sellerId);
    if (!seller && req.user.id) {
      seller =
        (await Model.findOne({ user: req.user.id })) ||
        (await Model.findOne({ username: req.user.username }));
    }
    if (!seller) {
      return res.status(404).json({ message: `${sellerType} account not found` });
    }
    sellerId = seller._id;

    if (seller.eligibleForIncentive === false) {
      return res.status(403).json({ message: 'Your account is not eligible for cash incentive payouts' });
    }

    // Check minimum threshold
    const settings = await PayoutSetting.getSettings();
    let minThreshold = 0;
    if (sellerType === 'Distributor') minThreshold = settings.distributorMinPayout;
    else if (sellerType === 'Dealer') minThreshold = settings.dealerMinPayout;
    else if (sellerType === 'SubDealer') minThreshold = settings.subDealerMinPayout;
    else if (sellerType === 'Plumber') minThreshold = settings.plumberMinPayout;

    if (numAmount < minThreshold) {
      return res.status(400).json({
        message: `Minimum payout threshold for ${sellerType} is ₹${minThreshold.toLocaleString('en-IN')}`,
      });
    }

    // Check balance
    const currentBalance = Number(seller.walletIncentive || 0);
    if (numAmount > currentBalance) {
      return res.status(400).json({
        message: `Insufficient wallet balance. You have ₹${currentBalance.toLocaleString('en-IN')} available`,
      });
    }

    // Atomically deduct the requested amount to hold it
    const updatedSeller = await Model.findOneAndUpdate(
      { _id: sellerId, walletIncentive: { $gte: numAmount } },
      { $inc: { walletIncentive: -numAmount } },
      { new: true }
    );

    if (!updatedSeller) {
      return res.status(400).json({
        message: 'Could not hold balance. Please check your wallet balance and try again.',
      });
    }

    // Save details if requested (non-critical, don't let failure abort payout)
    if (saveDetails) {
      try {
        const savedData = {
          payoutMethod,
          bankDetails: payoutMethod === 'Bank' ? bankDetails : undefined,
          upiId: payoutMethod === 'UPI' ? upiId.trim() : undefined,
        };
        await Model.findByIdAndUpdate(sellerId, {
          $set: { savedPayoutDetails: savedData },
        });
      } catch (saveErr) {
        console.warn('requestPayout: Could not save payout details (non-critical):', saveErr.message);
      }
    }

    // Create payout request — if this fails, REFUND the deducted amount
    let savedRequest;
    try {
      const payoutReq = new PayoutRequest({
        requesterType: sellerType,
        requesterId: sellerId,
        requesterName: seller.name || req.user.username || sellerType,
        requesterPhone: seller.phone || seller.contactPhone || '',
        amount: numAmount,
        status: 'Pending',
        payoutMethod,
        bankDetails: payoutMethod === 'Bank' ? bankDetails : undefined,
        upiId: payoutMethod === 'UPI' ? upiId.trim() : '',
        notes: notes?.trim() || '',
      });
      savedRequest = await payoutReq.save();
    } catch (saveErr) {
      // Refund the deducted amount back to the seller
      console.error('requestPayout: Failed to save PayoutRequest, refunding amount:', saveErr.message);
      await Model.findByIdAndUpdate(sellerId, { $inc: { walletIncentive: numAmount } });
      return res.status(500).json({
        message: 'Failed to submit payout request. Your balance has been restored.',
      });
    }

    res.status(201).json({
      message: 'Payout request submitted successfully',
      payout: savedRequest,
      remainingWalletBalance: updatedSeller.walletIncentive,
    });
  } catch (err) {
    console.error('requestPayout error:', err);
    res.status(500).json({ message: err.message });
  }
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
    const { status, requesterType, search } = req.query;
    let query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (requesterType && requesterType !== 'All') {
      query.requesterType = requesterType;
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
      .populate('processedBy', 'username role')
      .sort({ requestedAt: -1 })
      .lean();

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

// DELETE /api/payouts - Admin: Delete multiple payout requests (refunds pending ones)
export const deleteMultiplePayouts = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No payout request IDs provided' });
    }

    const payouts = await PayoutRequest.find({ _id: { $in: ids } });
    let refundedCount = 0;

    // Refund held balance for pending requests before deletion
    for (const payout of payouts) {
      if (payout.status === 'Pending') {
        const Model = getSellerModel(payout.requesterType);
        if (Model) {
          await Model.findByIdAndUpdate(payout.requesterId, {
            $inc: { walletIncentive: payout.amount },
          });
          refundedCount += 1;
        }
      }
    }

    const result = await PayoutRequest.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} payout request(s) deleted successfully`,
      deletedCount: result.deletedCount,
      refundedCount,
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

    const Model = getSellerModel(payout.requesterType);

    if (action === 'reject') {
      if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({ message: 'Rejection reason is required' });
      }

      // Refund the held amount back to user's wallet
      if (Model) {
        await Model.findByIdAndUpdate(payout.requesterId, {
          $inc: { walletIncentive: payout.amount },
        });
      }

      payout.status = 'Rejected';
      payout.rejectionReason = rejectionReason.trim();
      payout.processedAt = new Date();
      payout.processedBy = req.user.id;
      await payout.save();

      return res.json({
        message: 'Payout request rejected and balance refunded to user wallet',
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
