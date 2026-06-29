import CustomerChangeRequest from '../models/CustomerChangeRequest.js';
import Sale from '../models/Sale.js';
import Distributor from '../models/Distributor.js';
import Dealer from '../models/Dealer.js';
import SubDealer from '../models/SubDealer.js';

// Create a new customer change request
export const createChangeRequest = async (req, res) => {
  try {
    const { saleId, requestedChanges, reason } = req.body;
    const { user } = req;

    // Get the sale to store original data
    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Determine the requester model based on user role
    let requestedByModel;
    let requestedBy;
    let requestedByName;

    // console.log('User object in createChangeRequest:', JSON.stringify(user, null, 2));

    if (user.role === 'distributor') {
      requestedByModel = 'Distributor';
      requestedBy = user.distributor;
      const distributor =
        await Distributor.findById(requestedBy).select('name');
      // console.log('Found distributor:', distributor);
      if (!distributor) {
        const distributorByUsername = await Distributor.findOne({
          username: user.username,
        }).select('name _id');
        // console.log('Found distributor by username:', distributorByUsername);
        if (distributorByUsername) {
          requestedBy = distributorByUsername._id;
          requestedByName = distributorByUsername.name;
        } else {
          requestedByName = 'Unknown Distributor';
        }
      } else {
        requestedByName = distributor.name;
      }
    } else if (user.role === 'dealer') {
      requestedByModel = 'Dealer';
      requestedBy = user.dealer;
      const dealer = await Dealer.findById(requestedBy).select('name');
      // console.log('Found dealer:', dealer);
      if (!dealer) {
        const dealerByUsername = await Dealer.findOne({
          username: user.username,
        }).select('name _id');
        // console.log('Found dealer by username:', dealerByUsername);
        if (dealerByUsername) {
          requestedBy = dealerByUsername._id;
          requestedByName = dealerByUsername.name;
        } else {
          requestedByName = 'Unknown Dealer';
        }
      } else {
        requestedByName = dealer.name;
      }
    } else if (user.role === 'subdealer') {
      requestedByModel = 'SubDealer';
      requestedBy = user.subDealer;
      const subDealer = await SubDealer.findById(requestedBy).select('name');
      // console.log('Found subDealer:', subDealer);
      if (!subDealer) {
        const subDealerByUsername = await SubDealer.findOne({
          username: user.username,
        }).select('name _id');
        // console.log('Found subDealer by username:', subDealerByUsername);
        if (subDealerByUsername) {
          requestedBy = subDealerByUsername._id;
          requestedByName = subDealerByUsername.name;
        } else {
          requestedByName = 'Unknown SubDealer';
        }
      } else {
        requestedByName = subDealer.name;
      }
    } else {
      return res
        .status(403)
        .json({ message: 'Unauthorized to create change requests' });
    }

    const changeRequest = new CustomerChangeRequest({
      sale: saleId,
      requestedBy,
      requestedByModel,
      requestedByName,
      originalData: {
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        customerAddress: sale.customerAddress,
        plumberName: sale.plumberName,
      },
      requestedChanges,
      reason,
    });

    await changeRequest.save();
    res.status(201).json({
      message: 'Change request submitted successfully',
      request: changeRequest,
    });
  } catch (error) {
    console.error('Error creating change request:', error);
    console.error('User object:', user);
    console.error('Request body:', req.body);
    res.status(500).json({ message: 'Error creating change request' });
  }
};

// Get all pending change requests (Admin only)
export const getPendingRequests = async (req, res) => {
  try {
    const requests = await CustomerChangeRequest.find({ status: 'pending' })
      .populate('sale')
      .sort({ createdAt: -1 });

    // Update existing requests that don't have requestedByName
    for (let request of requests) {
      if (!request.requestedByName) {
        let name = 'Unknown';
        if (request.requestedByModel === 'Distributor') {
          const distributor = await Distributor.findById(
            request.requestedBy
          ).select('name');
          name = distributor?.name || 'Unknown Distributor';
        } else if (request.requestedByModel === 'Dealer') {
          const dealer = await Dealer.findById(request.requestedBy).select(
            'name'
          );
          name = dealer?.name || 'Unknown Dealer';
        } else if (request.requestedByModel === 'SubDealer') {
          const subDealer = await SubDealer.findById(
            request.requestedBy
          ).select('name');
          name = subDealer?.name || 'Unknown SubDealer';
        }
        request.requestedByName = name;
        await request.save();
      }
    }

    res.json(requests);
  } catch (error) {
    console.error('Error fetching change requests:', error);
    res.status(500).json({ message: 'Error fetching change requests' });
  }
};

// Get user's own change requests
export const getMyRequests = async (req, res) => {
  try {
    const { user } = req;
    let requestedBy;

    if (user.role === 'distributor') {
      requestedBy = user.distributor;
    } else if (user.role === 'dealer') {
      requestedBy = user.dealer;
    } else if (user.role === 'subdealer') {
      requestedBy = user.subDealer;
    } else {
      requestedBy = user.id;
    }

    const requests = await CustomerChangeRequest.find({ requestedBy })
      .populate('sale')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching user requests:', error);
    res.status(500).json({ message: 'Error fetching user requests' });
  }
};

// Approve a change request (Admin only)
export const approveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { adminResponse } = req.body;

    const changeRequest =
      await CustomerChangeRequest.findById(requestId).populate('sale');
    if (!changeRequest) {
      return res.status(404).json({ message: 'Change request not found' });
    }

    if (changeRequest.status !== 'pending') {
      return res
        .status(400)
        .json({ message: 'Request has already been processed' });
    }

    // Update the sale with the requested changes
    const sale = changeRequest.sale;
    if (changeRequest.requestedChanges.customerName !== undefined) {
      sale.customerName = changeRequest.requestedChanges.customerName;
    }
    if (changeRequest.requestedChanges.customerPhone !== undefined) {
      sale.customerPhone = changeRequest.requestedChanges.customerPhone;
    }
    if (changeRequest.requestedChanges.customerAddress !== undefined) {
      sale.customerAddress = changeRequest.requestedChanges.customerAddress;
    }
    if (changeRequest.requestedChanges.plumberName !== undefined) {
      sale.plumberName = changeRequest.requestedChanges.plumberName;
    }

    await sale.save();

    // Update the change request status
    changeRequest.status = 'approved';
    changeRequest.adminResponse = adminResponse;
    changeRequest.processedAt = new Date();
    await changeRequest.save();

    res.json({
      message: 'Change request approved and sale updated',
      request: changeRequest,
    });
  } catch (error) {
    console.error('Error approving change request:', error);
    res.status(500).json({ message: 'Error approving change request' });
  }
};

// Reject a change request (Admin only)
export const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { adminResponse } = req.body;

    const changeRequest = await CustomerChangeRequest.findById(requestId);
    if (!changeRequest) {
      return res.status(404).json({ message: 'Change request not found' });
    }

    if (changeRequest.status !== 'pending') {
      return res
        .status(400)
        .json({ message: 'Request has already been processed' });
    }

    changeRequest.status = 'rejected';
    changeRequest.adminResponse = adminResponse || 'Request rejected';
    changeRequest.processedAt = new Date();
    await changeRequest.save();

    res.json({ message: 'Change request rejected', request: changeRequest });
  } catch (error) {
    console.error('Error rejecting change request:', error);
    res.status(500).json({ message: 'Error rejecting change request' });
  }
};
