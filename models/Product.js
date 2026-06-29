import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
    },
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    serialNumber: {
      type: String,
      required: true,
      unique: true,
    },
    month: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
    },
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Model',
    },
    quantity: {
      type: Number,
      required: true,
    },
    orderType: {
      type: String,
    },
    unitsPerBox: {
      type: Number,
    },
    factory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Factory',
    },
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null,
    },
    orderId: {
      type: String,
    },
    boxNumber: {
      type: Number,
    },
    unit: {
      type: String,
    },
    price: {
      type: Number,
    },
    minStockLevel: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    sold: {
      type: Boolean,
      default: false,
    },
    saleDate: {
      type: Date,
    },
    assignedToDistributorAt: {
      type: Date,
    },
    assignedWarranty: {
      duration: { type: Number },
      durationType: { type: String, enum: ['Months', 'Years'] },
      state: { type: String },
      city: { type: String },
    },
  },
  { timestamps: true }
);

const Product = mongoose.model('Product', productSchema);

export default Product;
