const QRCode = require('qrcode');

// Generate unique item code
function generateItemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar looking chars
  let code = 'ITEM-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate QR code as data URL
async function generateQRCode(code, baseURL) {
  try {
    const url = `${baseURL}/find/${code}`;
    const qrDataURL = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrDataURL;
  } catch (error) {
    console.error('QR Code generation error:', error);
    return null;
  }
}

// Sanitize user input
function sanitizeInput(input) {
  if (!input) return '';
  return input
    .toString()
    .trim()
    .replace(/[<>]/g, ''); // Basic XSS prevention
}

// Check if user is authenticated (middleware)
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Format date for display
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

module.exports = {
  generateItemCode,
  generateQRCode,
  sanitizeInput,
  isAuthenticated,
  formatDate
};
