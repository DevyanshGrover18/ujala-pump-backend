import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence_value: { type: Number, default: 0 },
});

const Counter =
  mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export const getNextSequence = async (name) => {
  if (name === 'product') {
    let counterDoc = await Counter.findById(name);

    // Find the max sequence currently in the products collection
    const Product = mongoose.models.Product || mongoose.model('Product');
    const latestProduct = await Product.findOne().sort({ productId: -1 });
    let maxSeq = 0;

    if (latestProduct && latestProduct.productId) {
      const match = latestProduct.productId.match(/\d+$/);
      if (match) {
        maxSeq = parseInt(match[0], 10);
      }
    }

    if (!counterDoc || counterDoc.sequence_value < maxSeq) {
      counterDoc = await Counter.findByIdAndUpdate(
        name,
        { $set: { sequence_value: maxSeq } },
        { new: true, upsert: true }
      );
    }
  }

  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
};
