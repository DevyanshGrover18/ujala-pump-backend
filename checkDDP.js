import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Product from './models/Product.js';
import DistributorDealerProduct from './models/DistributorDealerProduct.js';
import DealerSubDealerProduct from './models/DealerSubDealerProduct.js';
import Sale from './models/Sale.js';

dotenv.config();

const run = async () => {
  await connectDB();
  try {
    const product = await Product.findOne({ serialNumber: '0726VSV1410018' });
    if (!product) {
      console.log('Product not found');
      return;
    }

    const ddp = await DistributorDealerProduct.findOne({ product: product._id }).populate('distributor dealer');
    console.log('DistributorDealerProduct:', JSON.stringify(ddp, null, 2));

    const dsdp = await DealerSubDealerProduct.findOne({ product: product._id }).populate('dealer subDealer');
    console.log('DealerSubDealerProduct:', JSON.stringify(dsdp, null, 2));

    const sales = await Sale.find({ product: product._id }).lean();
    console.log('Sales:', JSON.stringify(sales, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.connection.close();
  }
};

run();
