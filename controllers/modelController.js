import Model from '../models/Model.js';
import Category from '../models/Category.js';
import mongoose from 'mongoose';
import { sanitizeInput, createSecureErrorResponse } from '../utils/security.js';

const checkModelCode = async (req, res) => {
  try {
    const { code } = req.params;
    const sanitizedCode = sanitizeInput(code.trim().toUpperCase());

    if (!sanitizedCode || sanitizedCode.length < 2) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Invalid code format', 400));
    }

    const model = await Model.findOne({ code: sanitizedCode });
    res.status(200).json({ isUnique: !model });
  } catch (error) {
    console.error('Check model code error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error checking code', 500));
  }
};

const getModels = async (req, res) => {
  try {
    const models = await Model.find({})
      .populate('category', 'name status')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(models);
  } catch (error) {
    console.error('Get models error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error fetching models', 500));
  }
};

const getModelById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Invalid model ID format', 400));
    }

    const model = await Model.findById(id).populate('category', 'name status');
    if (!model) {
      return res
        .status(404)
        .json(createSecureErrorResponse('Model not found', 404));
    }

    res.status(200).json(model);
  } catch (error) {
    console.error('Get model by ID error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error fetching model', 500));
  }
};

const getModelsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Invalid category ID format', 400));
    }

    const models = await Model.find({ category: categoryId })
      .populate('category', 'name status')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(models);
  } catch (error) {
    console.error('Get models by category error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error fetching models', 500));
  }
};

const createModel = async (req, res) => {
  try {
    const { name, code, category, specifications, warranty, status } = req.body;

    // Basic validation
    if (!name || !code || !category || !specifications) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse(
            'Name, code, category, and specifications are required',
            400
          )
        );
    }

    // Validate category exists and is active
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Invalid category ID format', 400));
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res
        .status(404)
        .json(createSecureErrorResponse('Category not found', 404));
    }
    if (categoryExists.status !== 'Active') {
      return res
        .status(400)
        .json(createSecureErrorResponse('Category must be active', 400));
    }

    const sanitizedData = {
      name: sanitizeInput(name.trim()),
      code: sanitizeInput(code.trim().toUpperCase()),
      category,
      specifications: {
        quantity: specifications.quantity || '1N',
        grossWeight: sanitizeInput(specifications.grossWeight),
        kwHp: sanitizeInput(specifications.kwHp),
        voltage: sanitizeInput(specifications.voltage),
        mrpPrice: Number(specifications.mrpPrice),
      },
      warranty: warranty || [],
      status: status || 'Active',
    };

    const model = await Model.create(sanitizedData);
    const populatedModel = await Model.findById(model._id).populate(
      'category',
      'name status'
    );

    res.status(201).json(populatedModel);
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.code) {
        return res
          .status(400)
          .json(createSecureErrorResponse('Model code already exists', 400));
      }
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res
        .status(400)
        .json(createSecureErrorResponse(messages.join(', '), 400));
    }
    console.error('Create model error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error creating model', 500));
  }
};

const updateModel = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, category, specifications, warranty, status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Invalid model ID format', 400));
    }

    const model = await Model.findById(id);
    if (!model) {
      return res
        .status(404)
        .json(createSecureErrorResponse('Model not found', 404));
    }

    // Validate category if provided
    if (category && category !== model.category.toString()) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res
          .status(400)
          .json(createSecureErrorResponse('Invalid category ID format', 400));
      }
      const categoryExists = await Category.findById(category);
      if (!categoryExists || categoryExists.status !== 'Active') {
        return res
          .status(400)
          .json(
            createSecureErrorResponse('Category must exist and be active', 400)
          );
      }
    }

    const updateData = {};
    if (name) updateData.name = sanitizeInput(name.trim());
    if (code) updateData.code = sanitizeInput(code.trim().toUpperCase());
    if (category) updateData.category = category;
    if (specifications) {
      updateData.specifications = {
        ...model.specifications,
        ...specifications,
        mrpPrice: specifications.mrpPrice
          ? Number(specifications.mrpPrice)
          : model.specifications.mrpPrice,
      };
    }
    if (warranty) updateData.warranty = warranty;
    if (status) updateData.status = status;

    const updatedModel = await Model.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate('category', 'name status');

    res.status(200).json(updatedModel);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Model code already exists', 400));
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res
        .status(400)
        .json(createSecureErrorResponse(messages.join(', '), 400));
    }
    console.error('Update model error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error updating model', 500));
  }
};

const updateModelStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Invalid model ID format', 400));
    }

    if (!['Active', 'Inactive'].includes(status)) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse('Status must be Active or Inactive', 400)
        );
    }

    const model = await Model.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!model) {
      return res
        .status(404)
        .json(createSecureErrorResponse('Model not found', 404));
    }

    res
      .status(200)
      .json({ message: 'Model status updated successfully', model });
  } catch (error) {
    console.error('Update model status error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error updating status', 500));
  }
};

const deleteModel = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createSecureErrorResponse('Invalid model ID format', 400));
    }

    const model = await Model.findByIdAndDelete(id);
    if (!model) {
      return res
        .status(404)
        .json(createSecureErrorResponse('Model not found', 404));
    }

    res.status(200).json({ message: 'Model removed successfully' });
  } catch (error) {
    console.error('Delete model error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error deleting model', 500));
  }
};

const deleteMultipleModels = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse('Valid model IDs array is required', 400)
        );
    }

    // Validate all IDs
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res
        .status(400)
        .json(
          createSecureErrorResponse('Invalid model ID format detected', 400)
        );
    }

    const result = await Model.deleteMany({ _id: { $in: ids } });
    res
      .status(200)
      .json({ message: `${result.deletedCount} models removed successfully` });
  } catch (error) {
    console.error('Delete multiple models error:', error.name, error.message);
    res
      .status(500)
      .json(createSecureErrorResponse('Server error deleting models', 500));
  }
};

export {
  checkModelCode,
  getModels,
  getModelById,
  getModelsByCategory,
  createModel,
  updateModel,
  updateModelStatus,
  deleteModel,
  deleteMultipleModels,
};
