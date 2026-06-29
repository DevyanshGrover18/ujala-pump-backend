import mongoose from 'mongoose';

const distributorDealerProductSchema = new mongoose.Schema(
  {
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      required: true,
    },
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dealer',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const DistributorDealerProduct = mongoose.model(
  'DistributorDealerProduct',
  distributorDealerProductSchema
);

export default DistributorDealerProduct;
