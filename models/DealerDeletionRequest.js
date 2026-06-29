import mongoose from 'mongoose';

const dealerDeletionRequestSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true,
  },
  distributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor',
    required: true,
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined'],
    default: 'pending',
  },
});

const DealerDeletionRequest = mongoose.model(
  'DealerDeletionRequest',
  dealerDeletionRequestSchema
);

export default DealerDeletionRequest;
