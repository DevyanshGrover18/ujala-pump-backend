import IncentiveClaim from '../models/IncentiveClaim.js';
import Distributor from '../models/Distributor.js';
import Dealer from '../models/Dealer.js';
import SubDealer from '../models/SubDealer.js';
import Plumber from '../models/Plumber.js';
import Sale from '../models/Sale.js';

const getSellerInfo = async (sellerType, sellerId, userId, username) => {
  let model;
  let fields =
    'name contactPerson contactPhone email walletIncentive walletPoints eligibleForIncentive eligibleForPoints savedPayoutDetails';
  if (sellerType === 'Distributor') {
    model = Distributor;
    fields = 'distributorId ' + fields;
  } else if (sellerType === 'Dealer') {
    model = Dealer;
    fields = 'dealerId ' + fields;
  } else if (sellerType === 'SubDealer') {
    model = SubDealer;
    fields = 'subDealerId ' + fields;
  } else if (sellerType === 'Plumber') {
    model = Plumber;
    fields = 'name plumberId phone username walletIncentive walletPoints eligibleForIncentive savedPayoutDetails';
  } else {
    return null;
  }

  let seller = sellerId ? await model.findById(sellerId).select(fields).lean() : null;
  if (!seller && userId) {
    seller = (await model.findOne({ user: userId }).select(fields).lean()) ||
      (username ? await model.findOne({ username }).select(fields).lean() : null);
  }
  return seller;
};

// GET /api/incentives - Admin: all claims grouped by saleGroupId
export const getAllClaims = async (req, res) => {
  try {
    const claims = await IncentiveClaim.find()
      .populate('product', 'serialNumber')
      .populate('model', 'name code incentive points')
      .sort({ claimDate: -1 })
      .lean();

    // Group by saleGroupId where present; ungrouped items get their own entry
    const groupMap = new Map();
    const ungrouped = [];

    for (const c of claims) {
      if (c.saleGroupId) {
        if (!groupMap.has(c.saleGroupId)) {
          groupMap.set(c.saleGroupId, {
            _id: c._id, // use first claim id as representative
            saleGroupId: c.saleGroupId,
            sellerType: c.sellerType,
            sellerId: c.sellerId,
            sellerName: c.sellerName,
            claimDate: c.claimDate,
            status: c.status, // all in group share status when approved/rejected
            rejectionReason: c.rejectionReason,
            previousRejectionReason: c.previousRejectionReason,
            reapplyNotes: c.reapplyNotes,
            reappliedAt: c.reappliedAt,
            reapplyCount: c.reapplyCount || 0,
            items: [],
            totalIncentive: 0,
            totalPoints: 0,
          });
        }
        const grp = groupMap.get(c.saleGroupId);
        grp.items.push(c);
        grp.totalIncentive += c.incentiveAmount || 0;
        grp.totalPoints += c.points || 0;
        // If any item is pending, group is pending
        if (c.status === 'Approval Pending') grp.status = 'Approval Pending';
        if (c.reapplyNotes) grp.reapplyNotes = c.reapplyNotes;
        if (c.reappliedAt) grp.reappliedAt = c.reappliedAt;
      } else {
        ungrouped.push({
          _id: c._id,
          saleGroupId: null,
          sellerType: c.sellerType,
          sellerId: c.sellerId,
          sellerName: c.sellerName,
          claimDate: c.claimDate,
          status: c.status,
          rejectionReason: c.rejectionReason,
          previousRejectionReason: c.previousRejectionReason,
          reapplyNotes: c.reapplyNotes,
          reappliedAt: c.reappliedAt,
          reapplyCount: c.reapplyCount || 0,
          items: [c],
          totalIncentive: c.incentiveAmount || 0,
          totalPoints: c.points || 0,
        });
      }
    }

    const grouped = [...groupMap.values(), ...ungrouped].sort(
      (a, b) => new Date(b.claimDate) - new Date(a.claimDate)
    );

    res.json(grouped);
  } catch (err) {
    console.error('getAllClaims error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/incentives/:id - Single claim detail
export const getClaimById = async (req, res) => {
  try {
    const claim = await IncentiveClaim.findById(req.params.id)
      .populate('sale')
      .populate('product', 'serialNumber')
      .populate('model', 'name code incentive points')
      .populate({
        path: 'installation',
        populate: {
          path: 'plumber',
          select: 'name plumberId phone username',
        }
      })
      .lean();

    if (!claim) return res.status(404).json({ message: 'Claim not found' });

    // Fallback: If sale is empty (e.g. Plumber claim), query the Sale model for product's sale details
    if (!claim.sale && claim.product) {
      claim.sale = await Sale.findOne({ product: claim.product._id || claim.product }).lean();
    }

    // If grouped, fetch all claims with same saleGroupId
    let groupClaims = [claim];
    if (claim.saleGroupId) {
      groupClaims = await IncentiveClaim.find({
        saleGroupId: claim.saleGroupId,
      })
        .populate('sale')
        .populate('product', 'serialNumber')
        .populate('model', 'name code')
        .populate({
          path: 'installation',
          populate: {
            path: 'plumber',
            select: 'name plumberId phone username',
          }
        })
        .lean();

      // Populate fallback sale details for any items in group claims
      for (const gc of groupClaims) {
        if (!gc.sale && gc.product) {
          gc.sale = await Sale.findOne({ product: gc.product._id || gc.product }).lean();
        }
      }
    }

    const seller = await getSellerInfo(claim.sellerType, claim.sellerId);

    res.json({ ...claim, groupClaims, seller });
  } catch (err) {
    console.error('getClaimById error:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/incentives/:id/verify - Admin approve/reject/incomplete
// Acts on all claims in the same saleGroupId
export const verifyClaim = async (req, res) => {
  try {
    const { action, rejectionReason } = req.body;
    const claim = await IncentiveClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });

    if (
      action !== 'approve' &&
      action !== 'reject' &&
      action !== 'incomplete'
    ) {
      return res.status(400).json({ message: 'Invalid action' });
    }
    if (action === 'reject' && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    // Get all claims in the same group
    const allClaims = claim.saleGroupId
      ? await IncentiveClaim.find({ saleGroupId: claim.saleGroupId })
      : [claim];

    for (const c of allClaims) {
      if (c.status === 'Approved') continue; // skip already approved

      if (action === 'approve') {
        c.status = 'Approved';
        const incUpdate = {
          $inc: { walletIncentive: c.incentiveAmount, walletPoints: c.points },
        };
        if (c.sellerType === 'Distributor')
          await Distributor.findByIdAndUpdate(c.sellerId, incUpdate);
        else if (c.sellerType === 'Dealer')
          await Dealer.findByIdAndUpdate(c.sellerId, incUpdate);
        else if (c.sellerType === 'SubDealer')
          await SubDealer.findByIdAndUpdate(c.sellerId, incUpdate);
        else if (c.sellerType === 'Plumber')
          await Plumber.findByIdAndUpdate(c.sellerId, incUpdate);
      } else if (action === 'reject') {
        c.status = 'Rejected';
        c.rejectionReason = rejectionReason.trim();
      } else {
        c.status = 'Incomplete';
      }
      await c.save();
    }

    res.json({ message: `Claim ${action}d successfully` });
  } catch (err) {
    console.error('verifyClaim error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/incentives/my/claims - Seller: their own claims
export const getMyClaims = async (req, res) => {
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

    // Fetch seller eligibility and wallet info
    const seller = await getSellerInfo(
      sellerType,
      sellerId,
      req.user.id,
      req.user.username
    );
    const finalSellerId = seller ? seller._id : sellerId;
    const eligibleForIncentive = seller?.eligibleForIncentive !== false;
    const eligibleForPoints =
      sellerType !== 'Plumber' && seller?.eligibleForPoints !== false;

    const rawClaims = await IncentiveClaim.find({ sellerId: finalSellerId })
      .populate('product', 'serialNumber productName')
      .populate('model', 'name code')
      .sort({ claimDate: -1 })
      .lean();

    // Sanitize claim data according to eligibility
    const claims = rawClaims.map((c) => ({
      ...c,
      incentiveAmount: eligibleForIncentive ? (c.incentiveAmount || 0) : null,
      points: eligibleForPoints ? (c.points || 0) : null,
    }));

    // Group by saleGroupId
    const groupMap = new Map();
    const ungrouped = [];
    for (const c of claims) {
      if (c.saleGroupId) {
        if (!groupMap.has(c.saleGroupId)) {
          groupMap.set(c.saleGroupId, {
            _id: c._id,
            saleGroupId: c.saleGroupId,
            claimDate: c.claimDate,
            status: c.status,
            rejectionReason: c.rejectionReason,
            previousRejectionReason: c.previousRejectionReason,
            reapplyNotes: c.reapplyNotes,
            reappliedAt: c.reappliedAt,
            reapplyCount: c.reapplyCount || 0,
            items: [],
            totalIncentive: eligibleForIncentive ? 0 : null,
            totalPoints: eligibleForPoints ? 0 : null,
          });
        }
        const grp = groupMap.get(c.saleGroupId);
        grp.items.push(c);
        if (eligibleForIncentive) grp.totalIncentive += c.incentiveAmount || 0;
        if (eligibleForPoints) grp.totalPoints += c.points || 0;
        if (c.status === 'Approval Pending') grp.status = 'Approval Pending';
        if (c.reapplyNotes) grp.reapplyNotes = c.reapplyNotes;
        if (c.reappliedAt) grp.reappliedAt = c.reappliedAt;
      } else {
        ungrouped.push({
          _id: c._id,
          saleGroupId: null,
          claimDate: c.claimDate,
          status: c.status,
          rejectionReason: c.rejectionReason,
          previousRejectionReason: c.previousRejectionReason,
          reapplyNotes: c.reapplyNotes,
          reappliedAt: c.reappliedAt,
          reapplyCount: c.reapplyCount || 0,
          items: [c],
          totalIncentive: eligibleForIncentive ? (c.incentiveAmount || 0) : null,
          totalPoints: eligibleForPoints ? (c.points || 0) : null,
        });
      }
    }

    const grouped = [...groupMap.values(), ...ungrouped].sort(
      (a, b) => new Date(b.claimDate) - new Date(a.claimDate)
    );

    // Calculate pending statistics
    let pendingIncentive = 0;
    let pendingPoints = 0;
    for (const g of grouped) {
      if (g.status === 'Approval Pending') {
        if (eligibleForIncentive && typeof g.totalIncentive === 'number') {
          pendingIncentive += g.totalIncentive;
        }
        if (eligibleForPoints && typeof g.totalPoints === 'number') {
          pendingPoints += g.totalPoints;
        }
      }
    }

    res.json({
      sellerType,
      sellerName: seller?.name || '',
      claims: grouped,
      wallet: {
        incentive: eligibleForIncentive ? (seller?.walletIncentive ?? 0) : null,
        points: eligibleForPoints ? (seller?.walletPoints ?? 0) : null,
      },
      stats: {
        pendingIncentive: eligibleForIncentive ? pendingIncentive : null,
        pendingPoints: eligibleForPoints ? pendingPoints : null,
        totalClaims: grouped.length,
      },
      eligibleForIncentive,
      eligibleForPoints,
      savedPayoutDetails: seller?.savedPayoutDetails || null,
    });
  } catch (err) {
    console.error('getMyClaims error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Helper to revert approved claim rewards from seller wallets
const revertApprovedClaimsWallet = async (claims) => {
  for (const claim of claims) {
    if (claim.status === 'Approved') {
      const decUpdate = {
        $inc: {
          walletIncentive: -claim.incentiveAmount,
          walletPoints: -claim.points,
        },
      };
      if (claim.sellerType === 'Distributor') {
        await Distributor.findByIdAndUpdate(claim.sellerId, decUpdate);
      } else if (claim.sellerType === 'Dealer') {
        await Dealer.findByIdAndUpdate(claim.sellerId, decUpdate);
      } else if (claim.sellerType === 'SubDealer') {
        await SubDealer.findByIdAndUpdate(claim.sellerId, decUpdate);
      } else if (claim.sellerType === 'Plumber') {
        await Plumber.findByIdAndUpdate(claim.sellerId, decUpdate);
      }
    }
  }
};

// DELETE /api/incentives/:id - Admin: Delete claim or claim group
export const deleteClaim = async (req, res) => {
  try {
    const claim = await IncentiveClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });

    const claimsToDelete = claim.saleGroupId
      ? await IncentiveClaim.find({ saleGroupId: claim.saleGroupId })
      : [claim];

    await revertApprovedClaimsWallet(claimsToDelete);

    if (claim.saleGroupId) {
      await IncentiveClaim.deleteMany({ saleGroupId: claim.saleGroupId });
    } else {
      await claim.deleteOne();
    }

    res.json({ message: 'Claim deleted successfully' });
  } catch (err) {
    console.error('deleteClaim error:', err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/incentives - Admin: Delete multiple claims
export const deleteMultipleClaims = async (req, res) => {
  try {
    const { claimIds } = req.body;
    if (!claimIds || claimIds.length === 0) {
      return res.status(400).json({ message: 'No claim IDs provided' });
    }

    const claims = await IncentiveClaim.find({ _id: { $in: claimIds } });
    const saleGroupIds = [];
    const directClaimIds = [];

    for (const claim of claims) {
      if (claim.saleGroupId) {
        saleGroupIds.push(claim.saleGroupId);
      } else {
        directClaimIds.push(claim._id);
      }
    }

    const allClaimsToDelete = await IncentiveClaim.find({
      $or: [
        { saleGroupId: { $in: saleGroupIds } },
        { _id: { $in: directClaimIds } },
      ],
    });

    await revertApprovedClaimsWallet(allClaimsToDelete);

    if (saleGroupIds.length > 0) {
      await IncentiveClaim.deleteMany({ saleGroupId: { $in: saleGroupIds } });
    }
    if (directClaimIds.length > 0) {
      await IncentiveClaim.deleteMany({ _id: { $in: directClaimIds } });
    }

    res.json({ message: 'Claims deleted successfully' });
  } catch (err) {
    console.error('deleteMultipleClaims error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/incentives/pending-count - Admin & Accounts: Get count of pending incentive claims
export const getPendingClaimsCount = async (req, res) => {
  try {
    const groupedPending = await IncentiveClaim.distinct('saleGroupId', {
      status: 'Approval Pending',
      saleGroupId: { $ne: null },
    });
    const ungroupedPendingCount = await IncentiveClaim.countDocuments({
      status: 'Approval Pending',
      saleGroupId: null,
    });
    const count = groupedPending.length + ungroupedPendingCount;
    res.json({ count });
  } catch (err) {
    console.error('getPendingClaimsCount error:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/incentives/:id/reapply - Seller / Plumber: Reapply for a rejected incentive claim
export const reapplyClaim = async (req, res) => {
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
      return res.status(403).json({ message: 'Unauthorized for incentive claim reapplication' });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const claim = await IncentiveClaim.findById(id);
    if (!claim) {
      return res.status(404).json({ message: 'Incentive claim not found' });
    }

    // Verify ownership
    const seller = await getSellerInfo(sellerType, sellerId, req.user.id, req.user.username);
    const finalSellerId = seller ? seller._id.toString() : sellerId?.toString();
    if (claim.sellerId.toString() !== finalSellerId) {
      return res.status(403).json({ message: 'You can only reapply for your own claims' });
    }

    if (claim.status !== 'Rejected') {
      return res.status(400).json({ message: 'Only rejected incentive claims can be reapplied' });
    }

    // If part of a saleGroupId, update all in the group
    const claimsToUpdate = claim.saleGroupId
      ? await IncentiveClaim.find({ saleGroupId: claim.saleGroupId, sellerId: finalSellerId })
      : [claim];

    for (const c of claimsToUpdate) {
      c.status = 'Approval Pending';
      c.previousRejectionReason = c.rejectionReason || '';
      c.rejectionReason = '';
      c.reapplyNotes = notes?.trim() || '';
      c.reappliedAt = new Date();
      c.reapplyCount = (c.reapplyCount || 0) + 1;
      await c.save();
    }

    res.json({
      message: 'Incentive claim resubmitted successfully for verification',
      claim,
    });
  } catch (err) {
    console.error('reapplyClaim error:', err);
    res.status(500).json({ message: err.message });
  }
};


