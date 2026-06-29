import mongoose from 'mongoose';

const factorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Factory name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },

    contactPerson: {
      type: String,
      required: [true, 'Contact person is required'],
      trim: true,
    },
    contactPhone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
    },
    gstNumber: {
      type: String,
      required: [true, 'GST number is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    assignedStaff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserRole',
      },
    ],
    lastViewedOrdersTimestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // This will add createdAt and updatedAt fields automatically
  }
);

// Add index for better search performance
factorySchema.index({ name: 'text', location: 'text' });

const Factory = mongoose.model('Factory', factorySchema);

export default Factory;
