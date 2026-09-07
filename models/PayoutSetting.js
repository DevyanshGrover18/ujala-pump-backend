import mongoose from 'mongoose';

const payoutSettingSchema = new mongoose.Schema(
  {
    distributorMinPayout: {
      type: Number,
      default: 500,
      min: [0, 'Minimum payout cannot be negative'],
    },
    dealerMinPayout: {
      type: Number,
      default: 500,
      min: [0, 'Minimum payout cannot be negative'],
    },
    subDealerMinPayout: {
      type: Number,
      default: 500,
      min: [0, 'Minimum payout cannot be negative'],
    },
    plumberMinPayout: {
      type: Number,
      default: 200,
      min: [0, 'Minimum payout cannot be negative'],
    },
  },
  { timestamps: true }
);

// Helper function to get or create settings singleton
payoutSettingSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      distributorMinPayout: 500,
      dealerMinPayout: 500,
      subDealerMinPayout: 500,
      plumberMinPayout: 200,
    });
  }
  return settings;
};

export default mongoose.model('PayoutSetting', payoutSettingSchema);
