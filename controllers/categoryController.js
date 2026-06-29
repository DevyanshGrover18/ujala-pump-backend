import Category from '../models/Category.js';
import Model from '../models/Model.js';
import asyncHandler from 'express-async-handler';
import { sanitizeInput, createSecureErrorResponse } from '../utils/security.js';

export const getCategories = asyncHandler(async (req, res) => {
  // Use aggregation to avoid N+1 query problem
  const categories = await Category.aggregate([
    {
      $lookup: {
        from: 'models',
        localField: '_id',
        foreignField: 'category',
        as: 'models',
      },
    },
    {
      $addFields: {
        modelCount: { $size: '$models' },
      },
    },
    {
      $project: {
        models: 0, // Remove the models array, keep only count
      },
    },
    {
      $sort: { createdAt: -1 },
    },
  ]);

  res.json(categories);
});

export const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res
      .status(400)
      .json(createSecureErrorResponse('Invalid category ID format', 400));
  }

  const category = await Category.findById(id);
  if (!category) {
    return res
      .status(404)
      .json(createSecureErrorResponse('Category not found', 404));
  }

  res.json(category);
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, status } = req.body;

  if (!name) {
    return res
      .status(400)
      .json(createSecureErrorResponse('Category name is required', 400));
  }

  const sanitizedName = sanitizeInput(name.trim());

  try {
    const category = await Category.create({
      name: sanitizedName,
      status: status || 'Active',
    });

    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Category already exists', 400));
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res
        .status(400)
        .json(createSecureErrorResponse(messages.join(', '), 400));
    }
    throw error;
  }
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, status } = req.body;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res
      .status(400)
      .json(createSecureErrorResponse('Invalid category ID format', 400));
  }

  try {
    const updateData = {};
    if (name) updateData.name = sanitizeInput(name.trim());
    if (status) updateData.status = status;

    const category = await Category.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res
        .status(404)
        .json(createSecureErrorResponse('Category not found', 404));
    }

    res.json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Category name already exists', 400));
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res
        .status(400)
        .json(createSecureErrorResponse(messages.join(', '), 400));
    }
    throw error;
  }
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res
      .status(400)
      .json(createSecureErrorResponse('Invalid category ID format', 400));
  }

  const category = await Category.findById(id);
  if (!category) {
    return res
      .status(404)
      .json(createSecureErrorResponse('Category not found', 404));
  }

  try {
    await category.deleteOne();
    res.json({ message: 'Category removed successfully' });
  } catch (error) {
    if (error.message.includes('Cannot delete category')) {
      return res
        .status(400)
        .json(createSecureErrorResponse(error.message, 400));
    }
    throw error;
  }
});

export const deleteMultipleCategories = asyncHandler(async (req, res) => {
  const { categoryIds } = req.body;

  if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
    return res
      .status(400)
      .json(
        createSecureErrorResponse('Valid category IDs array is required', 400)
      );
  }

  // Validate all IDs
  const invalidIds = categoryIds.filter((id) => !id.match(/^[0-9a-fA-F]{24}$/));
  if (invalidIds.length > 0) {
    return res
      .status(400)
      .json(
        createSecureErrorResponse('Invalid category ID format detected', 400)
      );
  }

  // Check for associated models
  const modelCount = await Model.countDocuments({
    category: { $in: categoryIds },
  });
  if (modelCount > 0) {
    return res
      .status(400)
      .json(
        createSecureErrorResponse(
          `Cannot delete categories. ${modelCount} models are associated with these categories.`,
          400
        )
      );
  }

  const result = await Category.deleteMany({ _id: { $in: categoryIds } });
  res.json({
    message: `${result.deletedCount} categories removed successfully`,
  });
});

export const updateCategoryStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res
      .status(400)
      .json(createSecureErrorResponse('Invalid category ID format', 400));
  }

  if (!['Active', 'Inactive'].includes(status)) {
    return res
      .status(400)
      .json(
        createSecureErrorResponse('Status must be Active or Inactive', 400)
      );
  }

  const category = await Category.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  );

  if (!category) {
    return res
      .status(404)
      .json(createSecureErrorResponse('Category not found', 404));
  }

  res.json(category);
});
