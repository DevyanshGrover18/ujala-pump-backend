import User from '../models/User.js';
import UserRole from '../models/UserRole.js';
import Factory from '../models/Factory.js';
import Distributor from '../models/Distributor.js';
import PasswordResetRequest from '../models/PasswordResetRequest.js';
import jwt from 'jsonwebtoken';
import {
  generateSecurePassword,
  sanitizeInput,
  validateJWTSecret,
  createSecureErrorResponse,
} from '../utils/security.js';

const generateToken = (id, role, distributor, factory, dealer, subDealer) => {
  const jwtSecret = validateJWTSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '6h';

  return jwt.sign(
    { id, role, distributor, factory, dealer, subDealer },
    jwtSecret,
    { expiresIn }
  );
};

// Helper function to find user by role
const findUserByRole = async (username, role) => {
  const sanitizedUsername = sanitizeInput(username).toLowerCase();
  const sanitizedRole = sanitizeInput(role);

  const query = {
    username: sanitizedUsername,
    role: sanitizedRole,
    isActive: true,
  };

  switch (sanitizedRole) {
    case 'factory':
      return await User.findOne(query).populate('factory').select('+password');
    case 'distributor':
      return await User.findOne(query)
        .populate('distributor')
        .select('+password');
    case 'dealer':
      return await User.findOne(query).populate('dealer').select('+password');
    case 'subdealer':
      return await User.findOne(query)
        .populate('subDealer')
        .select('+password');
    case 'executive':
      return await User.findOne(query)
        .populate('executive')
        .select('+password');
    default:
      return await User.findOne(query).select('+password');
  }
};

export const login = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Input validation
    if (!username || !password || !role) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse(
            'Username, password, and role are required',
            400
          )
        );
    }

    const sanitizedUsername = sanitizeInput(username).toLowerCase();
    const sanitizedRole = sanitizeInput(role);

    let user = await findUserByRole(sanitizedUsername, sanitizedRole);
    let isUserRole = false;

    // If not found in User collection, try UserRole collection
    if (!user) {
      user = await UserRole.findOne({
        username: sanitizedUsername,
        isActive: true,
      }).select('+password');
      isUserRole = true;
    }

    if (!user) {
      return res
        .status(401)
        .json(createSecureErrorResponse('Invalid credentials', 401));
    }

    // Check if account is locked
    if (user.isLocked) {
      return res
        .status(423)
        .json(
          createSecureErrorResponse(
            'Account is temporarily locked due to too many failed login attempts',
            423
          )
        );
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res
        .status(401)
        .json(createSecureErrorResponse('Invalid credentials', 401));
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate response based on user type
    if (isUserRole) {
      const userData = {
        id: user._id,
        username: user.username,
        role: 'member',
        accessControl: user.accessControl,
        privileges: user.accessControl,
        token: generateToken(user._id, 'member'),
      };
      return res.json({ user: userData });
    }

    const userData = {
      id: user._id,
      username: user.username,
      role: user.role,
      factory: user.factory,
      distributor: user.distributor,
      dealer: user.dealer,
      subDealer: user.subDealer,
      executive: user.executive,
      token: generateToken(
        user._id,
        user.role,
        user.distributor?._id,
        user.factory?._id,
        user.dealer?._id,
        user.subDealer?._id
      ),
    };

    res.json({ user: userData });
  } catch (error) {
    console.error('Login error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error during login', 500));
  }
};

export const createDefaultUsers = async (req, res) => {
  try {
    const adminPassword =
      process.env.DEFAULT_ADMIN_PASSWORD || generateSecurePassword();
    const factoryPassword =
      process.env.DEFAULT_FACTORY_PASSWORD || generateSecurePassword();
    const distributorPassword =
      process.env.DEFAULT_DISTRIBUTOR_PASSWORD || generateSecurePassword();

    // Create admin user
    const adminExists = await User.findOne({
      username: 'admin',
      role: 'admin',
    });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: adminPassword,
        role: 'admin',
      });
      console.log('Admin user created with password:', adminPassword);
    }

    // Create factory users for each factory
    const factories = await Factory.find();
    for (const factory of factories) {
      const factoryUsername = `factory_${factory.name.toLowerCase().replace(/\s+/g, '_')}`;
      const factoryUserExists = await User.findOne({
        username: factoryUsername,
        role: 'factory',
      });

      if (!factoryUserExists) {
        await User.create({
          username: factoryUsername,
          password: factoryPassword,
          role: 'factory',
          factory: factory._id,
        });
        console.log(
          `Factory user created: ${factoryUsername} with password:`,
          factoryPassword
        );
      }
    }

    // Create distributor users for each distributor
    const distributors = await Distributor.find();
    for (const distributor of distributors) {
      const distributorUsername = `distributor_${distributor.name.toLowerCase().replace(/\s+/g, '_')}`;
      const distributorUserExists = await User.findOne({
        username: distributorUsername,
        role: 'distributor',
      });

      if (!distributorUserExists) {
        await User.create({
          username: distributorUsername,
          password: distributorPassword,
          role: 'distributor',
          distributor: distributor._id,
        });
        console.log(
          `Distributor user created: ${distributorUsername} with password:`,
          distributorPassword
        );
      }
    }

    res.json({
      message: 'Default users created successfully',
      note: 'Check server logs for generated passwords',
    });
  } catch (error) {
    console.error('Error creating default users:', error.name, error.message);
    res
      .status(500)
      .json(
        createSecureErrorResponse('Server error creating default users', 500)
      );
  }
};

export const getFactoryUsers = async (req, res) => {
  try {
    const factoryUsers = await User.find({ role: 'factory' }).populate(
      'factory'
    );
    res.json(factoryUsers);
  } catch (error) {
    console.error('Error fetching factory users:', error.name, error.message);
    res
      .status(500)
      .json(
        createSecureErrorResponse('Server error fetching factory users', 500)
      );
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { username, role } = req.body;

    if (!username || !role) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Username and role are required', 400));
    }

    const sanitizedUsername = sanitizeInput(username).toLowerCase();
    const sanitizedRole = sanitizeInput(role);

    const user = await findUserByRole(sanitizedUsername, sanitizedRole);
    if (!user) {
      return res
        .status(404)
        .json(
          createSecureErrorResponse(`${sanitizedRole} user not found`, 404)
        );
    }

    const existingRequest = await PasswordResetRequest.findOne({
      username: sanitizedUsername,
      status: 'pending',
      role: sanitizedRole,
    });

    if (existingRequest) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse(
            'Password reset request already pending',
            400
          )
        );
    }

    const newRequestData = {
      username: sanitizedUsername,
      role: sanitizedRole,
    };

    if (sanitizedRole === 'factory') {
      newRequestData.factory = user.factory._id;
    } else if (sanitizedRole === 'distributor') {
      newRequestData.distributor = user.distributor._id;
    } else if (sanitizedRole === 'dealer') {
      newRequestData.dealer = user.dealer._id;
    }

    await PasswordResetRequest.create(newRequestData);

    res.json({ message: 'Password reset request sent to admin' });
  } catch (error) {
    console.error('Password reset request error:', error.name, error.message);
    res
      .status(500)
      .json(
        createSecureErrorResponse(
          'Server error processing password reset request',
          500
        )
      );
  }
};

export const getPasswordResetRequests = async (req, res) => {
  try {
    const requests = await PasswordResetRequest.find({ status: 'pending' })
      .populate('factory')
      .populate('distributor')
      .sort({ requestedAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error(
      'Error fetching password reset requests:',
      error.name,
      error.message
    );
    res
      .status(500)
      .json(createSecureErrorResponse('Server error fetching requests', 500));
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { requestId, newPassword } = req.body;

    if (!requestId || !newPassword) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse(
            'Request ID and new password are required',
            400
          )
        );
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse(
            'Password must be at least 8 characters long',
            400
          )
        );
    }

    const request = await PasswordResetRequest.findById(requestId);
    if (!request || request.status !== 'pending') {
      return res
        .status(404)
        .json(createSecureErrorResponse('Invalid or completed request', 404));
    }

    // Fetch user and save to trigger pre-save middleware for password hashing
    const user = await User.findOne(
      { username: request.username, role: request.role }
    );
    if (!user) {
      return res
        .status(404)
        .json(createSecureErrorResponse('User not found', 404));
    }
    user.password = newPassword;
    await user.save();

    request.status = 'completed';
    request.completedAt = new Date();
    await request.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error resetting password', 500));
  }
};

export const declinePasswordResetRequest = async (req, res) => {
  try {
    const { id } = req.params;
    await PasswordResetRequest.findByIdAndDelete(id);
    res.json({ message: 'Password reset request declined' });
  } catch (error) {
    console.error(
      'Decline password reset request error:',
      error.name,
      error.message
    );
    res
      .status(500)
      .json(createSecureErrorResponse('Server error declining request', 500));
  }
};
