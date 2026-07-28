import Product from '../models/Product.js';
import ProductReplacement from '../models/ProductReplacement.js';
import IncentiveClaim from '../models/IncentiveClaim.js';
import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import DealerSubDealerProduct from '../models/DealerSubDealerProduct.js';
import Sale from '../models/Sale.js';

/**
 * Helper to check if a product belongs to the requester based on their role (supporting both sold and unsold products)
 */
const verifyProductOwnership = async (product, user) => {
  const { role, distributor, dealer, subDealer } = user;

  // 1. If product is sold, verify using the Sale table record
  const sale = await Sale.findOne({ product: product._id });
  if (sale) {
    if (role === 'subdealer') {
      return sale.subDealer && String(sale.subDealer) === String(subDealer);
    }
    if (role === 'dealer') {
      return sale.dealer && String(sale.dealer) === String(dealer);
    }
    if (role === 'distributor') {
      return sale.distributor && String(sale.distributor) === String(distributor);
    }
    return false;
  }

  // 2. If product is unsold, check active inventory records
  if (role === 'distributor') {
    if (String(product.distributor) !== String(distributor)) return false;
    const assignedToDealer = await DistributorDealerProduct.findOne({ product: product._id });
    if (assignedToDealer) return false;
    return true;
  }

  if (role === 'dealer') {
    const assignedToMe = await DistributorDealerProduct.findOne({ dealer, product: product._id });
    if (!assignedToMe) return false;
    const assignedToSubDealer = await DealerSubDealerProduct.findOne({ product: product._id });
    if (assignedToSubDealer) return false;
    return true;
  }

  if (role === 'subdealer') {
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
      if (req.user.role !== 'dealer' && req.user.role !== 'distributor') {
        return res.status(400).json({ message: 'This product has already been replaced' });
      }
    }

    const isOwner = await verifyProductOwnership(product, req.user);
    if (!isOwner) {
      return res.status(403).json({ message: 'This product is not in your active inventory' });
    }

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

    let prefilledData = null;
    if (product.status === 'Replaced') {
      const approvedRequest = await ProductReplacement.findOne({
        oldProduct: product._id,
        status: 'Approved',
      });
      if (approvedRequest) {
        prefilledData = {
          reason: approvedRequest.reason,
          description: approvedRequest.description,
          proofImages: approvedRequest.proofImages,
        };
      }
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
      prefilledData,
    });
  } catch (error) {
    console.error('Error verifying serial number:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Submit a replacement request (hierarchical assignment)
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
      if (req.user.role !== 'dealer' && req.user.role !== 'distributor') {
        return res.status(400).json({ message: 'Product has already been replaced' });
      }
    }

    const isOwner = await verifyProductOwnership(product, req.user);
    if (!isOwner) {
      return res.status(403).json({ message: 'This product is not in your active inventory' });
    }

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

    let requesterModel = '';
    let requestedBy = null;
    let assignedTo = null;
    let assignedToModel = 'UserRole'; // Default resolves to Admin

    if (req.user.role === 'distributor') {
      requesterModel = 'Distributor';
      requestedBy = req.user.distributor;
      assignedTo = null; // Admin
      assignedToModel = 'UserRole';
    } else if (req.user.role === 'dealer') {
      requesterModel = 'Dealer';
      requestedBy = req.user.dealer;
      // Look up who sold it to this Dealer: check Sale first, then DistributorDealerProduct
      const sale = await Sale.findOne({ product: product._id });
      if (sale && sale.distributor) {
        assignedTo = sale.distributor;
        assignedToModel = 'Distributor';
      } else {
        const ddp = await DistributorDealerProduct.findOne({ product: product._id, dealer: req.user.dealer });
        if (ddp) {
          assignedTo = ddp.distributor;
          assignedToModel = 'Distributor';
        } else {
          return res.status(400).json({ message: 'Distributor assignment details not found for this product' });
        }
      }
    } else if (req.user.role === 'subdealer') {
      requesterModel = 'SubDealer';
      requestedBy = req.user.subDealer;
      // Look up who sold it to this Sub-Dealer: check Sale first, then DealerSubDealerProduct
      const sale = await Sale.findOne({ product: product._id });
      if (sale && sale.dealer) {
        assignedTo = sale.dealer;
        assignedToModel = 'Dealer';
      } else {
        const dsdp = await DealerSubDealerProduct.findOne({ product: product._id, subDealer: req.user.subDealer });
        if (dsdp) {
          assignedTo = dsdp.dealer;
          assignedToModel = 'Dealer';
        } else {
          return res.status(400).json({ message: 'Dealer assignment details not found for this product' });
        }
      }
    }

    const replacement = new ProductReplacement({
      requestedBy,
      requesterModel,
      oldProduct: product._id,
      oldSerialNumber: product.serialNumber,
      reason,
      description,
      proofImages,
      assignedTo,
      assignedToModel,
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
 * Get replacement requests (with queue routing visibility)
 */
export const getReplacementRequests = async (req, res) => {
  try {
    const { role } = req.user;
    const { type } = req.query; // 'incoming' or 'outgoing'
    let query = {};

    if (role !== 'admin' && role !== 'member') {
      let profileId = null;
      if (role === 'distributor') profileId = req.user.distributor;
      else if (role === 'dealer') profileId = req.user.dealer;
      else if (role === 'subdealer') profileId = req.user.subDealer;

      if (type === 'incoming') {
        query = { assignedTo: profileId };
      } else if (type === 'outgoing') {
        query = { requestedBy: profileId };
      } else {
        query = {
          $or: [
            { requestedBy: profileId },
            { assignedTo: profileId }
          ]
        };
      }
    } else {
      if (type === 'incoming') {
        query = { assignedToModel: 'UserRole' };
      } else if (type === 'outgoing') {
        query = { requesterModel: 'UserRole' };
      }
    }

    const replacements = await ProductReplacement.find(query)
      .populate('oldProduct')
      .populate('newProduct')
      .populate('requestedBy')
      .populate('assignedTo')
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

    // Verify authorized validator
    const { role } = req.user;
    let resolverId = req.user.id;
    let resolverModel = 'UserRole';

    if (replacement.assignedToModel === 'Dealer') {
      if (role !== 'dealer' || String(req.user.dealer) !== String(replacement.assignedTo)) {
        return res.status(403).json({ message: 'You are not authorized to resolve this request' });
      }
      resolverId = req.user.dealer;
      resolverModel = 'Dealer';
    } else if (replacement.assignedToModel === 'Distributor') {
      if (role !== 'distributor' || String(req.user.distributor) !== String(replacement.assignedTo)) {
        return res.status(403).json({ message: 'You are not authorized to resolve this request' });
      }
      resolverId = req.user.distributor;
      resolverModel = 'Distributor';
    } else {
      if (role !== 'admin' && role !== 'member') {
        return res.status(403).json({ message: 'Only admins can resolve this request' });
      }
    }

    if (action === 'Rejected') {
      replacement.status = 'Rejected';
      replacement.adminRemarks = adminRemarks || 'Rejected by resolver';
      replacement.approvedBy = resolverId;
      replacement.resolvedByModel = resolverModel;
      replacement.resolvedAt = Date.now();
      replacement.statusHistory.push({
        status: 'Rejected',
        changedBy: resolverId,
        changedByModel: resolverModel,
        remarks: adminRemarks || 'Rejected by resolver',
      });

      await replacement.save();
      return res.status(200).json({ message: 'Request rejected successfully', replacement });
    }

    // Approved:
    if (!newSerialNumber) {
      return res.status(400).json({ message: 'New Product Serial Number is required for approval' });
    }

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

    // Verify resolver inventory ownership of the replacement item
    if (resolverModel === 'Dealer') {
      const inStock = await DistributorDealerProduct.findOne({ dealer: resolverId, product: newProduct._id });
      if (!inStock) {
        return res.status(400).json({ message: 'This replacement product is not in your dealer inventory' });
      }
      const assignedToSub = await DealerSubDealerProduct.findOne({ product: newProduct._id });
      if (assignedToSub) {
        return res.status(400).json({ message: 'This replacement product is already assigned to a sub-dealer' });
      }
    } else if (resolverModel === 'Distributor') {
      if (String(newProduct.distributor) !== String(resolverId)) {
        return res.status(400).json({ message: 'This replacement product is not in your distributor inventory' });
      }
      const assignedToDealer = await DistributorDealerProduct.findOne({ product: newProduct._id });
      if (assignedToDealer) {
        return res.status(400).json({ message: 'This replacement product is already assigned to a dealer' });
      }
    } else {
      if (newProduct.distributor !== null) {
        return res.status(400).json({ message: 'This replacement product is already assigned to a distributor' });
      }
    }

    const alreadyAssignedAsReplacement = await ProductReplacement.findOne({ newProduct: newProduct._id });
    if (alreadyAssignedAsReplacement) {
      return res.status(400).json({ message: 'This replacement product has already been assigned' });
    }

    const oldProduct = await Product.findById(replacement.oldProduct);
    if (!oldProduct) {
      return res.status(404).json({ message: 'Original product not found' });
    }

    const incentiveClaimed = await IncentiveClaim.findOne({
      product: oldProduct._id,
      status: 'Approved',
    });
    newProduct.incentiveEligible = !incentiveClaimed;

    newProduct.assignedWarranty = oldProduct.assignedWarranty;
    newProduct.warrantyStartDate = oldProduct.warrantyStartDate || oldProduct.createdAt;

    // Swap Inventory / Sale / Installation records
    const sale = await Sale.findOne({ product: oldProduct._id });
    if (sale) {
      sale.product = newProduct._id;
      await sale.save();
    }

    try {
      const Installation = (await import('../models/Installation.js')).default;
      const inst = await Installation.findOne({ product: oldProduct._id });
      if (inst) {
        inst.product = newProduct._id;
        inst.serialNumber = newProduct.serialNumber;
        await inst.save();
      }
    } catch (err) {
      console.error('Error updating installation record for replacement:', err);
    }

    if (replacement.requesterModel === 'SubDealer') {
      const dsdp = await DealerSubDealerProduct.findOne({ product: oldProduct._id, subDealer: replacement.requestedBy });
      if (dsdp) {
        dsdp.product = newProduct._id;
        await dsdp.save();
      }

      const ddp = await DistributorDealerProduct.findOne({ product: oldProduct._id, dealer: resolverId });
      if (ddp) {
        ddp.product = newProduct._id;
        await ddp.save();
      }

      // Return the defective oldProduct to the Dealer's inventory so they can claim it up the chain
      // Remove any existing Sub-Dealer mapping for oldProduct
      await DealerSubDealerProduct.deleteMany({ product: oldProduct._id });
      // Create a DistributorDealerProduct mapping for oldProduct pointing to the resolving Dealer
      const returnedDDP = new DistributorDealerProduct({
        distributor: oldProduct.distributor,
        dealer: resolverId, // the resolving Dealer
        product: oldProduct._id,
      });
      await returnedDDP.save();

    } else if (replacement.requesterModel === 'Dealer') {
      const ddp = await DistributorDealerProduct.findOne({ product: oldProduct._id, dealer: replacement.requestedBy });
      if (ddp) {
        ddp.product = newProduct._id;
        await ddp.save();
      }

      // Return the defective oldProduct to the Distributor's inventory
      // Delete any Dealer inventory mappings for oldProduct
      await DistributorDealerProduct.deleteMany({ product: oldProduct._id });
      // Assign the oldProduct back to the resolving Distributor
      oldProduct.distributor = resolverId; // the resolving Distributor

    } else if (replacement.requesterModel === 'Distributor') {
      // Return the defective oldProduct back to the Factory / Admin
      oldProduct.distributor = null;
    }

    oldProduct.status = 'Replaced';
    oldProduct.replacedTo = newProduct._id;

    newProduct.isReplacement = true;
    newProduct.replacedFrom = oldProduct._id;
    newProduct.distributor = oldProduct.distributor;
    newProduct.status = 'Active';
    if (oldProduct.sold) {
      newProduct.sold = true;
      newProduct.saleDate = oldProduct.saleDate;
    }

    await oldProduct.save();
    await newProduct.save();

    replacement.status = 'Approved';
    replacement.newProduct = newProduct._id;
    replacement.newSerialNumber = newProduct.serialNumber;
    replacement.adminRemarks = adminRemarks || 'Approved and Assigned';
    replacement.approvedBy = resolverId;
    replacement.assignedBy = resolverId;
    replacement.resolvedByModel = resolverModel;
    replacement.resolvedAt = Date.now();
    replacement.statusHistory.push({
      status: 'Approved',
      changedBy: resolverId,
      changedByModel: resolverModel,
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

/**
 * Get available stock of the same model for replacement based on the resolver's role
 */
export const getAvailableStockForReplacement = async (req, res) => {
  try {
    const { id } = req.params;
    const replacement = await ProductReplacement.findById(id).populate('oldProduct');
    if (!replacement) {
      return res.status(404).json({ message: 'Replacement request not found' });
    }

    const oldProduct = replacement.oldProduct;
    if (!oldProduct) {
      return res.status(404).json({ message: 'Original product not found' });
    }

    const { role } = req.user;
    let resolverId = req.user.id;
    let resolverModel = 'UserRole';

    if (replacement.assignedToModel === 'Dealer') {
      if (role !== 'dealer' || String(req.user.dealer) !== String(replacement.assignedTo)) {
        return res.status(403).json({ message: 'You are not authorized to access this resource' });
      }
      resolverId = req.user.dealer;
      resolverModel = 'Dealer';
    } else if (replacement.assignedToModel === 'Distributor') {
      if (role !== 'distributor' || String(req.user.distributor) !== String(replacement.assignedTo)) {
        return res.status(403).json({ message: 'You are not authorized to access this resource' });
      }
      resolverId = req.user.distributor;
      resolverModel = 'Distributor';
    } else {
      if (role !== 'admin' && role !== 'member') {
        return res.status(403).json({ message: 'Only admins can access this resource' });
      }
    }

    // Query candidates of the same model that are Active and unsold
    const candidates = await Product.find({
      model: oldProduct.model,
      status: 'Active',
      sold: false,
    });

    const available = [];
    for (const prod of candidates) {
      const used = await ProductReplacement.findOne({ newProduct: prod._id });
      if (used) continue;

      if (resolverModel === 'Dealer') {
        const inStock = await DistributorDealerProduct.findOne({ dealer: resolverId, product: prod._id });
        if (!inStock) continue;
        const assignedToSub = await DealerSubDealerProduct.findOne({ product: prod._id });
        if (assignedToSub) continue;
      } else if (resolverModel === 'Distributor') {
        if (String(prod.distributor) !== String(resolverId)) continue;
        const assignedToDealer = await DistributorDealerProduct.findOne({ product: prod._id });
        if (assignedToDealer) continue;
      } else {
        if (prod.distributor !== null) continue;
      }

      available.push({
        _id: prod._id,
        serialNumber: prod.serialNumber,
      });
    }

    res.status(200).json(available);
  } catch (error) {
    console.error('Error fetching available replacement stock:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get defective stock (status === 'Replaced') currently in the user's active inventory
 */
export const getMyDefectiveStock = async (req, res) => {
  try {
    const { role } = req.user;
    let profileId = null;

    if (role === 'distributor') profileId = req.user.distributor;
    else if (role === 'dealer') profileId = req.user.dealer;
    else {
      return res.status(200).json([]);
    }

    // Find all products with status Replaced
    const replacedProducts = await Product.find({ status: 'Replaced' }).populate('category model');

    const myDefective = [];
    for (const prod of replacedProducts) {
      if (role === 'dealer') {
        const inStock = await DistributorDealerProduct.findOne({ dealer: profileId, product: prod._id });
        if (!inStock) continue;
        const assignedToSub = await DealerSubDealerProduct.findOne({ product: prod._id });
        if (assignedToSub) continue;
      } else if (role === 'distributor') {
        if (String(prod.distributor) !== String(profileId)) continue;
        const assignedToDealer = await DistributorDealerProduct.findOne({ product: prod._id });
        if (assignedToDealer) continue;
      }

      // Check if there is an active pending request for this defective product
      const pending = await ProductReplacement.findOne({ oldProduct: prod._id, status: 'Pending' });
      if (pending) continue;

      myDefective.push({
        _id: prod._id,
        serialNumber: prod.serialNumber,
        productName: prod.productName,
        model: prod.model?.name || 'N/A',
      });
    }

    res.status(200).json(myDefective);
  } catch (error) {
    console.error('Error fetching my defective stock:', error);
    res.status(500).json({ message: error.message });
  }
};
