import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema(
  {
    plumber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plumber',
      required: true,
    },
    serialNumber: {
      type: String,
      required: true,
      index: true,
    },
    motorDetails: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    additionalDetails: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Open', 'Resolved'],
      default: 'Open',
    },
    complaintDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const Complaint = mongoose.model('Complaint', complaintSchema);
export default Complaint;
