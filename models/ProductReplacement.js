import mongoose from 'mongoose';

const productReplacementSchema = new mongoose.Schema(
  {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'requesterModel',
    },
    requesterModel: {
      type: String,
      required: true,
      enum: ['Distributor', 'Dealer', 'SubDealer'],
    },
    oldProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    oldSerialNumber: {
      type: String,
      required: true,
    },
    newProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    newSerialNumber: {
      type: String,
      default: null,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    proofImages: [
      {
        type: String,
        required: true,
      },
    ],
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    adminRemarks: {
      type: String,
      default: '',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserRole',
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserRole',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'UserRole' },
        remarks: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

productReplacementSchema.index({ oldSerialNumber: 1 });
productReplacementSchema.index({ newSerialNumber: 1 });
productReplacementSchema.index({ status: 1 });

const ProductReplacement = mongoose.model('ProductReplacement', productReplacementSchema);
export default ProductReplacement;
