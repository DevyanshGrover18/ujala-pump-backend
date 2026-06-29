import DistributorDealerProduct from '../models/DistributorDealerProduct.js';
import Sale from '../models/Sale.js';

export const getDealerSales = async (req, res) => {
  try {
    const { distributorId } = req.params;

    const sales = await DistributorDealerProduct.find({
      distributor: distributorId,
    })
      .populate({
        path: 'product',
        populate: {
          path: 'model',
        },
      })
      .populate('dealer', 'name');

    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// export const getCustomerSales = async (req, res) => {
//     try {
//         const { distributorId } = req.params;

//         const sales = await Sale.find({ distributor: distributorId })
//             .populate({
//                 path: 'product',
//                 populate: {
//                     path: 'model',
//                     model: 'Model'
//                 }
//             })
//             .populate('distributor', 'name')
//             .sort({ createdAt: -1 });

//         res.json(sales);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

// export const getCustomerSales = async (req, res) => {
//     try {
//         const { distributorId } = req.params;

//         const assignedProducts = await DistributorDealerProduct.find({ distributor: distributorId }).distinct("product");

//         const sales = await Sale.find({ distributor: distributorId, product: { $nin: assignedProducts } })
//             .populate({
//                 path: "product",
//                 populate: { path: "model" }
//             })
//             .populate("distributor", "name")
//             .sort({ createdAt: -1 });

//         res.status(200).json(sales);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

export const getCustomerSales = async (req, res) => {
  try {
    const { distributorId } = req.params;

    const sales = await Sale.find({
      distributor: distributorId,
      dealer: null,
      subDealer: null,
      customerName: { $exists: true, $ne: '' },
      customerPhone: { $exists: true, $ne: '' },
    })
      .populate({
        path: 'product',
        populate: { path: 'model' },
      })
      .populate('distributor', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
