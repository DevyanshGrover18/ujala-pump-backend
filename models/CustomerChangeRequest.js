import mongoose from 'mongoose';

const customerChangeRequestSchema = new mongoose.Schema(
  {
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'requestedByModel',
    },
    requestedByModel: {
      type: String,
      required: true,
      enum: ['Distributor', 'Dealer', 'SubDealer'],
    },
    requestedByName: {
      type: String,
      required: true,
    },
    originalData: {
      customerName: String,
      customerPhone: String,
      customerAddress: String,
      plumberName: String,
    },
    requestedChanges: {
      customerName: String,
      customerPhone: String,
      customerAddress: String,
      plumberName: String,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reason: {
      type: String,
      required: true,
    },
    adminResponse: {
      type: String,
    },
    processedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model(
  'CustomerChangeRequest',
  customerChangeRequestSchema
);
