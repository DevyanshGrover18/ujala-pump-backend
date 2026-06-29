import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const permissionSchema = new mongoose.Schema({
  view: { type: Boolean, default: false },
  add: { type: Boolean, default: false },
  modify: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
  full: { type: Boolean, default: false },
});

const accessControlSchema = new mongoose.Schema({
  management: permissionSchema,
  factories: permissionSchema,
  orders: permissionSchema,
  products: permissionSchema,
  distributors: permissionSchema,
  dealers: permissionSchema,
  sales: permissionSchema,
  subDealers: permissionSchema,
});

const userRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      validate: {
        validator: function (v) {
          return /^[+]?[1-9][\d\s\-()]{7,15}$/.test(v);
        },
        message: 'Invalid phone number format',
      },
    },
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
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    accessControl: {
      type: accessControlSchema,
      required: [true, 'Access control is required'],
    },
    assignedFactories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Factory',
      },
    ],
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserRole',
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for account lock status
userRoleSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userRoleSchema.pre('save', async function (next) {
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
userRoleSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to handle failed login attempts
userRoleSchema.methods.incLoginAttempts = function () {
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
userRoleSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() },
  });
};

// Method to check if user has specific permission
userRoleSchema.methods.hasPermission = function (section, permission) {
  if (!this.accessControl || !this.accessControl[section]) {
    return false;
  }
  return (
    this.accessControl[section].full || this.accessControl[section][permission]
  );
};

// Method to check if user has any access to a section
userRoleSchema.methods.hasAccessToSection = function (section) {
  if (!this.accessControl || !this.accessControl[section]) {
    return false;
  }
  const sectionPermissions = this.accessControl[section];
  return (
    sectionPermissions.full ||
    sectionPermissions.add ||
    sectionPermissions.modify ||
    sectionPermissions.delete ||
    sectionPermissions.view
  );
};

// Static method to create admin user with secure password
userRoleSchema.statics.createAdminUser = async function (adminData) {
  const fullAccess = {
    add: true,
    modify: true,
    delete: true,
    full: true,
  };

  const adminAccessControl = {
    management: fullAccess,
    factories: fullAccess,
    orders: fullAccess,
    products: fullAccess,
    distributors: fullAccess,
    dealers: fullAccess,
    sales: fullAccess,
    subDealers: fullAccess,
  };

  const admin = new this({
    ...adminData,
    accessControl: adminAccessControl,
  });

  return admin.save();
};

const UserRole = mongoose.model('UserRole', userRoleSchema);

export default UserRole;
