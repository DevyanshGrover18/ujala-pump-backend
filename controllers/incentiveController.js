import IncentiveClaim from "../models/IncentiveClaim.js";
import Distributor from "../models/Distributor.js";
import Dealer from "../models/Dealer.js";
import SubDealer from "../models/SubDealer.js";

const getSellerInfo = async (sellerType, sellerId) => {
  if (sellerType === "Distributor") return Distributor.findById(sellerId).select("name distributorId contactPerson contactPhone email walletIncentive walletPoints eligibleForIncentive eligibleForPoints").lean();
  if (sellerType === "Dealer") return Dealer.findById(sellerId).select("name dealerId contactPerson contactPhone email walletIncentive walletPoints eligibleForIncentive eligibleForPoints").lean();
  if (sellerType === "SubDealer") return SubDealer.findById(sellerId).select("name subDealerId contactPerson contactPhone email walletIncentive walletPoints eligibleForIncentive eligibleForPoints").lean();
  return null;
};

// GET /api/incentives - Admin: all claims grouped by saleGroupId
export const getAllClaims = async (req, res) => {
  try {
    const claims = await IncentiveClaim.find()
      .populate("product", "serialNumber")
      .populate("model", "name code incentive points")
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
        if (c.status === "Approval Pending") grp.status = "Approval Pending";
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
    console.error("getAllClaims error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/incentives/:id - Single claim detail
export const getClaimById = async (req, res) => {
  try {
    const claim = await IncentiveClaim.findById(req.params.id)
      .populate("sale")
      .populate("product", "serialNumber")
      .populate("model", "name code incentive points")
      .lean();

    if (!claim) return res.status(404).json({ message: "Claim not found" });

    // If grouped, fetch all claims with same saleGroupId
    let groupClaims = [claim];
    if (claim.saleGroupId) {
      groupClaims = await IncentiveClaim.find({ saleGroupId: claim.saleGroupId })
        .populate("sale")
        .populate("product", "serialNumber")
        .populate("model", "name code")
        .lean();
    }

    const seller = await getSellerInfo(claim.sellerType, claim.sellerId);

    res.json({ ...claim, groupClaims, seller });
  } catch (err) {
    console.error("getClaimById error:", err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/incentives/:id/verify - Admin approve/reject/incomplete
// Acts on all claims in the same saleGroupId
export const verifyClaim = async (req, res) => {
  try {
    const { action, rejectionReason } = req.body;
    const claim = await IncentiveClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: "Claim not found" });

    if (action !== "approve" && action !== "reject" && action !== "incomplete") {
      return res.status(400).json({ message: "Invalid action" });
    }
    if (action === "reject" && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    // Get all claims in the same group
    const allClaims = claim.saleGroupId
      ? await IncentiveClaim.find({ saleGroupId: claim.saleGroupId })
      : [claim];

    for (const c of allClaims) {
      if (c.status === "Approved") continue; // skip already approved

      if (action === "approve") {
        c.status = "Approved";
        const incUpdate = { $inc: { walletIncentive: c.incentiveAmount, walletPoints: c.points } };
        if (c.sellerType === "Distributor") await Distributor.findByIdAndUpdate(c.sellerId, incUpdate);
        else if (c.sellerType === "Dealer") await Dealer.findByIdAndUpdate(c.sellerId, incUpdate);
        else if (c.sellerType === "SubDealer") await SubDealer.findByIdAndUpdate(c.sellerId, incUpdate);
      } else if (action === "reject") {
        c.status = "Rejected";
        c.rejectionReason = rejectionReason.trim();
      } else {
        c.status = "Incomplete";
      }
      await c.save();
    }

    res.json({ message: `Claim ${action}d successfully` });
  } catch (err) {
    console.error("verifyClaim error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/incentives/my/claims - Seller: their own claims
export const getMyClaims = async (req, res) => {
  try {
    let sellerType, sellerId;
    if (req.user.distributor) { sellerType = "Distributor"; sellerId = req.user.distributor; }
    else if (req.user.dealer) { sellerType = "Dealer"; sellerId = req.user.dealer; }
    else if (req.user.subDealer) { sellerType = "SubDealer"; sellerId = req.user.subDealer; }
    else return res.status(403).json({ message: "Unauthorized" });

    const claims = await IncentiveClaim.find({ sellerId })
      .populate("product", "serialNumber")
      .populate("model", "name code")
      .sort({ claimDate: -1 })
      .lean();

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
            items: [],
            totalIncentive: 0,
            totalPoints: 0,
          });
        }
        const grp = groupMap.get(c.saleGroupId);
        grp.items.push(c);
        grp.totalIncentive += c.incentiveAmount || 0;
        grp.totalPoints += c.points || 0;
        if (c.status === "Approval Pending") grp.status = "Approval Pending";
      } else {
        ungrouped.push({ _id: c._id, saleGroupId: null, claimDate: c.claimDate, status: c.status, rejectionReason: c.rejectionReason, items: [c], totalIncentive: c.incentiveAmount || 0, totalPoints: c.points || 0 });
      }
    }

    const grouped = [...groupMap.values(), ...ungrouped].sort((a, b) => new Date(b.claimDate) - new Date(a.claimDate));

    // Also get wallet balance
    const seller = await getSellerInfo(sellerType, sellerId);

    res.json({
      claims: grouped,
      wallet: { incentive: seller?.walletIncentive ?? 0, points: seller?.walletPoints ?? 0 },
      eligibleForIncentive: seller?.eligibleForIncentive !== false,
      eligibleForPoints: seller?.eligibleForPoints !== false,
    });
  } catch (err) {
    console.error("getMyClaims error:", err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/incentives/:id - Admin: Delete claim or claim group
export const deleteClaim = async (req, res) => {
  try {
    const claim = await IncentiveClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: "Claim not found" });

    if (claim.saleGroupId) {
      await IncentiveClaim.deleteMany({ saleGroupId: claim.saleGroupId });
    } else {
      await claim.deleteOne();
    }

    res.json({ message: "Claim deleted successfully" });
  } catch (err) {
    console.error("deleteClaim error:", err);
    res.status(500).json({ message: err.message });
  }
};

