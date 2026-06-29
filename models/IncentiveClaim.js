import mongoose from "mongoose";

const incentiveClaimSchema = new mongoose.Schema(
  {
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
    },
    sellerType: {
      type: String,
      enum: ["Distributor", "Dealer", "SubDealer"],
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sellerName: {
      type: String,
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    serialNumber: {
      type: String,
    },
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Model",
    },
    modelName: {
      type: String,
    },
    incentiveAmount: {
      type: Number,
      default: 0,
    },
    points: {
      type: Number,
      default: 0,
    },
    saleGroupId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["Approval Pending", "Approved", "Rejected", "Incomplete"],
      default: "Approval Pending",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    claimDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

incentiveClaimSchema.index({ sellerId: 1 });
incentiveClaimSchema.index({ status: 1 });
incentiveClaimSchema.index({ claimDate: -1 });

export default mongoose.model("IncentiveClaim", incentiveClaimSchema);
