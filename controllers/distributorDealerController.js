import mongoose from 'mongoose';
import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';

export const assignProductToDealer = async (req, res) => {
  try {
    const { distributorId, dealerId, productId } = req.body;

    if (!distributorId)
      return res.status(400).json({ message: 'Distributor required' });

    if (!dealerId) return res.status(400).json({ message: 'Select dealer' });

    if (!productId) return res.status(400).json({ message: 'Select product' });

    const product = await Product.findOne({
      _id: productId,
      distributor: distributorId,
    });

    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (product.sold)
      return res.status(400).json({ message: 'Product already sold' });

    const alreadyAssigned = await DistributorDealerProduct.findOne({
      product: productId,
    });

    if (alreadyAssigned)
      return res.status(409).json({ message: 'Product already assigned' });

    const assignment = await DistributorDealerProduct.create({
      distributor: distributorId,
      dealer: dealerId,
      product: productId,
    });

    await Sale.create({
      product: productId,
      distributor: distributorId,
      dealer: dealerId,
      saleDate: new Date(),
    });

    // product.sold = true;
    // await product.save();

    res.status(201).json(assignment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


export const getDealerProducts = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;

    if (!dealerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // 1. Pehle Sales se wo entries nikalo jo Dealer ke paas hain (Inventory)
    // Na Sub-dealer ko gayi hon, na Customer ko bechi gayi hon
    const sales = await Sale.find({
      dealer: dealerId,
      $and: [
        { subDealer: { $exists: false } },
        { customerName: { $exists: false } },
      ],
    }).populate('dealer', 'name');

    if (sales.length === 0) return res.json([]);

    // 2. Product IDs nikalna
    const productIds = sales.map((s) => s.product);

    // 3. Products fetch karna aur 'sold: false' ensure karna
    const products = await Product.find({
      _id: { $in: productIds },
      sold: { $ne: true }, // Product sold nahi hona chahiye
    })
      .populate('model')
      .populate('factory')
      .populate('distributor')
      .sort({ updatedAt: -1 });

    // 4. Map banana taaki fast lookup ho sake
    const saleMap = {};
    sales.forEach((s) => {
      saleMap[s.product.toString()] = s;
    });

    // 5. Data merge karna (Enrichment)
    const enrichedProducts = products.map((product) => {
      const obj = product.toObject();
      const sale = saleMap[product._id.toString()];

      return {
        product: obj,
        dealer: sale ? sale.dealer : null,
        subDealer: null,
        sold: false,
        soldAt: null,
        assignedToSubDealerAt: null,
        sale: sale || null,
      };
    });

    res.json(enrichedProducts);
  } catch (error) {
    console.error('Dealer inventory error:', error);
    res.status(500).json({ message: error.message });
  }
};


export const getDealerProductsInventroy = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;

    if (!dealerId) return res.status(401).json({ message: 'Unauthorized' });

    // Fetch all sales for this dealer
    const sales = await Sale.find({ dealer: dealerId })
      .populate('dealer')
      .populate('subDealer');

    if (!sales.length) return res.json([]);

    // Filter out products that are sold, assigned to sub-dealer, or customer exists
    const filteredSales = sales.filter(
      (sale) => !sale.subDealer && !sale.customerName
    );

    if (!filteredSales.length) return res.json([]);

    const productIds = filteredSales.map((sale) => sale.product);

    // Fetch product details
    const products = await Product.find({
      _id: { $in: productIds },
      status: { $ne: 'Inactive' }, // exclude inactive products
    })
      .populate('model')
      .populate('factory')
      .populate('distributor')
      .sort({ updatedAt: -1 });

    if (!products.length) return res.json([]);

    const saleMap = {};
    filteredSales.forEach((sale) => {
      saleMap[sale.product.toString()] = sale;
    });

    const enrichedProducts = products.map((product) => {
      const obj = product.toObject();
      const pid = product._id.toString();
      const sale = saleMap[pid];

      return {
        product: { ...obj },
        dealer: sale?.dealer || null,
        subDealer: sale?.subDealer || null,
        sold: false, // explicitly unsold
        soldAt: null,
        assignedToSubDealerAt: sale?.createdAt || null,
        sale,
      };
    });

    res.json(enrichedProducts);
  } catch (error) {
    console.error('Dealer inventory error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const revertDealerAssignment = async (req, res) => {
  try {
    const { productIds, dealerId } = req.body;

    if (!dealerId) {
      return res.status(400).json({ message: 'Dealer ID is required' });
    }

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs array is required' });
    }

    // 1. Update the Sale entries: Nullify dealer and subsequent assignments
    // This makes the product available to the distributor again in the Sale ledger
    const saleUpdateQuery = {
      product: { $in: productIds },
      dealer: dealerId,
      // No strict conditions on subDealer or customerName here, as we want to revert regardless
    };
    const saleUpdateOperation = {
      $set: {
        dealer: null,
        subDealer: null,
        customerName: null,
        customerPhone: null,
        customerAddress: null,
        plumberName: null,
        plumberMobileNumber: null,
        alternateMobileNumber: null,
        soldAt: null,
        saleDate: null,
      },
      // $unset: { assignedWarranty: "" } // If Sale also stores assigned warranty that needs to be removed
    };


    const saleUpdateResult = await Sale.updateMany(saleUpdateQuery, saleUpdateOperation);


    // 2. Delete the DistributorDealerProduct entries
    const distributorDealerProductDeletionResult = await DistributorDealerProduct.deleteMany({
      product: { $in: productIds },
      dealer: dealerId,
    });
    
    // 3. Update the Product documents to ensure consistency
    const productUpdateResult = await Product.updateMany(
      { _id: { $in: productIds } },
      {
        $set: {
          dealer: null,
          assignedToDealerAt: null,
          subDealer: null, // Also clear sub-dealer in case of inconsistent data
          assignedToSubDealerAt: null,
        }
      }
    );
    console.log('Product.updateMany result:', productUpdateResult);

    if (saleUpdateResult.modifiedCount === 0 && distributorDealerProductDeletionResult.deletedCount === 0 && productUpdateResult.modifiedCount === 0) {
        return res.status(404).json({ message: 'No matching products found with this dealer to revert. They might already be reverted or not assigned to this dealer.' });
    }


    res.json({ message: `${saleUpdateResult.modifiedCount} products have been reverted from the dealer.` });

  } catch (error) {
    console.error('Error reverting dealer assignment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
