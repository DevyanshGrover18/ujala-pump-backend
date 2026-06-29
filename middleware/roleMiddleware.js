import jwt from 'jsonwebtoken';
import UserRole from '../models/UserRole.js';
import User from '../models/User.js';
import {
  validateJWTSecret,
  sanitizeInput,
  createSecureErrorResponse,
  validateRole,
} from '../utils/security.js';

// Define role permissions at module level to avoid duplication
const ROLE_PERMISSIONS = {
  admin: {
    management: { add: true, modify: true, delete: true, full: true },
    factories: { add: true, modify: true, delete: true, full: true },
    orders: { add: true, modify: true, delete: true, full: true },
    products: { add: true, modify: true, delete: true, full: true },
    distributors: { add: true, modify: true, delete: true, full: true },
    dealers: { add: true, modify: true, delete: true, full: true },
    sales: { add: true, modify: true, delete: true, full: true },
    subDealers: { add: true, modify: true, delete: true, full: true },
  },
  factory: {
    orders: { add: true, modify: true, delete: true, full: true },
    products: { add: true, modify: true, delete: true, full: true },
    sales: { add: false, modify: false, delete: false, full: false },
  },
  distributor: {
    dealers: { add: true, modify: true, delete: true, full: true },
    subDealers: { add: true, modify: true, delete: true, full: true },
    products: { add: false, modify: true, delete: false, full: false },
    sales: { add: false, modify: false, delete: false, full: false },
  },
  dealer: {
    subDealers: { add: true, modify: true, delete: true, full: true },
    products: { add: false, modify: false, delete: false, full: false },
    sales: { add: false, modify: false, delete: false, full: false },
  },
  subdealer: {
    sales: { add: false, modify: false, delete: false, full: false },
  },
  executive: {
    distributors: { add: false, modify: false, delete: false, full: false, view: true },
    dealers: { add: false, modify: false, delete: false, full: false, view: true },
    subDealers: { add: false, modify: false, delete: false, full: false, view: true },
    sales: { add: false, modify: false, delete: false, full: false, view: true },
    products: { add: false, modify: false, delete: false, full: false, view: true },
    orders: { add: false, modify: false, delete: false, full: false, view: true },
  },
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : authHeader;

  if (!token) {
    return res
      .status(401)
      .json(
        createSecureErrorResponse('Access denied. No token provided.', 401)
      );
  }

  try {
    const jwtSecret = validateJWTSecret();
    const decoded = jwt.verify(token, jwtSecret);

    // Validate token structure and sanitize role
    if (!decoded.id || !decoded.role) {
      return res
        .status(401)
        .json(createSecureErrorResponse('Invalid token structure.', 401));
    }

    // Validate and sanitize role
    const sanitizedRole = sanitizeInput(decoded.role);
    if (!validateRole(sanitizedRole)) {
      return res
        .status(401)
        .json(createSecureErrorResponse('Invalid role in token.', 401));
    }

    req.user = {
      ...decoded,
      role: sanitizedRole,
    };
    next();
  } catch (error) {
    console.error('Token verification failed:', error.name);
    res.status(401).json(createSecureErrorResponse('Invalid token.', 401));
  }
};

const checkPermission = (section, permission) => {
  return async (req, res, next) => {
    try {
      const user = await UserRole.findById(req.user.id);

      if (user) {
        if (!user.isActive) {
          return res
            .status(403)
            .json(createSecureErrorResponse('User account is inactive.', 403));
        }

        const hasAccess = user.hasPermission(section, permission);
        if (!hasAccess) {
          return res
            .status(403)
            .json(
              createSecureErrorResponse(
                `Access denied. Insufficient permissions for ${sanitizeInput(section)} ${sanitizeInput(permission)}.`,
                403
              )
            );
        }

        req.userPermissions = user.accessControl;
        return next();
      }

      // Use role-based permissions for basic users
      const { role } = req.user;
      const rolePerms = ROLE_PERMISSIONS[role];

      if (rolePerms && rolePerms[section]) {
        const sectionPerms = rolePerms[section];
        if (sectionPerms.full || sectionPerms[permission]) {
          req.userPermissions = rolePerms;
          return next();
        }
      }

      return res
        .status(403)
        .json(
          createSecureErrorResponse(
            'Access denied. Insufficient permissions.',
            403
          )
        );
    } catch (error) {
      console.error('Permission check error:', error.name);
      res
        .status(500)
        .json(createSecureErrorResponse('Error checking permissions.', 500));
    }
  };
};

// Helper middleware to check multiple permissions
const checkMultiplePermissions = (permissionsArray) => {
  return async (req, res, next) => {
    try {
      const user = await UserRole.findById(req.user.id);

      if (!user) {
        return res
          .status(404)
          .json(createSecureErrorResponse('User not found.', 404));
      }

      if (!user.isActive) {
        return res
          .status(403)
          .json(createSecureErrorResponse('User account is inactive.', 403));
      }

      const hasAllPermissions = permissionsArray.every(
        ({ section, permission }) => user.hasPermission(section, permission)
      );

      if (!hasAllPermissions) {
        return res
          .status(403)
          .json(
            createSecureErrorResponse(
              'Access denied. Insufficient permissions.',
              403
            )
          );
      }

      req.userPermissions = user.accessControl;
      next();
    } catch (error) {
      console.error('Multiple permissions check error:', error.name);
      res
        .status(500)
        .json(createSecureErrorResponse('Error checking permissions.', 500));
    }
  };
};

const checkSectionAccess = (section) => {
  return async (req, res, next) => {
    try {
      const userRole = await UserRole.findById(req.user.id);

      if (userRole) {
        if (!userRole.isActive) {
          return res
            .status(403)
            .json(createSecureErrorResponse('User account is inactive.', 403));
        }

        const hasAccess = userRole.hasAccessToSection(section);
        if (!hasAccess) {
          return res
            .status(403)
            .json(
              createSecureErrorResponse(
                'Access denied. You do not have permission to view this section.',
                403
              )
            );
        }

        req.userPermissions = userRole.accessControl;
        return next();
      }

      // Use role-based permissions for basic users
      const { role } = req.user;
      const sectionAccess = {
        admin: [
          'management',
          'factories',
          'orders',
          'products',
          'distributors',
          'dealers',
          'sales',
          'subDealers',
        ],
        factory: ['orders', 'products', 'sales'],
        distributor: ['dealers', 'subDealers', 'products', 'sales'],
        dealer: ['subDealers', 'products', 'sales'],
        subdealer: ['sales'],
        executive: [
          'distributors',
          'dealers',
          'subDealers',
          'sales',
          'products',
          'orders',
        ],
      };

      if (sectionAccess[role] && sectionAccess[role].includes(section)) {
        req.userPermissions = ROLE_PERMISSIONS[role];
        return next();
      }

      return res
        .status(403)
        .json(
          createSecureErrorResponse(
            'Access denied. Insufficient permissions for this section.',
            403
          )
        );
    } catch (error) {
      console.error('Section access check error:', error.name);
      res
        .status(500)
        .json(createSecureErrorResponse('Error checking permissions.', 500));
    }
  };
};

export {
  verifyToken,
  checkPermission,
  checkMultiplePermissions,
  checkSectionAccess,
};
