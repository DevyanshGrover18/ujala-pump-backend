import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [50, 'Category name cannot exceed 50 characters'],
      validate: {
        validator: function (v) {
          return /^[a-zA-Z0-9\s-_]+$/.test(v);
        },
        message:
          'Category name can only contain letters, numbers, spaces, hyphens, and underscores',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['Active', 'Inactive'],
        message: 'Status must be either Active or Inactive',
      },
      default: 'Active',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
categorySchema.index({ name: 1 });
categorySchema.index({ status: 1 });
categorySchema.index({ createdAt: -1 });

// Pre-delete middleware to prevent cascade issues
categorySchema.pre(
  'deleteOne',
  { document: true, query: false },
  async function () {
    const Model = mongoose.model('Model');
    const modelCount = await Model.countDocuments({ category: this._id });
    if (modelCount > 0) {
      throw new Error(
        `Cannot delete category. ${modelCount} models are associated with this category.`
      );
    }
  }
);

export default mongoose.model('Category', categorySchema);
