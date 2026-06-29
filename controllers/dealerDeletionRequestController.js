import DealerDeletionRequest from '../models/DealerDeletionRequest.js';
import Dealer from '../models/Dealer.js';

export const createDealerDeletionRequest = async (req, res) => {
  try {
    const { dealerId } = req.body;
    const distributorId = req.user.distributor;

    const existingRequest = await DealerDeletionRequest.findOne({
      dealer: dealerId,
      status: 'pending',
    });
    if (existingRequest) {
      return res.status(400).json({
        message: 'A deletion request for this dealer is already pending.',
      });
    }

    const newRequest = new DealerDeletionRequest({
      dealer: dealerId,
      distributor: distributorId,
    });

    await newRequest.save();
    res
      .status(201)
      .json({ message: 'Dealer deletion request submitted successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDealerDeletionRequests = async (req, res) => {
  try {
    const requests = await DealerDeletionRequest.find({ status: 'pending' })
      .populate('dealer')
      .populate('distributor');
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const approveDealerDeletionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await DealerDeletionRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    await Dealer.findByIdAndDelete(request.dealer);
    await DealerDeletionRequest.findByIdAndDelete(id);

    res.json({ message: 'Dealer deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const declineDealerDeletionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    await DealerDeletionRequest.findByIdAndDelete(id);
    res.json({ message: 'Dealer deletion request declined.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
