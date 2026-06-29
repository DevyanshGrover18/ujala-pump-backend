import DealerSubDealerProduct from '../models/DealerSubDealerProduct.js';
import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';

export const assignProductToSubDealer = async (req, res) => {
  try {
    const { subDealerId, productId } = req.body;
    const dealerId = req.user.dealer;

    if (!dealerId) return res.status(400).json({ message: 'Dealer required' });
    if (!subDealerId)
      return res.status(400).json({ message: 'Select sub-dealer' });
    if (!productId) return res.status(400).json({ message: 'Select product' });

    // Verify the product is assigned to this dealer
    const dealerProduct = await DistributorDealerProduct.findOne({
      dealer: dealerId,
      product: productId,
    }).populate('distributor');

    if (!dealerProduct) {
      return res
        .status(400)
        .json({ message: 'Product not assigned to your dealership' });
    }

    // Check if product is already assigned to this sub-dealer
    const existingAssignment = await DealerSubDealerProduct.findOne({
      dealer: dealerId,
      subDealer: subDealerId,
      product: productId,
    });
    // console.log("existingAssignment - ", existingAssignment);

    if (existingAssignment) {
      return res
        .status(400)
        .json({ message: 'Product already assigned to this sub-dealer' });
    }

    // Create the assignment
    const assignment = new DealerSubDealerProduct({
      distributor: dealerProduct.distributor._id,
      dealer: dealerId,
      subDealer: subDealerId,
      product: productId,
    });

    const createdAssignment = await assignment.save();

    await Sale.updateMany(
      {
        dealer: dealerId,
        product: productId,
        distributor: dealerProduct.distributor._id,
        subDealer: null,
      },
      { $set: { subDealer: subDealerId } }
    );

    res.status(201).json({
      message: 'Product assigned to sub-dealer successfully',
      data: createdAssignment,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

export const revertSubDealerAssignment = async (req, res) => {
  try {
    const { productIds, subDealerId } = req.body;
    const dealerId = req.user.dealer; // Assuming dealerId is available from authenticated user

    if (!dealerId) {
      return res
        .status(400)
        .json({ message: 'Dealer ID is required from user context.' });
    }
    if (!subDealerId) {
      return res.status(400).json({ message: 'Sub-Dealer ID is required.' });
    }
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs array is required.' });
    }

    // 1. Update the Sale entries: set subDealer to null
    const saleUpdateResult = await Sale.updateMany(
      { product: { $in: productIds }, dealer: dealerId, subDealer: subDealerId },
      { $set: { subDealer: null } }
    );

    // 2. Delete the DealerSubDealerProduct entries
    const assignmentDeletionResult = await DealerSubDealerProduct.deleteMany({
      product: { $in: productIds },
      dealer: dealerId,
      subDealer: subDealerId,
    });

    // 3. Update the Product documents for consistency: set subDealer and assignedToSubDealerAt to null
    const productUpdateResult = await Product.updateMany(
      { _id: { $in: productIds } },
      {
        $set: {
          subDealer: null,
          assignedToSubDealerAt: null,
        },
      }
    );

    if (
      saleUpdateResult.modifiedCount === 0 &&
      assignmentDeletionResult.deletedCount === 0 &&
      productUpdateResult.modifiedCount === 0
    ) {
      return res.status(404).json({
        message: 'No matching products found assigned to this sub-dealer to revert.',
      });
    }

    res.json({
      message: `${saleUpdateResult.modifiedCount} products have been reverted from sub-dealer to dealer inventory.`,
    });
  } catch (error) {
    console.error('Error reverting sub-dealer assignment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getSubDealerProducts = async (req, res) => {
  try {
    const { subDealerId } = req.params;

    // Base Query: Sub-dealer ke wo products jo abhi tak customer ko nahi beche gaye
    let query = {
      subDealer: subDealerId,
      customerName: { $exists: false }, // Agar customerName nahi hai matlab inventory mein hai
    };

    // Agar Dealer check kar raha hai, toh filter lagao
    if (req.path.includes('/dealer/') && req.user.role === 'dealer') {
      query.dealer = req.user.dealer;
    }

    // Sale collection se products dhoondo
    const salesEntries = await Sale.find(query)
      .populate({
        path: 'product',
        populate: [{ path: 'model' }, { path: 'category' }],
      })
      .populate('distributor', 'name')
      .populate('dealer', 'name')
      .populate('subDealer', 'name')
      .sort({ createdAt: -1 });

    // Extra Safety: Product collection mein 'sold: true' nahi hona chahiye
    // (Ho sakta hai distributor ne piche se status change kiya ho)
    const availableInventory = salesEntries.filter(
      (entry) => entry.product && entry.product.sold !== true
    );

    res.json(availableInventory);
  } catch (error) {
    console.error('Sub-Dealer Inventory Error:', error);
    res.status(500).json({ message: error.message });
  }
};
export const getDealerAssignableProducts = async (req, res) => {
  try {
    const dealerId = req.user.dealer;

    // Get products assigned to dealer but not yet assigned to any sub-dealer
    const dealerProducts = await DistributorDealerProduct.find({
      dealer: dealerId,
    }).populate('product');

    const assignedToSubDealers = await DealerSubDealerProduct.find({
      dealer: dealerId,
    }).select('product');

    const assignedProductIds = assignedToSubDealers.map((a) =>
      a.product.toString()
    );

    const availableProducts = dealerProducts.filter(
      (dp) => !assignedProductIds.includes(dp.product._id.toString())
    );

    res.json(availableProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const removeProductFromSubDealer = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const dealerId = req.user.dealer;

    const assignment = await DealerSubDealerProduct.findOne({
      _id: assignmentId,
      dealer: dealerId,
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    await assignment.deleteOne();
    res.json({ message: 'Product removed from sub-dealer successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyProducts = async (req, res) => {
  try {
    // console.log('getMyProducts - req.user:', req.user);

    // Try different ways to get the subDealer ID
    const subDealerId = req.user.subDealer || req.user._id;

    // console.log('subDealerId:', subDealerId);

    if (!subDealerId) {
      return res
        .status(400)
        .json({ message: 'Sub-dealer not found in user object' });
    }

    // Get all DealerSubDealerProduct assignments for this sub-dealer
    const allAssignments = await DealerSubDealerProduct.find({
      subDealer: subDealerId,
    })
      .populate({
        path: 'product',
        populate: [{ path: 'model' }, { path: 'category' }],
      })
      .populate('distributor')
      .populate('dealer');

    // Filter for only unsold products in inventory
    // A product is in inventory if:
    // 1. It doesn't have customerName (not claimed/sold)
    // 2. The product itself is not marked as sold
    const inventoryProducts = await Promise.all(
      allAssignments.map(async (assignment) => {
        // Skip if product is null or doesn't exist
        if (!assignment.product) {
          return null;
        }

        // Check Sale collection for this product
        const saleRecord = await Sale.findOne({
          product: assignment.product._id,
          subDealer: subDealerId,
        });

        // Include only if:
        // 1. No sale record OR sale record has no customerName (inventory item)
        // 2. Product is not marked as sold
        if (
          (!saleRecord || !saleRecord.customerName) &&
          assignment.product.sold !== true
        ) {
          return assignment;
        }
        return null;
      })
    );

    // Filter out null values
    const unsoldProducts = inventoryProducts.filter((p) => p !== null);

    // console.log('Found unsold products:', unsoldProducts.length);
    res.json(unsoldProducts);
  } catch (error) {
    console.error('getMyProducts error:', error);
    res.status(500).json({ message: error.message });
  }
};
