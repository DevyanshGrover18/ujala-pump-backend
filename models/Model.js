import mongoose from 'mongoose';

const modelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Model name is required'],
      trim: true,
      minlength: [2, 'Model name must be at least 2 characters'],
      maxlength: [100, 'Model name cannot exceed 100 characters'],
    },
    code: {
      type: String,
      required: [true, 'Model code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: [2, 'Model code must be at least 2 characters'],
      maxlength: [20, 'Model code cannot exceed 20 characters'],
      validate: {
        validator: function (v) {
          return /^[A-Z0-9-_]+$/.test(v);
        },
        message:
          'Model code can only contain uppercase letters, numbers, hyphens, and underscores',
      },
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      validate: {
        validator: async function (v) {
          const Category = mongoose.model('Category');
          const category = await Category.findById(v);
          return category && category.status === 'Active';
        },
        message: 'Category must exist and be active',
      },
    },
    specifications: {
      quantity: {
        type: String,
        default: '1N',
        validate: {
          validator: function (v) {
            return /^\d+[A-Z]*$/.test(v);
          },
          message: 'Invalid quantity format',
        },
      },
      grossWeight: {
        type: String,
        required: [true, 'Gross weight is required'],
        validate: {
          validator: function (v) {
            return /^\d+(\.\d+)?\s?(kg|g|lbs)$/i.test(v);
          },
          message: 'Gross weight must include valid unit (kg, g, lbs)',
        },
      },
      kwHp: {
        type: String,
        required: [true, 'KW/HP is required'],
        validate: {
          validator: function (v) {
            return /^[\d\.\/]+\s*(kw|hp|kw\/hp)$/i.test(v);
          },
          message: 'KW/HP must include valid unit (kw, hp or kw/hp) and can include fractions (e.g. 0.75/1.0 HP)',
        },
      },
      voltage: {
        type: String,
        required: [true, 'Voltage is required'],
        validate: {
          validator: function (v) {
            return /^\d+(\.\d+)?\s?v$/i.test(v);
          },
          message: 'Voltage must include unit (V)',
        },
      },
      mrpPrice: {
        type: Number,
        required: [true, 'MRP price is required'],
        min: [0, 'MRP price must be positive'],
        max: [10000000, 'MRP price cannot exceed 10,000,000'],
      },
    },
    warranty: {
      type: [
        {
          state: {
            type: String,
            required: [true, 'State is required'],
            trim: true,
            minlength: [2, 'State name must be at least 2 characters'],
          },
          city: {
            type: String,
            required: [true, 'City/District is required'],
            trim: true,
            minlength: [2, 'City/District name must be at least 2 characters'],
          },
          durationType: {
            type: String,
            enum: {
              values: ['Months', 'Years'],
              message: 'Duration type must be either Months or Years',
            },
            required: [true, 'Duration type is required'],
          },
          duration: {
            type: Number,
            required: [true, 'Duration is required'],
            min: [1, 'Duration must be at least 1'],
            max: [100, 'Duration cannot exceed 100'],
          },
        },
      ],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one warranty entry is required',
      },
    },
    incentive: {
      type: Number,
      default: 0,
      min: [0, 'Incentive amount cannot be negative'],
    },
    points: {
      type: Number,
      default: 0,
      min: [0, 'Points cannot be negative'],
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
modelSchema.index({ code: 1 });
modelSchema.index({ category: 1 });
modelSchema.index({ status: 1 });
modelSchema.index({ 'specifications.mrpPrice': 1 });
modelSchema.index({ createdAt: -1 });

// Pre-update middleware to update related records when model code changes
modelSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate();
  if (update.$set?.code || update.code) {
    const newCode = update.$set?.code || update.code;
    const docToUpdate = await this.model.findOne(this.getQuery());

    if (docToUpdate && docToUpdate.code !== newCode) {
      const oldCode = docToUpdate.code;

      try {
        // Update Order serial numbers
        const Order = mongoose.model('Order');
        const OrderItem = mongoose.model('OrderItem');

        await Order.updateMany({ model: docToUpdate._id }, [
          {
            $set: {
              serialNumber: {
                $replaceAll: {
                  input: '$serialNumber',
                  find: oldCode,
                  replacement: newCode,
                },
              },
            },
          },
        ]);

        await OrderItem.updateMany({ model: docToUpdate._id }, [
          {
            $set: {
              serialNumber: {
                $replaceAll: {
                  input: '$serialNumber',
                  find: oldCode,
                  replacement: newCode,
                },
              },
            },
          },
        ]);

        // Update Product serial numbers if they exist
        const Product = mongoose.model('Product');
        await Product.updateMany({ model: docToUpdate._id }, [
          {
            $set: {
              serialNumber: {
                $replaceAll: {
                  input: '$serialNumber',
                  find: oldCode,
                  replacement: newCode,
                },
              },
            },
          },
        ]);
      } catch (error) {
        console.error('Error updating serial numbers:', error);
      }
    }
  }
});

export default mongoose.model('Model', modelSchema);
