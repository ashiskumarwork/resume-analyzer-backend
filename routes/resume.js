/**
 * Resume Routes
 * Handles resume upload, analysis, history, and PDF generation endpoints
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const { handleResumeUpload } = require("../controllers/resumeController");
const ResumeAnalysis = require("../models/ResumeAnalysis");
const authMiddleware = require("../middleware/authMiddleware");

// =============================================================================
// Multer Configuration for File Uploads
// =============================================================================

const UPLOAD_DIR = "/tmp/uploads"; // Temporary directory for serverless environments

/**
 * Ensure upload directory exists
 */
const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      console.log(`Created temporary upload directory: ${UPLOAD_DIR}`);
    } catch (err) {
      console.error(`Error creating upload directory ${UPLOAD_DIR}:`, err);
      throw err;
    }
  }
};

// Create upload directory on module load
ensureUploadDir();

/**
 * Multer storage configuration
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure directory exists for each upload
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent conflicts
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename =
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  },
});

/**
 * File filter for allowed file types
 */
const fileFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx/;
  const mimeTypeValid = allowedTypes.test(file.mimetype);
  const extNameValid = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );

  if (mimeTypeValid && extNameValid) {
    return cb(null, true);
  }

  cb(new Error("Only PDF, DOC, and DOCX files are allowed"));
};

/**
 * Multer upload configuration
 */
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
    files: 1, // Only allow single file upload
  },
  fileFilter: fileFilter,
});

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * Upload and analyze resume
 * POST /api/resume/upload
 */
router.post(
  "/upload",
  authMiddleware,
  upload.single("resume"),
  handleResumeUpload
);

/**
 * Get user's resume analysis history
 * GET /api/resume/history
 */
router.get("/history", authMiddleware, async (req, res) => {
  try {
    console.log(`[History] Fetching resume history for user: ${req.userId}`);

    const history = await ResumeAnalysis.find({ user: req.userId })
      .sort({ createdAt: -1 }) // Most recent first
      .select("fileName jobRole createdAt atsScore aiFeedback")
      .lean(); // Use lean() for better performance

    console.log(`[History] Found ${history.length} resume analyses`);

    res.json({ success: true, history });
  } catch (err) {
    console.error("[History] Error fetching resume history:", err);
    res.status(500).json({ error: "Failed to fetch resume history" });
  }
});

/**
 * Download resume feedback as PDF
 * GET /api/resume/download/:id
 */
router.get("/download/:id", authMiddleware, async (req, res) => {
  try {
    const resumeId = req.params.id;
    console.log(`[Download] Generating PDF for resume: ${resumeId}`);

    // Find resume analysis and verify ownership
    const resume = await ResumeAnalysis.findById(resumeId).lean();

    if (!resume || resume.user.toString() !== req.userId) {
      console.log(`[Download] Resume not found or access denied: ${resumeId}`);
      return res.status(404).json({ error: "Resume analysis not found" });
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers for PDF download
    const safeFileName = resume.fileName
      ? resume.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")
      : "resume";

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}-feedback.pdf"`
    );
    res.setHeader("Content-Type", "application/pdf");

    // Pipe PDF to response
    doc.pipe(res);

    // Add content to PDF
    doc.fontSize(18).text("Resume Feedback Report", { align: "center" });
    doc.moveDown(2);

    // Resume details section
    doc.fontSize(14).text("Resume Details", { underline: true });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .text(`Original Filename: ${resume.fileName || "N/A"}`)
      .text(`Job Role: ${resume.jobRole || "N/A"}`)
      .text(
        `Date Analyzed: ${
          resume.createdAt ? resume.createdAt.toLocaleDateString() : "N/A"
        }`
      )
      .text(
        `ATS Score: ${
          resume.atsScore !== null ? `${resume.atsScore}/10` : "Not Available"
        }`
      );

    doc.moveDown(2);

    // AI feedback section
    doc.fontSize(14).text("AI Feedback", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(resume.aiFeedback || "No AI feedback available.", {
      align: "left",
      lineGap: 2,
    });

    // Finalize PDF
    doc.end();

    console.log(
      `[Download] PDF generated successfully for resume: ${resumeId}`
    );
  } catch (err) {
    console.error("[Download] Error generating PDF:", err);
    res.status(500).json({ error: "Failed to generate PDF report" });
  }
});

module.exports = router;
