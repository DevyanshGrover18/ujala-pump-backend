import AccountsMember from '../models/AccountsMember.js';
import User from '../models/User.js';

export const getAccountsMembers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { contactPerson: { $regex: search, $options: 'i' } },
          { state: { $regex: search, $options: 'i' } },
          { district: { $regex: search, $options: 'i' } },
        ],
      };
    }

    const members = await AccountsMember.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(members);
  } catch (error) {
    console.error('getAccountsMembers error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const createAccountsMember = async (req, res) => {
  try {
    const {
      name,
      email,
      addressLine1,
      addressLine2,
      username,
      password,
      state,
      district,
      location,
      pincode,
      gstNumber,
      contactPerson,
      contactPhone,
    } = req.body;

    if (!password || password.length < 8) {
      return res
        .status(400)
        .json({ message: 'Password must be at least 8 characters' });
    }

    // Check username uniqueness
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Generate accountsId
    const latest = await AccountsMember.findOne().sort({ accountsId: -1 });
    let newAccountsId;
    if (latest && latest.accountsId) {
      const lastNumber = parseInt(latest.accountsId.replace('ACC', ''));
      newAccountsId = `ACC${String(lastNumber + 1).padStart(5, '0')}`;
    } else {
      newAccountsId = 'ACC00001';
    }

    // Create AccountsMember document
    const member = new AccountsMember({
      name,
      email,
      addressLine1,
      addressLine2,
      username,
      password,
      state,
      district,
      location,
      pincode,
      gstNumber,
      contactPerson,
      contactPhone,
      accountsId: newAccountsId,
    });

    const savedMember = await member.save();

    // Create User record linked to this member
    await User.create({
      username,
      password,
      role: 'accounts',
      accountsMember: savedMember._id,
    });

    res.status(201).json(savedMember);
  } catch (error) {
    console.error('createAccountsMember error:', error);
    res.status(400).json({ message: error.message });
  }
};

export const updateAccountsMember = async (req, res) => {
  try {
    const member = await AccountsMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: 'Accounts member not found' });
    }

    const { username, password, ...updateData } = req.body;

    // Handle username change
    if (username && username !== member.username) {
      const userExists = await User.findOne({
        username,
        _id: { $ne: member._id },
      });
      if (userExists) {
        return res.status(400).json({ message: 'Username already taken' });
      }
      updateData.username = username;
      await User.findOneAndUpdate({ accountsMember: member._id }, { username });
    }

    // Handle password change
    if (password) {
      member.set({ ...updateData, password });
      await member.save();

      const user = await User.findOne({ accountsMember: member._id });
      if (user) {
        user.password = password;
        await user.save();
      }
    } else {
      await AccountsMember.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      });
    }

    const updated = await AccountsMember.findById(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('updateAccountsMember error:', error);
    res.status(400).json({ message: error.message });
  }
};

export const deleteAccountsMember = async (req, res) => {
  try {
    const member = await AccountsMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: 'Accounts member not found' });
    }

    // Delete linked User
    await User.findOneAndDelete({ accountsMember: member._id });
    await AccountsMember.findByIdAndDelete(req.params.id);

    res.json({ message: 'Accounts member deleted successfully' });
  } catch (error) {
    console.error('deleteAccountsMember error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const deleteMultipleAccountsMembers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No member IDs provided' });
    }

    // Delete linked Users and AccountsMember documents
    await User.deleteMany({ accountsMember: { $in: ids } });
    const result = await AccountsMember.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} accounts member(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('deleteMultipleAccountsMembers error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const updateAccountsMemberStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const member = await AccountsMember.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!member) {
      return res.status(404).json({ message: 'Accounts member not found' });
    }

    // Sync isActive on User
    await User.findOneAndUpdate(
      { accountsMember: member._id },
      { isActive: status === 'Active' }
    );

    res.json(member);
  } catch (error) {
    console.error('updateAccountsMemberStatus error:', error);
    res.status(500).json({ message: error.message });
  }
};
