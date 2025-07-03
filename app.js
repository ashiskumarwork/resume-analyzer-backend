/**
 * AI Resume Analyzer Backend
 * Main application file with Express server configuration
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

// Import route modules
const resumeRoutes = require("./routes/resume");
const authRoutes = require("./routes/auth");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// =============================================================================
// Database Connection
// =============================================================================

/**
 * Connect to MongoDB database
 */
const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", {
      name: err.name,
      message: err.message,
      reason: err.reason?.toString(),
    });
    process.exit(1); // Exit process if database connection fails
  }
};

// Connect to database
connectDatabase();

// =============================================================================
// CORS Configuration
// =============================================================================

const allowedOrigins = [
  "http://localhost:3000", // Local development frontend
  "https://resume-analyzer-frontend-gray.vercel.app", // Production frontend
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked origin - ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow cookies and authorization headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// =============================================================================
// Middleware
// =============================================================================

// Parse JSON requests with size limit for file uploads
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded requests
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// Routes
// =============================================================================

// Authentication routes
app.use("/api/auth", authRoutes);

// Resume-related routes
app.use("/api/resume", resumeRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    message: "Resume Analyzer Backend is running!",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the AI Resume Analyzer Backend!",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      resume: "/api/resume",
    },
  });
});

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Global error handler middleware
 */
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      details: err.message,
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      error: "Invalid ID format",
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: err.message || "An unexpected error occurred",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

/**
 * Handle 404 errors for undefined routes
 * Fixed for Express 5.x compatibility
 */
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// =============================================================================
// Server Startup
// =============================================================================

/**
 * Start the Express server
 */
const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  });
};

// Start server
startServer();

// =============================================================================
// Graceful Shutdown
// =============================================================================

/**
 * Handle graceful shutdown
 */
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  mongoose.connection.close(() => {
    console.log("MongoDB connection closed.");
    process.exit(0);
  });
};

// Listen for shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = app;
