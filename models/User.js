import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { validateRole } from '../utils/security.js';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [50, 'Username cannot exceed 50 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Don't include password in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'factory', 'distributor', 'dealer', 'subdealer', 'executive'],
        message: 'Invalid role specified',
      },
      required: [true, 'Role is required'],
      validate: {
        validator: validateRole,
        message: 'Invalid role provided',
      },
    },
    factory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Factory',
      required: function () {
        return this.role === 'factory';
      },
    },
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      required: function () {
        return this.role === 'distributor';
      },
    },
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dealer',
      required: function () {
        return this.role === 'dealer';
      },
    },
    subDealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubDealer',
      required: function () {
        return this.role === 'subdealer';
      },
    },
    executive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Executive',
      required: function () {
        return this.role === 'executive';
      },
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    lastLogin: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for account lock status
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to handle failed login attempts
userSchema.methods.incLoginAttempts = function () {
  const maxAttempts = 5;
  const lockTime = 30 * 60 * 1000; // 30 minutes

  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() },
  });
};

export default mongoose.model('User', userSchema);
