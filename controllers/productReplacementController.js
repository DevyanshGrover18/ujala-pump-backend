import Product from '../models/Product.js';
import ProductReplacement from '../models/ProductReplacement.js';
import IncentiveClaim from '../models/IncentiveClaim.js';
import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import DealerSubDealerProduct from '../models/DealerSubDealerProduct.js';
import Sale from '../models/Sale.js';

/**
 * Helper to check if a product belongs to the requester based on their role
 */
const verifyProductOwnership = async (product, user) => {
  const { role, distributor, dealer, subDealer } = user;

  if (role === 'distributor') {
    // Product should be assigned to this distributor, but not yet passed to a dealer
    if (String(product.distributor) !== String(distributor)) return false;
    const assignedToDealer = await DistributorDealerProduct.findOne({ product: product._id });
    if (assignedToDealer) return false;
    return true;
  }

  if (role === 'dealer') {
    // Product must be assigned to this dealer in DistributorDealerProduct, but not yet to a subdealer
    const assignedToMe = await DistributorDealerProduct.findOne({ dealer, product: product._id });
    if (!assignedToMe) return false;
    const assignedToSubDealer = await DealerSubDealerProduct.findOne({ product: product._id });
    if (assignedToSubDealer) return false;
    return true;
  }

  if (role === 'subdealer') {
    // Product must be assigned to this subdealer in DealerSubDealerProduct
    const assignedToMe = await DealerSubDealerProduct.findOne({ subDealer, product: product._id });
    if (!assignedToMe) return false;
    return true;
  }

  return false;
};

/**
 * Helper to check if a product is currently within its warranty period
 */
const isProductInWarranty = async (product) => {
  if (!product.assignedWarranty || !product.assignedWarranty.duration) {
    return false;
  }

  // If the product has not been sold yet, it is still in active dealer/distributor inventory, so it is covered
  if (!product.sold) {
    return true;
  }

  let startDate = product.warrantyStartDate || product.saleDate || product.createdAt;

  try {
    const Installation = (await import('../models/Installation.js')).default;
    const installation = await Installation.findOne({ product: product._id });
    if (installation && installation.installationDate) {
      startDate = installation.installationDate;
    }
  } catch (err) {
    console.error('Error fetching installation date for warranty check:', err);
  }

  const duration = product.assignedWarranty.duration;
  const durationType = product.assignedWarranty.durationType;

  const expiryDate = new Date(startDate);
  if (durationType === 'Years') {
    expiryDate.setFullYear(expiryDate.getFullYear() + duration);
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + duration);
  }

  return new Date() <= expiryDate;
};

/**
 * Verify if a serial number is eligible for replacement by the requester
 */
export const verifySerialNumber = async (req, res) => {
  try {
    const { serialNumber } = req.params;
    if (!serialNumber) {
      return res.status(400).json({ message: 'Serial number is required' });
    }

    const product = await Product.findOne({ serialNumber })
      .populate('category model factory')
      .lean();

    if (!product) {
      return res.status(404).json({ message: 'Product not found in the system' });
    }

    if (product.status === 'Replaced') {
      return res.status(400).json({ message: 'This product has already been replaced' });
    }

    if (product.status !== 'Active') {
      return res.status(400).json({ message: 'This product is not active' });
    }

    // Verify ownership
    const isOwner = await verifyProductOwnership(product, req.user);
    if (!isOwner) {
      return res.status(403).json({ message: 'This product is not in your active inventory' });
    }

    // Verify warranty status
    const inWarranty = await isProductInWarranty(product);
    if (!inWarranty) {
      return res.status(400).json({ message: 'This product is out of warranty and cannot be replaced' });
    }

    // Check if there is an active pending request
    const pendingRequest = await ProductReplacement.findOne({
      oldProduct: product._id,
      status: 'Pending',
    });
    if (pendingRequest) {
      return res.status(400).json({ message: 'A replacement request is already pending for this product' });
    }

    res.status(200).json({
      message: 'Product is eligible for replacement',
      product: {
        productId: product._id,
        serialNumber: product.serialNumber,
        productName: product.productName,
        category: product.category,
        model: product.model,
        factory: product.factory,
        status: product.status,
      },
    });
  } catch (error) {
    console.error('Error verifying serial number:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Submit a replacement request
 */
export const createReplacementRequest = async (req, res) => {
  try {
    const { serialNumber, reason, description, proofImages } = req.body;

    if (!serialNumber || !reason) {
      return res.status(400).json({ message: 'Serial number and reason are required' });
    }

    if (!proofImages || !Array.isArray(proofImages) || proofImages.length === 0) {
      return res.status(400).json({ message: 'At least one proof image is required' });
    }

    const product = await Product.findOne({ serialNumber });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.status === 'Replaced') {
      return res.status(400).json({ message: 'Product has already been replaced' });
    }

    const isOwner = await verifyProductOwnership(product, req.user);
    if (!isOwner) {
      return res.status(403).json({ message: 'This product is not in your active inventory' });
    }

    // Verify warranty status
    const inWarranty = await isProductInWarranty(product);
    if (!inWarranty) {
      return res.status(400).json({ message: 'This product is out of warranty and cannot be replaced' });
    }

    const pendingRequest = await ProductReplacement.findOne({
      oldProduct: product._id,
      status: 'Pending',
    });
    if (pendingRequest) {
      return res.status(400).json({ message: 'A replacement request is already pending for this product' });
    }

    // Determine requester Model
    let requesterModel = '';
    let requestedBy = null;
    if (req.user.role === 'distributor') {
      requesterModel = 'Distributor';
      requestedBy = req.user.distributor;
    } else if (req.user.role === 'dealer') {
      requesterModel = 'Dealer';
      requestedBy = req.user.dealer;
    } else if (req.user.role === 'subdealer') {
      requesterModel = 'SubDealer';
      requestedBy = req.user.subDealer;
    }

    const replacement = new ProductReplacement({
      requestedBy,
      requesterModel,
      oldProduct: product._id,
      oldSerialNumber: product.serialNumber,
      reason,
      description,
      proofImages,
      status: 'Pending',
      statusHistory: [
        {
          status: 'Pending',
          remarks: 'Request submitted',
        },
      ],
    });

    const saved = await replacement.save();
    res.status(201).json({
      message: 'Replacement request submitted successfully',
      replacement: saved,
    });
  } catch (error) {
    console.error('Error creating replacement request:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get replacement requests
 */
export const getReplacementRequests = async (req, res) => {
  try {
    const { role } = req.user;
    let query = {};

    // If not admin/member, filter by the requester ID
    if (role !== 'admin' && role !== 'member') {
      let requesterId = null;
      if (role === 'distributor') requesterId = req.user.distributor;
      else if (role === 'dealer') requesterId = req.user.dealer;
      else if (role === 'subdealer') requesterId = req.user.subDealer;

      query = { requestedBy: requesterId };
    }

    const replacements = await ProductReplacement.find(query)
      .populate('oldProduct')
      .populate('newProduct')
      .populate('requestedBy')
      .sort({ createdAt: -1 });

    res.status(200).json(replacements);
  } catch (error) {
    console.error('Error getting replacement requests:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Resolve (Approve / Reject) and Assign Product
 */
export const resolveReplacementRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminRemarks, newSerialNumber } = req.body;

    if (!['Approved', 'Rejected'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be Approved or Rejected' });
    }

    const replacement = await ProductReplacement.findById(id);
    if (!replacement) {
      return res.status(404).json({ message: 'Replacement request not found' });
    }

    if (replacement.status !== 'Pending') {
      return res.status(400).json({ message: 'This request has already been processed' });
    }

    const adminUserId = req.user.id;

    if (action === 'Rejected') {
      replacement.status = 'Rejected';
      replacement.adminRemarks = adminRemarks || 'Rejected by Admin';
      replacement.approvedBy = adminUserId;
      replacement.resolvedAt = Date.now();
      replacement.statusHistory.push({
        status: 'Rejected',
        changedBy: adminUserId,
        remarks: adminRemarks || 'Rejected by Admin',
      });

      await replacement.save();
      return res.status(200).json({ message: 'Request rejected successfully', replacement });
    }

    // Otherwise: Approved
    if (!newSerialNumber) {
      return res.status(400).json({ message: 'New Product Serial Number is required for approval' });
    }

    // Fetch and validate new replacement product
    const newProduct = await Product.findOne({ serialNumber: newSerialNumber });
    if (!newProduct) {
      return res.status(404).json({ message: 'New replacement product serial number not found' });
    }

    if (newProduct.status !== 'Active') {
      return res.status(400).json({ message: 'New replacement product is not active' });
    }

    if (newProduct.sold) {
      return res.status(400).json({ message: 'New replacement product has already been sold' });
    }

    // Check if the new product is already assigned as a replacement
    const alreadyAssignedAsReplacement = await ProductReplacement.findOne({ newProduct: newProduct._id });
    if (alreadyAssignedAsReplacement) {
      return res.status(400).json({ message: 'This replacement product has already been assigned to another request' });
    }

    // Fetch original defective product
    const oldProduct = await Product.findById(replacement.oldProduct);
    if (!oldProduct) {
      return res.status(404).json({ message: 'Original product not found' });
    }

    // Perform updates inside database
    
    // 1. Check incentive eligibility
    const incentiveClaimed = await IncentiveClaim.findOne({
      product: oldProduct._id,
      status: 'Approved',
    });
    if (incentiveClaimed) {
      newProduct.incentiveEligible = false;
    } else {
      newProduct.incentiveEligible = true;
    }

    // 2. Transfer Warranty details
    newProduct.assignedWarranty = oldProduct.assignedWarranty;
    newProduct.warrantyStartDate = oldProduct.warrantyStartDate || oldProduct.createdAt;

    // 3. Transfer Ownership details based on requester's role
    newProduct.distributor = oldProduct.distributor;
    newProduct.isReplacement = true;
    newProduct.replacedFrom = oldProduct._id;
    newProduct.status = 'Active';

    // Update inventory tables
    if (replacement.requesterModel === 'Dealer') {
      // Find the DistributorDealerProduct record for the old product
      const oldDDP = await DistributorDealerProduct.findOne({ product: oldProduct._id });
      if (oldDDP) {
        // Change it to refer to the new product
        oldDDP.product = newProduct._id;
        await oldDDP.save();
      } else {
        // Create one if it didn't exist for some reason
        const newDDP = new DistributorDealerProduct({
          distributor: oldProduct.distributor,
          dealer: replacement.requestedBy,
          product: newProduct._id,
        });
        await newDDP.save();
      }
    } else if (replacement.requesterModel === 'SubDealer') {
      // Find the DealerSubDealerProduct record for the old product
      const oldDSDP = await DealerSubDealerProduct.findOne({ product: oldProduct._id });
      if (oldDSDP) {
        oldDSDP.product = newProduct._id;
        await oldDSDP.save();
      }

      // Also ensure the DistributorDealerProduct points to the new product
      const oldDDP = await DistributorDealerProduct.findOne({ product: oldProduct._id });
      if (oldDDP) {
        oldDDP.product = newProduct._id;
        await oldDDP.save();
      }
    }

    // 4. Update Old Product status to Replaced
    oldProduct.status = 'Replaced';
    oldProduct.replacedTo = newProduct._id;

    // Save products
    await oldProduct.save();
    await newProduct.save();

    // Update replacement request status
    replacement.status = 'Approved';
    replacement.newProduct = newProduct._id;
    replacement.newSerialNumber = newProduct.serialNumber;
    replacement.adminRemarks = adminRemarks || 'Approved and Assigned';
    replacement.approvedBy = adminUserId;
    replacement.assignedBy = adminUserId;
    replacement.resolvedAt = Date.now();
    replacement.statusHistory.push({
      status: 'Approved',
      changedBy: adminUserId,
      remarks: adminRemarks || 'Approved and Assigned',
    });

    await replacement.save();

    res.status(200).json({
      message: 'Replacement approved and successfully assigned',
      replacement,
    });
  } catch (error) {
    console.error('Error resolving replacement request:', error);
    res.status(500).json({ message: error.message });
  }
};
