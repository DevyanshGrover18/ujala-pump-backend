import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { validateJWTSecret } from './utils/security.js';

// Import routes
import orderRoutes from './routes/ordersRoutes.js';
import factoryRoutes from './routes/factoryRoutes.js';
import distributorRoutes from './routes/distributorRoutes.js';
import distributorSalesRoutes from './routes/distributorSalesRoutes.js';
import productRoutes from './routes/productRoutes.js';
import dealerRoutes from './routes/dealerRoutes.js';
import subDealerRoutes from './routes/subDealerRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import distributorProductRoutes from './routes/distributorProductRoutes.js';
import dealerProductRoutes from './routes/dealerProductRoutes.js';
import distributorDealerProductRoutes from './routes/distributorDealerProductRoutes.js';
import dealerSubDealerProductRoutes from './routes/dealerSubDealerProductRoutes.js';
import factoryOrderRoutes from './routes/factoryOrderRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import modelRoutes from './routes/modelRoutes.js';
import pdfRoutes from './routes/pdfRoutes.js';
import qrRoutes from './routes/qrRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import locationRoutes from './routes/locationRoutes.js';
import distributorRequestRoutes from './routes/distributorRequestRoutes.js';
import dealerDeletionRequestRoutes from './routes/dealerDeletionRequestRoutes.js';
import customerChangeRequestRoutes from './routes/customerChangeRequestRoutes.js';
import warrantyStickerRoutes from './routes/warrantyStickerRoutes.js';
import executiveRoutes from './routes/executiveRoutes.js';
import incentiveRoutes from './routes/incentiveRoutes.js';

dotenv.config();

// Validate environment variables
try {
  validateJWTSecret();
} catch (error) {
  console.error('Environment validation failed:', error.message);
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://ujalapump.com',
      'https://www.ujalapump.com',
      'http://192.168.31.156:5173',
      'https://ujala-latest-development.vercel.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/factories', factoryRoutes);
app.use('/api/distributors', distributorRoutes);
app.use('/api/distributor-sales', distributorSalesRoutes);
app.use('/api/distributor/products', distributorProductRoutes);
app.use('/api/distributor-dealer-products', distributorDealerProductRoutes);
app.use('/api/dealer-subdealer-products', dealerSubDealerProductRoutes);
app.use('/api/dealers', dealerRoutes);
app.use('/api', subDealerRoutes);
app.use('/api/dealer/products', dealerProductRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/warranty-stickers', warrantyStickerRoutes);
app.use('/api/factory-orders', factoryOrderRoutes);
app.use('/api/distributor-requests', distributorRequestRoutes);
app.use('/api/dealer-deletion-requests', dealerDeletionRequestRoutes);
app.use('/api/customer-change-requests', customerChangeRequestRoutes);
app.use('/api/executives', executiveRoutes);
app.use('/api/incentives', incentiveRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/pdf', pdfRoutes);

app.get('/', (req, res) => {
  res.json({
    message: '🚀 Ujala Backend API is running!',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.name, err.message);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    });
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

connectDB();

app.listen(PORT, () => {
  console.log(`✅ Server started on http://localhost:${PORT}`);
});
