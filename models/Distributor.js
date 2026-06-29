import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const distributorSchema = new mongoose.Schema(
  {
    distributorId: {
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
    gstNumber: {
      type: String,
      trim: true,
      required: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      required: false,
    },
    contactPhone: {
      type: String,
      trim: true,
      required: false,
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
    username: {
      // New field
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      // New field
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    dealers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dealer',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Hash password before saving (pre-save hook)
distributorSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Add index for better search performance
distributorSchema.index({
  name: 'text',
  state: 'text',
  district: 'text',
  addressLine1: 'text',
});

const Distributor = mongoose.model('Distributor', distributorSchema);

export default Distributor;
