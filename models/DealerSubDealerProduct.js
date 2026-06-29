import mongoose from 'mongoose';

const dealerSubDealerProductSchema = new mongoose.Schema(
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
    subDealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubDealer',
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

const DealerSubDealerProduct = mongoose.model(
  'DealerSubDealerProduct',
  dealerSubDealerProductSchema
);

export default DealerSubDealerProduct;
