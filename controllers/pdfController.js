/**
 * PDF Generation Controller for Product Stickers
 * This module handles the generation of product stickers in PDF format for different types of boxes
 * and items. It supports single unit stickers, multi-unit box stickers, and combined PDFs.
 */

import PDFDocument from 'pdfkit'; // For PDF generation
import QRCode from 'qrcode'; // For QR code generation
import { OrderItem } from '../models/Order.js'; // Database model for order items
import fs from 'fs'; // File system operations
import path from 'path'; // Path manipulation
import archiver from 'archiver'; // For creating ZIP archives

/**
 * Master configuration object for sticker layout and styling
 * Contains all dimensions, fonts, spacing, and positioning information
 * All measurements are in PDF points unless specified otherwise
 */
const stickerConfig = {
  width: 400,
  height: 250,
  margin: 8,
  font: {
    bold: 'Helvetica-Bold',
    regular: 'Helvetica',
    sizes: {
      title: 11,
      model: 10,
      serial: 9,
      specsLabel: 9,
      specsValue: 9,
      taxNote: 7,
      footer: 8,
    },
  },
  logo: {
    path: path.join(process.cwd(), 'public', 'Ujala_template_logo.png'),
    width: 100,
    yOffset: 0,
  },
  qr: {
    width: 48,
    spacing: 8,
    yOffset: 0,
  },
  columns: {
    leftRatio: 0.48,
    spacing: 25,
    leftTitleY: 75,
    leftModelY: 4,
    rightSpecsY: 72,
    specLabelWidth: 70,
  },
  serialBoxes: {
    yOffset: 10,
    boxWidthPadding: 30,
    boxHeight: 18,
    boxGap: 8,
    serialTopExtra: 8,
    serialAreaReserveFooter: 110,
  },
  footer: {
    yOffset: 40,
    lineSpacing: 10,
  },
};

/**
 * Cache for the logo image buffer to avoid repeated disk reads
 */
let logoBuffer = null;

/**
 * Loads and caches the company logo for use in stickers
 * Uses a singleton pattern to load the logo only once and reuse it
 * @returns {Buffer|null} The logo image buffer or null if loading fails
 */
const loadLogo = () => {
  if (logoBuffer) return logoBuffer;
  try {
    logoBuffer = fs.readFileSync(stickerConfig.logo.path);
    return logoBuffer;
  } catch (error) {
    console.error('Error loading logo:', error);
    return null;
  }
};
loadLogo(); // Pre-load logo on module initialization

/**
 * Generates a QR code data URL from the provided data
 * @param {Object} data - Data to encode in the QR code (serialNumber, model, orderId)
 * @returns {Promise<string|null>} Data URL of the QR code or null if generation fails
 */
const generateQRCode = async (data) => {
  try {
    const stringData = JSON.stringify(data);
    return await QRCode.toDataURL(stringData);
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

/**
 * Generates a single sticker on the PDF document with 90-degree rotation
 * Handles different types of stickers (individual, outer box) with proper positioning and content
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {Object} options - Sticker generation options
 * @param {string} options.type - Type of sticker ('individual', 'outer_Nunit', 'single_unit')
 * @param {Array<OrderItem>} options.items - Order items for the sticker
 * @param {Array<string>} options.qrCodes - Generated QR code data URLs
 * @param {Object} options.model - Product model information
 * @param {number} [options.startX=10] - Starting X position
 * @param {number} [options.startY=10] - Starting Y position
 */
const generateBoxSticker = async (
  doc,
  { type, items, qrCodes, model, category, startX = 10, startY = 10 }
) => {
  const {
    width,
    height,
    margin,
    font,
    logo,
    qr,
    columns,
    serialBoxes,
    footer,
  } = stickerConfig;

  // Calculate center position on the page
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  // After rotation, sticker width becomes height and vice versa
  const rotatedStickerWidth = height; // 250
  const rotatedStickerHeight = width; // 400

  // Calculate the top-left corner position to center the rotated sticker
  const startXCentered = (pageWidth - rotatedStickerWidth) / 2;
  const startYCentered = (pageHeight - rotatedStickerHeight) / 2;

  // Save the current state
  doc.save();

  // Move to where the rotated sticker should start (top-left of the centered position)
  // Then move to the center of that sticker area for rotation
  const rotationCenterX = startXCentered + rotatedStickerWidth / 2;
  const rotationCenterY = startYCentered + rotatedStickerHeight / 2;

  // Translate to the rotation center point
  doc.translate(rotationCenterX, rotationCenterY);

  // Rotate 90 degrees clockwise
  doc.rotate(90);

  // Translate back by half of original dimensions (before rotation)
  doc.translate(-width / 2, -height / 2);

  // Now draw everything at origin (0, 0) instead of (startX, startY)
  // because we've already positioned via transformations
  const drawStartX = 0;
  const drawStartY = 0;

  doc.rect(drawStartX, drawStartY, width, height).stroke();
  doc.font(font.bold);

  const leftColX = drawStartX + margin;
  const leftColWidth = width * columns.leftRatio;
  const rightColX = drawStartX + leftColWidth + columns.spacing;
  const rightColWidth = width - leftColWidth - margin * 2 - columns.spacing;

  // --- Left Column Content ---
  let yPositionLeft = drawStartY + margin + logo.yOffset;

  const logoImage = loadLogo();
  if (logoImage) {
    doc.image(
      logoImage,
      leftColX + (leftColWidth - logo.width) / 2,
      yPositionLeft,
      { width: logo.width }
    );
  }

  yPositionLeft = drawStartY + columns.leftTitleY;
  doc.fontSize(font.sizes.title);

  // Dynamically set the category name, ensuring it is split into a maximum of two lines
  const categoryName = category?.name || 'N/A';
  let categoryLines = [categoryName];

  if (categoryName.includes(' ')) {
    const middleIndex = Math.floor(categoryName.length / 2);
    const firstSpace = categoryName.lastIndexOf(' ', middleIndex);
    const lastSpace = categoryName.indexOf(' ', middleIndex);

    let splitIndex = -1;

    if (firstSpace !== -1 && lastSpace !== -1) {
      splitIndex =
        middleIndex - firstSpace < lastSpace - middleIndex
          ? firstSpace
          : lastSpace;
    } else if (firstSpace !== -1) {
      splitIndex = firstSpace;
    } else if (lastSpace !== -1) {
      splitIndex = lastSpace;
    }

    if (splitIndex !== -1) {
      categoryLines = [
        categoryName.substring(0, splitIndex),
        categoryName.substring(splitIndex + 1),
      ];
    }
  }

  categoryLines.forEach((text) => {
    doc.text(text.toUpperCase(), leftColX, yPositionLeft, {
      width: leftColWidth,
      align: 'center',
    });
    yPositionLeft += 16;
  });

  yPositionLeft += columns.leftModelY;
  doc.fontSize(font.sizes.model);
  const modelText = `MODEL : ${model?.name || 'N/A'}`;
  doc.text(modelText, leftColX, yPositionLeft, {
    width: leftColWidth,
    align: 'center',
  });

  const modelTextHeight = doc.heightOfString(modelText, {
    width: leftColWidth,
  });
  yPositionLeft += modelTextHeight;

  // Serial numbers
  // Serial numbers with dynamic height adjustment
  yPositionLeft += serialBoxes.yOffset;
  const serialBoxWidth = leftColWidth - serialBoxes.boxWidthPadding;
  const serialBoxX = leftColX + serialBoxes.boxWidthPadding / 2;

  const serialAreaTop = yPositionLeft;
  const serialAreaBottom =
    drawStartY + height - serialBoxes.serialAreaReserveFooter;
  const availableHeight = Math.max(0, serialAreaBottom - serialAreaTop);

  // Calculate required height for each serial number
  const serialTexts = items.map((item) => `PUMP S.NO : ${item.serialNumber}`);
  const baseBoxHeight = serialBoxes.boxHeight;
  const minBoxHeight = 18; // Minimum box height
  const textPadding = 6; // Padding inside box

  // Measure each serial number text height
  doc.fontSize(font.sizes.serial);
  const measuredHeights = serialTexts.map((text) => {
    const textHeight = doc.heightOfString(text, {
      width: serialBoxWidth - textPadding * 2,
    });
    // Add padding top and bottom, with minimum height
    return Math.max(minBoxHeight, textHeight + textPadding * 2);
  });

  // Calculate total height needed
  let totalBoxesH =
    measuredHeights.reduce((sum, h) => sum + h, 0) +
    Math.max(0, items.length - 1) * serialBoxes.boxGap;
  let currentBoxGap = serialBoxes.boxGap;

  // If total height exceeds available space, reduce gaps
  if (totalBoxesH > availableHeight) {
    const totalItemsHeight = measuredHeights.reduce((sum, h) => sum + h, 0);
    const remainingSpace = availableHeight - totalItemsHeight;
    currentBoxGap = Math.max(
      2,
      Math.floor(remainingSpace / Math.max(1, items.length - 1))
    );
    totalBoxesH =
      totalItemsHeight + Math.max(0, items.length - 1) * currentBoxGap;
  }

  // Center the serial boxes vertically
  const boxesStartY =
    serialAreaTop +
    serialBoxes.serialTopExtra +
    Math.max(0, Math.floor((availableHeight - totalBoxesH) / 2));

  // Draw serial number boxes with dynamic heights
  let currentY = boxesStartY;
  items.forEach((item, index) => {
    const boxHeight = measuredHeights[index];

    // Draw box
    doc.rect(serialBoxX, currentY, serialBoxWidth, boxHeight).stroke();

    // Draw text centered vertically within the box
    const textHeight = doc.heightOfString(serialTexts[index], {
      width: serialBoxWidth - textPadding * 2,
    });
    const textY = currentY + (boxHeight - textHeight) / 2;

    doc
      .fontSize(font.sizes.serial)
      .text(serialTexts[index], serialBoxX + textPadding, textY, {
        width: serialBoxWidth - textPadding * 2,
        align: 'left',
      });

    // Move to next box position
    currentY += boxHeight + currentBoxGap;
  });
  // --- Right Column Content ---
  let yPositionRight = drawStartY + margin + qr.yOffset;
  const qrCodeWidth = qr.width;
  const qrCodeSpacing = qr.spacing;

  if (qrCodes && qrCodes.length > 0) {
    if ((type === 'single_unit' || type === 'individual') && qrCodes[0]) {
      doc.image(qrCodes[0], rightColX + 6, yPositionRight, {
        width: qrCodeWidth,
      });
      doc.image(
        qrCodes[0],
        rightColX + rightColWidth - qrCodeWidth - 6,
        yPositionRight,
        { width: qrCodeWidth }
      );
    } else {
      const validQrCodes = qrCodes.filter(Boolean);
      const totalQrWidth =
        validQrCodes.length * qrCodeWidth +
        Math.max(0, validQrCodes.length - 1) * qrCodeSpacing;
      const qrStartX =
        rightColX + Math.max(0, (rightColWidth - totalQrWidth) / 2);
      validQrCodes.forEach((qrCode, index) => {
        doc.image(
          qrCode,
          qrStartX + index * (qrCodeWidth + qrCodeSpacing),
          yPositionRight,
          { width: qrCodeWidth }
        );
      });
    }
  }

  // --- Specifications Section ---
  yPositionRight = drawStartY + columns.rightSpecsY;
  const specsData = model?.specifications || {};
  let displayWeight = 'N/A';
  if (specsData.grossWeight) {
    const multiplier = type.includes('outer') ? items.length : 1;
    displayWeight = `${(parseFloat(specsData.grossWeight) * multiplier).toFixed(3)}kg`;
  }
  const displayPrice =
    type === 'individual'
      ? `${specsData.mrpPrice || 'N/A'}/-`
      : `${specsData.mrpPrice || 'N/A'}/- Each`;
  let mfgDate = 'N/A';
  try {
    if (items[0]?.month && items[0]?.year) {
      mfgDate = new Date(items[0].year, items[0].month - 1).toLocaleDateString(
        'en-US',
        { month: 'short', year: 'numeric' }
      );
    }
  } catch (e) {
    console.error('Invalid date format:', e);
  }

  const specItems = [
    ['QUANTITY', type.includes('outer_') ? `${items.length}N` : '1N'],
    ['GROSS.WT', displayWeight],
    ['kW/HP', specsData.kwHp || 'N/A'],
    ['Voltage', specsData.voltage || 'N/A'],
    ['MRP Rs.', displayPrice],
    ['MFG DATE', mfgDate],
  ];

  specItems.forEach(([label, value]) => {
    if (label === 'MFG DATE') yPositionRight += 5;
    doc
      .font(font.bold)
      .fontSize(font.sizes.specsLabel)
      .text(label, rightColX, yPositionRight);
    doc
      .font(font.bold)
      .fontSize(font.sizes.specsValue)
      .text(`: ${value}`, rightColX + columns.specLabelWidth, yPositionRight);
    yPositionRight += 16;
    if (label === 'MRP Rs.') {
      doc
        .font(font.bold)
        .fontSize(font.sizes.taxNote)
        .text('(Incl of all taxes)', rightColX, yPositionRight - 6);
      yPositionRight += 2;
    }
  });

  // --- Footer ---
  const footerY = drawStartY + height - footer.yOffset;
  doc.fontSize(font.sizes.footer);
  [
    'MKTD BY - SUPER POWER ENERGY',
    'F-40, Road No. 2 VKI Industrial Area, Jaipur, Rajasthan - 302013',
    'Email : ujalacustomercare@gmail.com | Service No - Delhi : 8595725671 , Others : 63769 11917',
  ].forEach((line, index) => {
    doc.text(line, drawStartX + margin, footerY + index * footer.lineSpacing, {
      width: width - margin * 2,
      align: 'center',
    });
  });

  // Restore the transformation state
  doc.restore();
};

/**
 * Creates a new PDF document stream with the correct dimensions for stickers
 * Configures the document for standard sticker size (100mm x 150mm)
 * @returns {Object} Object containing the PDF document and a promise that resolves with the final buffer
 */
const createPdfStream = () => {
  // Convert mm to points (1mm = 2.83465 points)
  const mmToPoints = (mm) => mm * 2.83465;

  // Sticker dimensions: 100mm width x 150mm height (vertical orientation)
  const stickerWidth = mmToPoints(100); // ~283 points
  const stickerHeight = mmToPoints(150); // ~425 points

  const doc = new PDFDocument({
    size: [stickerWidth, stickerHeight],
    margin: 0,
  });
  const chunks = [];
  doc.on('data', chunks.push.bind(chunks));
  const promise = new Promise((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  );
  return { doc, promise };
};

/**
 * Generates a PDF containing stickers for a specific box
 * Handles both single-unit and multi-unit boxes, creating appropriate stickers for each case
 * For multi-unit boxes: Inner stickers come FIRST, then outer box sticker
 * @param {string} boxKey - Identifier in format 'orderId-box-boxNumber'
 * @returns {Promise<Buffer>} PDF document as a buffer
 */
const generatePDFForBox = async (boxKey) => {
  const [orderId, , boxNumber] = boxKey.split('-');
  const orderItems = await OrderItem.find({
    orderId,
    boxNumber: parseInt(boxNumber),
  })
    .populate('category')
    .populate('model');
  if (!orderItems.length) throw new Error(`Box not found for key: ${boxKey}`);

  const { doc, promise } = createPdfStream();
  const model = orderItems[0].model;
  const category = orderItems[0].category;

  // Convert mm to points
  const mmToPoints = (mm) => mm * 2.83465;
  const gapBetweenStickers = mmToPoints(50); // 50mm gap

  const boxQrCodes = await Promise.all(
    orderItems.map((item) =>
      generateQRCode({
        serialNumber: item.serialNumber,
        model: item.model?.name,
        orderId: item.orderId,
      })
    )
  );

  if (orderItems.length > 1) {
    // Multi-unit box: Individual stickers FIRST
    for (let i = 0; i < orderItems.length; i++) {
      if (i > 0) doc.addPage(); // Add page for subsequent stickers
      await generateBoxSticker(doc, {
        type: 'individual',
        items: [orderItems[i]],
        qrCodes: [boxQrCodes[i], boxQrCodes[i]],
        model: orderItems[i].model,
        category: orderItems[i].category,
        startX: 0,
        startY: 0,
      });
    }

    // THEN outer sticker on new page
    doc.addPage();
    await generateBoxSticker(doc, {
      type: `outer_${orderItems.length}unit`,
      items: orderItems,
      qrCodes: boxQrCodes,
      model,
      category,
      startX: 0,
      startY: 0,
    });
  } else {
    // Single unit box - just one individual sticker
    await generateBoxSticker(doc, {
      type: 'individual',
      items: [orderItems[0]],
      qrCodes: [boxQrCodes[0], boxQrCodes[0]],
      model,
      category,
      startX: 0,
      startY: 0,
    });
  }
  doc.end();
  return promise;
};

/**
 * Generates a combined PDF containing stickers for multiple order items
 * Groups items by box and generates appropriate stickers for each box
 * Order: ALL individual stickers first, THEN ALL outer box stickers
 * @param {Array<OrderItem>} orderItems - Array of order items to generate stickers for
 * @returns {Promise<Buffer>} Combined PDF document as a buffer
 */
const generateCombinedPDF = async (orderItems) => {
  const { doc, promise } = createPdfStream();

  // Convert mm to points
  const mmToPoints = (mm) => mm * 2.83465;
  const gapBetweenStickers = mmToPoints(50); // 50mm gap

  const groupedByBox = orderItems.reduce((acc, item) => {
    const boxKey = `${item.orderId}-box-${item.boxNumber}`;
    if (!acc[boxKey]) {
      acc[boxKey] = [];
    }
    acc[boxKey].push(item);
    return acc;
  }, {});

  let isFirstSticker = true;

  // Separate arrays for individual and outer stickers
  const individualStickers = [];
  const outerStickers = [];

  // Collect all stickers data first
  for (const boxKey in groupedByBox) {
    const itemsInBox = groupedByBox[boxKey];
    const model = itemsInBox[0].model;
    const category = itemsInBox[0].category;

    const boxQrCodes = await Promise.all(
      itemsInBox.map((item) =>
        generateQRCode({
          serialNumber: item.serialNumber,
          model: item.model?.name,
          orderId: item.orderId,
        })
      )
    );

    if (itemsInBox.length > 1) {
      // Multi-unit box: Collect individual stickers
      for (let i = 0; i < itemsInBox.length; i++) {
        individualStickers.push({
          type: 'individual',
          items: [itemsInBox[i]],
          qrCodes: [boxQrCodes[i], boxQrCodes[i]],
          model: itemsInBox[i].model,
          category: itemsInBox[i].category,
        });
      }

      // Collect outer sticker
      outerStickers.push({
        type: `outer_${itemsInBox.length}unit`,
        items: itemsInBox,
        qrCodes: boxQrCodes,
        model,
        category,
      });
    } else {
      // Single unit box - just individual sticker
      individualStickers.push({
        type: 'individual',
        items: [itemsInBox[0]],
        qrCodes: [boxQrCodes[0], boxQrCodes[0]],
        model,
        category,
      });
    }
  }

  // Generate ALL individual stickers FIRST
  for (const stickerData of individualStickers) {
    if (!isFirstSticker) doc.addPage();
    isFirstSticker = false;

    await generateBoxSticker(doc, {
      ...stickerData,
      startX: 0,
      startY: 0,
    });
  }

  // THEN generate ALL outer box stickers
  for (const stickerData of outerStickers) {
    if (!isFirstSticker) doc.addPage();
    isFirstSticker = false;

    await generateBoxSticker(doc, {
      ...stickerData,
      startX: 0,
      startY: 0,
    });
  }

  doc.end();
  return promise;
};

// --- API Controllers ---

/**
 * API endpoint to generate stickers PDF for a single box
 * @route GET /api/stickers/box/:boxKey
 * @param {string} req.params.boxKey - Box identifier
 * @param {boolean} req.query.download - Whether to force download or display inline
 * @returns {Buffer} PDF document
 */
export const generateBoxStickers = async (req, res) => {
  try {
    const { boxKey } = req.params;
    const pdf = await generatePDFForBox(boxKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${req.query.download === 'true' ? 'attachment' : 'inline'}; filename="stickers-${boxKey}.pdf"`
    );
    res.send(pdf);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res
      .status(500)
      .json({ message: 'Error generating PDF', error: error.message });
  }
};

/**
 * API endpoint to download multiple box stickers as a ZIP file
 * @route POST /api/stickers/download-multiple
 * @param {Array<string>} req.body.boxKeys - Array of box identifiers
 * @returns {Buffer} ZIP file containing PDFs for each box
 */
export const downloadMultiplePDFs = async (req, res) => {
  try {
    const { boxKeys } = req.body;
    if (!boxKeys || !Array.isArray(boxKeys) || boxKeys.length === 0) {
      return res.status(400).json({ message: 'Box keys array is required' });
    }
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="stickers-batch.zip"'
    );
    archive.pipe(res);
    for (const boxKey of boxKeys) {
      try {
        const pdf = await generatePDFForBox(boxKey);
        archive.append(pdf, { name: `box-stickers-${boxKey}.pdf` });
      } catch (error) {
        console.error(`Error for ${boxKey}:`, error.message);
        archive.append(`Failed for ${boxKey}: ${error.message}`, {
          name: `ERROR-${boxKey}.txt`,
        });
      }
    }
    await archive.finalize();
  } catch (error) {
    console.error('Error generating ZIP:', error);
    res.status(500).json({ message: 'Error generating ZIP file' });
  }
};

/**
 * API endpoint to download a combined PDF containing stickers for multiple items
 * @route POST /api/stickers/download-combined
 * @param {Array<string>} req.body.itemIds - Array of order item IDs
 * @returns {Buffer} Combined PDF document
 */
export const downloadCombinedPDFs = async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Item IDs array is required' });
    }
    const orderItems = await OrderItem.find({ _id: { $in: itemIds } })
      .populate('category')
      .populate('model');
    if (orderItems.length === 0) {
      return res.status(404).json({ message: 'No order items found' });
    }

    // Sort orderItems by orderType: 1_unit, then 2_units, then 3_units
    const sortedOrderItems = orderItems.sort((a, b) => {
      const orderTypeA = a.orderType;
      const orderTypeB = b.orderType;

      const orderMap = { '1_unit': 1, '2_units': 2, '3_units': 3 };

      return orderMap[orderTypeA] - orderMap[orderTypeB];
    });

    const pdf = await generateCombinedPDF(sortedOrderItems);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="combined-stickers-${Date.now()}.pdf"`
    );
    res.send(pdf);
  } catch (error) {
    console.error('Error generating combined PDF:', error);
    res
      .status(500)
      .json({ message: 'Error generating combined PDF', error: error.message });
  }
};
