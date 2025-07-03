/**
 * Authentication Middleware
 * Validates JWT tokens and protects routes
 */

const jwt = require("jsonwebtoken");

/**
 * Middleware to authenticate JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check if authorization header exists and has correct format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid authorization header" });
  }

  // Extract token from header
  const token = authHeader.split(" ")[1];

  try {
    // Verify and decode JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user ID to request object for use in protected routes
    req.userId = decoded.userId;

    // Continue to next middleware/route handler
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;
