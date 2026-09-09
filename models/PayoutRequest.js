import mongoose from 'mongoose';

const payoutRequestSchema = new mongoose.Schema(
  {
    requesterType: {
      type: String,
      enum: ['Distributor', 'Dealer', 'SubDealer', 'Plumber'],
      required: true,
    },
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'requesterType',
    },
    requesterName: {
      type: String,
      required: true,
    },
    requesterPhone: {
      type: String,
      default: '',
    },
    amount: {
      type: Number,
      required: [true, 'Payout amount is required'],
      min: [1, 'Amount must be greater than 0'],
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    payoutMethod: {
      type: String,
      enum: ['Bank', 'UPI'],
      default: 'Bank',
    },
    bankDetails: {
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
    },
    upiId: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    // Fields filled upon Admin verification
    paymentMethod: {
      type: String,
      enum: ['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'Other'],
      default: null,
    },
    referenceId: {
      type: String,
      default: '',
    },
    paymentProofImage: {
      type: String,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

payoutRequestSchema.index({ requesterId: 1, requestedAt: -1 });
payoutRequestSchema.index({ status: 1, requestedAt: -1 });

export default mongoose.model('PayoutRequest', payoutRequestSchema);
