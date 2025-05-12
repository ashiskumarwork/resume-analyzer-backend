const express = require("express");
const cors = require("cors"); // Make sure 'cors' is listed as a dependency in package.json
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const resumeRoutes = require("./routes/resume");
const authRoutes = require("./routes/auth");

dotenv.config(); // Ensures environment variables are loaded

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Connection
// Removed deprecated options: useNewUrlParser and useUnifiedTopology
mongoose
  .connect(process.env.MONGODB_URI) // Simpler connection call
  .then(() => console.log("✅ MongoDB connected successfully!")) // Clarified log message
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.name, err.message); // Log more specific error info
    if (err.reason) {
      console.error("Error Reason:", err.reason.toString());
    }
  });

// --- START: Production-Ready CORS Configuration ---
const allowedOrigins = [
  "http://localhost:3000", // For your local frontend development
  // IMPORTANT: Add your deployed frontend URL here once you have it.
  // For example: 'https://your-frontend-app-name.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    // or if the origin is in our allowedOrigins list.
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // If the origin is not in the allowed list and it's not a 'no origin' request, block it.
      console.warn(`CORS: Blocked origin - ${origin}`); // Log blocked origins for debugging
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Crucial for sending cookies or Authorization headers from the frontend.
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Explicitly define allowed HTTP methods.
  allowedHeaders: ["Content-Type", "Authorization"], // Explicitly define allowed headers.
};

app.use(cors(corsOptions));
// --- END: Production-Ready CORS Configuration ---

// Other Middleware
app.use(express.json({ limit: "10mb" })); // For parsing application/json, added a limit for larger resume files if needed. Adjust as necessary.

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/resume", resumeRoutes);

// Health Check Route (Good for testing if the server is up)
app.get("/api/health", (req, res) => {
  // Changed to /api/health for consistency
  res
    .status(200)
    .json({ status: "UP", message: "Resume Analyzer Backend is running!" });
});

// Basic root route (optional, as Vercel might handle this differently)
app.get("/", (req, res) => {
  res.send("Welcome to the Resume Analyzer Backend!");
});

// Global Error Handler (Basic Example - consider more robust error handling)
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.stack);
  res.status(err.status || 500).json({
    message: err.message || "An unexpected error occurred.",
    // Optionally, include error details in development but not production
    // error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
