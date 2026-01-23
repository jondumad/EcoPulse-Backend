const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key';

/**
 * Generates a time-sensitive QR code payload for a mission.
 * @param {number} missionId - ID of the mission
 * @param {number} coordinatorId - ID of the coordinator generating the QR
 * @returns {string} - Signed JWT token
 */
function generateQRToken(missionId, coordinatorId) {
  const payload = {
    missionId,
    coordinatorId,
    type: 'attendance_qr',
  };

  // Token expires in 5 minutes as per requirements
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' });
}

/**
 * Verifies a QR code token.
 * @param {string} token - Signed JWT token from the QR code
 * @returns {object} - Decoded payload if valid
 * @throws {Error} - If token is invalid or expired
 */
function verifyQRToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'attendance_qr') {
      throw new Error('Invalid QR code type');
    }
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('QR code has expired');
    }
    throw new Error('Invalid QR code');
  }
}

module.exports = {
  generateQRToken,
  verifyQRToken,
};
