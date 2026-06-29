import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const generateQRCode = async (data) => {
  try {
    const stringData = JSON.stringify(data);
    return await QRCode.toDataURL(stringData);
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

const generateWarrantySticker = async (doc, { serialNumber, modelName }) => {
  const mmToPoints = (mm) => mm * 2.83465;

  // Sticker size: 50mm × 30mm
  const stickerWidth = mmToPoints(50);
  const stickerHeight = mmToPoints(30);

  doc.addPage({
    size: [stickerWidth, stickerHeight],
    margin: 0,
  });

  const margin = mmToPoints(2); // Small margin
  const qrSize = mmToPoints(15); // Exactly 15mm × 15mm

  // ---- QR CODE ----
  const qrCodeData = await generateQRCode({ serialNumber, model: modelName });

  if (qrCodeData) {
    doc.image(qrCodeData, margin, margin, {
      width: qrSize,
      height: qrSize,
    });
  }

  // ---- TEXT AREA BESIDE QR ----
  const textBlockX = margin + qrSize + mmToPoints(2); // 2mm gap
  const textBlockWidth = stickerWidth - textBlockX - margin;

  // Fonts tuned for 50×30 layout
  const modelFontSize = 13;
  let serialFontSize = 15; // Starting font size
  const minSerialFontSize = 8; // Minimum readable font size
  const maxSerialFontSize = 15; // Maximum font size

  // Vertical positioning beside QR
  const modelY = margin + qrSize / 2 - modelFontSize / 2;

  // ---- MODEL NAME with dynamic sizing ----
  let modelFontSizeAdjusted = modelFontSize;
  const minModelFontSize = 8;

  doc.font('Helvetica-Bold').fontSize(modelFontSizeAdjusted);
  let modelWidth = doc.widthOfString(modelName);

  // Reduce model font size if text is too wide
  while (
    modelWidth > textBlockWidth &&
    modelFontSizeAdjusted > minModelFontSize
  ) {
    modelFontSizeAdjusted -= 0.5;
    doc.fontSize(modelFontSizeAdjusted);
    modelWidth = doc.widthOfString(modelName);
  }

  doc.text(modelName, textBlockX, modelY, {
    width: textBlockWidth,
    align: 'left',
  });

  // ---- SERIAL NUMBER BELOW EVERYTHING with dynamic sizing ----
  const serialY = margin + qrSize + mmToPoints(2); // Reduced spacing
  const availableSerialWidth = stickerWidth - margin * 2;
  const availableSerialHeight = stickerHeight - serialY - margin;

  // Start with maximum font size and reduce until it fits
  doc.font('Helvetica-Bold').fontSize(serialFontSize);
  let serialWidth = doc.widthOfString(serialNumber);
  let serialHeight = doc.heightOfString(serialNumber, {
    width: availableSerialWidth,
  });

  // Adjust font size to fit both width and height
  while (
    (serialWidth > availableSerialWidth ||
      serialHeight > availableSerialHeight) &&
    serialFontSize > minSerialFontSize
  ) {
    serialFontSize -= 0.5;
    doc.fontSize(serialFontSize);
    serialWidth = doc.widthOfString(serialNumber);
    serialHeight = doc.heightOfString(serialNumber, {
      width: availableSerialWidth,
    });
  }

  // Calculate vertical centering for the serial number in available space
  const serialCenteredY = serialY + (availableSerialHeight - serialHeight) / 2;

  doc.text(serialNumber, margin, serialCenteredY, {
    width: availableSerialWidth,
    align: 'center',
  });

  // ---- BORDER ----
  doc
    .rect(1, 1, stickerWidth - 2, stickerHeight - 2)
    .lineWidth(1)
    .stroke();
};

export const downloadWarrantyStickers = async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    doc.on('data', chunks.push.bind(chunks));

    const promise = new Promise(async (resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      for (const item of items) {
        await generateWarrantySticker(doc, item);
      }

      doc.end();
    });

    const pdf = await promise;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="warranty-stickers-${Date.now()}.pdf"`
    );
    res.send(pdf);
  } catch (error) {
    console.error('Error generating warranty stickers PDF:', error);
    res.status(500).json({
      message: 'Error generating warranty stickers PDF',
      error: error.message,
    });
  }
};
