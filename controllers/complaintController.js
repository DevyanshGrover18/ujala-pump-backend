import Complaint from '../models/Complaint.js';
import Plumber from '../models/Plumber.js';

export const createComplaint = async (req, res) => {
  try {
    const { serialNumber, motorDetails, additionalDetails } = req.body;

    if (!serialNumber || !motorDetails) {
      return res.status(400).json({ message: 'Serial number and motor details are required' });
    }

    const plumberId = req.user.plumber;
    const plumber = await Plumber.findById(plumberId);
    if (!plumber) {
      return res.status(404).json({ message: 'Plumber profile not found' });
    }

    const complaint = new Complaint({
      plumber: plumber._id,
      serialNumber,
      motorDetails,
      additionalDetails,
    });

    const savedComplaint = await complaint.save();
    res.status(201).json({
      message: 'Complaint registered successfully',
      complaint: savedComplaint,
    });
  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(400).json({ message: error.message });
  }
};

export const getMyComplaints = async (req, res) => {
  try {
    const plumberId = req.user.plumber;
    const complaints = await Complaint.find({ plumber: plumberId }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getComplaints = async (req, res) => {
  // Admin view
  try {
    const complaints = await Complaint.find()
      .populate('plumber', 'name plumberId phone')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    console.error('Error fetching all complaints:', error);
    res.status(500).json({ message: error.message });
  }
};

export const resolveComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    complaint.status = 'Resolved';
    const updatedComplaint = await complaint.save();
    res.json({
      message: 'Complaint marked as resolved',
      complaint: updatedComplaint,
    });
  } catch (error) {
    console.error('Error resolving complaint:', error);
    res.status(400).json({ message: error.message });
  }
};
