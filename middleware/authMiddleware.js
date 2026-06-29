import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import {
  validateJWTSecret,
  createSecureErrorResponse,
} from '../utils/security.js';

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token provided');
      }

      const jwtSecret = validateJWTSecret();
      const decoded = jwt.verify(token, jwtSecret);

      // Validate decoded token structure
      if (!decoded.id || !decoded.role) {
        res.status(401);
        throw new Error('Invalid token structure');
      }

      req.user = decoded;
      next();
    } catch (error) {
      console.error('JWT verification failed:', error.name);
      res
        .status(401)
        .json(createSecureErrorResponse('Not authorized, token failed', 401));
      return;
    }
  } else {
    res
      .status(401)
      .json(createSecureErrorResponse('Not authorized, no token', 401));
    return;
  }
});

const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      res
        .status(403)
        .json(
          createSecureErrorResponse('Access denied, invalid user data', 403)
        );
      return;
    }

    if (!roles.includes(req.user.role)) {
      res
        .status(403)
        .json(
          createSecureErrorResponse('Not authorized to access this route', 403)
        );
      return;
    }
    next();
  };
};

export { protect, authorize };
