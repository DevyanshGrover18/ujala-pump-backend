import mongoose from 'mongoose';

const installationSchema = new mongoose.Schema(
  {
    plumber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plumber',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Model',
      required: true,
    },
    geolocation: {
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
    },
    installationDate: {
      type: Date,
      default: Date.now,
    },
    image: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

const Installation = mongoose.model('Installation', installationSchema);
export default Installation;
