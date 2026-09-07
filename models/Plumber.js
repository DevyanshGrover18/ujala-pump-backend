import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const plumberSchema = new mongoose.Schema(
  {
    plumberId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
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
    pincode: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    walletIncentive: {
      type: Number,
      default: 0,
    },
    walletPoints: {
      type: Number,
      default: 0,
    },
    eligibleForIncentive: {
      type: Boolean,
      default: true,
    },
    savedPayoutDetails: {
      payoutMethod: { type: String, enum: ['Bank', 'UPI'] },
      bankDetails: {
        accountNumber: { type: String, default: '' },
        ifscCode: { type: String, default: '' },
        bankName: { type: String, default: '' },
        accountHolderName: { type: String, default: '' },
      },
      upiId: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
plumberSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const Plumber = mongoose.model('Plumber', plumberSchema);
export default Plumber;
