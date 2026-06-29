import crypto from 'crypto';
import validator from 'validator';

// Generate secure random password
export const generateSecurePassword = (length = 16) => {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Sanitize user input to prevent XSS
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return validator.escape(input.trim());
};

// Validate JWT secret strength
export const validateJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return secret;
};

// Rate limiting helper
export const createRateLimitKey = (ip, identifier) => {
  return `rate_limit:${ip}:${identifier}`;
};

// Secure error response
export const createSecureErrorResponse = (message, statusCode = 500) => {
  return {
    success: false,
    message: sanitizeInput(message),
    timestamp: new Date().toISOString(),
  };
};

// Validate role enum
export const validateRole = (role) => {
  const validRoles = [
    'admin',
    'factory',
    'distributor',
    'dealer',
    'subdealer',
    'member',
  ];
  return validRoles.includes(role);
};
