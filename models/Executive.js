import mongoose from 'mongoose';

const executiveSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    state: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    addressLine1: {
      type: String,
      trim: true,
    },
    addressLine2: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    gstNumber: {
      type: String,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    distributors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Distributor',
      },
    ],
    dealers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dealer',
      },
    ],
    subDealers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubDealer',
      },
    ],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Executive', executiveSchema);
