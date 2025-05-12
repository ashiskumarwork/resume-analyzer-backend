const express = require("express");
const router = express.Router();
const multer = require("multer");
const PDFDocument = require("pdfkit");
const path = require("path"); // Added for path.extname
const fs = require("fs"); // Added for file system operations

const { handleResumeUpload } = require("../controllers/resumeController");
const ResumeAnalysis = require("../models/ResumeAnalysis");
const authMiddleware = require("../middleware/authMiddleware");

// --- START: Modified Multer Configuration for Serverless Environment ---
const UPLOAD_DIR = "/tmp/uploads"; // Use /tmp directory

// Ensure the UPLOAD_DIR exists (important for serverless ephemeral file systems)
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`Created temporary upload directory: ${UPLOAD_DIR}`);
  } catch (err) {
    console.error(
      `Error creating temporary upload directory ${UPLOAD_DIR}:`,
      err
    );
    // Depending on your error handling strategy, you might throw an error here
    // or have the application fail to start if this directory is critical.
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Re-check and create if necessary, as /tmp might be cleared between invocations
    if (!fs.existsSync(UPLOAD_DIR)) {
      try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        console.log(
          `Re-created temporary upload directory in destination cb: ${UPLOAD_DIR}`
        );
      } catch (err) {
        console.error(
          `Error re-creating temporary upload directory in destination cb ${UPLOAD_DIR}:`,
          err
        );
        return cb(err); // Pass error to multer if directory creation fails
      }
    }
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Using a more unique filename structure
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Example: 10MB file size limit
  fileFilter: function (req, file, cb) {
    // Example file filter: accept only specified types
    const filetypes = /pdf|doc|docx/; // Regular expression for allowed extensions
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        "File upload only supports the following filetypes - " + filetypes
      )
    );
  },
});
// --- END: Modified Multer Configuration ---

// ✅ Route: Upload resume
router.post(
  "/upload",
  authMiddleware,
  upload.single("resume"), // Uses the modified 'upload' instance
  handleResumeUpload
);

// ✅ Route: Get user’s resume history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const history = await ResumeAnalysis.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .select("fileName jobRole createdAt atsScore aiFeedback");

    res.json({ success: true, history });
  } catch (err) {
    console.error("Error fetching history:", err); // Added console.error for server-side logging
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ✅ Route: Download resume feedback as PDF
router.get("/download/:id", authMiddleware, async (req, res) => {
  try {
    const resume = await ResumeAnalysis.findById(req.params.id);

    if (!resume || resume.user.toString() !== req.userId) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const doc = new PDFDocument();
    // Sanitize filename for header - basic example, might need more robust sanitization
    const safeFileName = resume.fileName
      ? resume.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")
      : "resume";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${safeFileName}-feedback.pdf`
    );
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    doc.fontSize(16).text("Resume Feedback Report", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Original Filename: ${resume.fileName || "N/A"}`);
    doc.text(`Job Role: ${resume.jobRole || "N/A"}`);
    doc.text(
      `Date Analyzed: ${
        resume.createdAt ? resume.createdAt.toLocaleDateString() : "N/A"
      }`
    );
    doc.text(`ATS Score: ${resume.atsScore ?? "Not Available"}`); // Using nullish coalescing
    doc.moveDown();

    doc.fontSize(13).text("AI Feedback:", { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(resume.aiFeedback || "No AI feedback available.", {
      align: "left",
    });

    doc.end();
  } catch (err) {
    console.error("Error generating PDF:", err); // Added console.error
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

module.exports = router;
