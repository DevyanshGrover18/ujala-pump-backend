import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const dealerSchema = new mongoose.Schema(
  {
    dealerId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine1: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine2: {
      type: String,
      trim: true,
      required: false,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{6}$/, 'Pincode must be 6 digits'],
    },
    contactPerson: {
      type: String,
      required: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    status: {
      type: String,
      required: true,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
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
    subDealers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubDealer',
      },
    ],
    eligibleForIncentive: {
      type: Boolean,
      default: true,
    },
    eligibleForPoints: {
      type: Boolean,
      default: true,
    },
    walletIncentive: {
      type: Number,
      default: 0,
    },
    walletPoints: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Add index for better search performance
dealerSchema.index({
  name: 'text',
  state: 'text',
  district: 'text',
  addressLine1: 'text',
});

dealerSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const Dealer = mongoose.model('Dealer', dealerSchema);

export default Dealer;
