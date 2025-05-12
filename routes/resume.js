const express = require("express");
const router = express.Router();
const multer = require("multer");
const PDFDocument = require("pdfkit");

const { handleResumeUpload } = require("../controllers/resumeController");
const ResumeAnalysis = require("../models/ResumeAnalysis");
const authMiddleware = require("../middleware/authMiddleware");

const upload = multer({ dest: "uploads/" });

// ✅ Route: Upload resume
router.post(
  "/upload",
  authMiddleware,
  upload.single("resume"),
  handleResumeUpload
);

// ✅ Route: Get user’s resume history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const history = await ResumeAnalysis.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .select("fileName jobRole createdAt atsScore aiFeedback"); // Added aiFeedback

    res.json({ success: true, history });
  } catch (err) {
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
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${resume.fileName}-feedback.pdf`
    );
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    doc.fontSize(16).text("Resume Feedback Report", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Job Role: ${resume.jobRole}`);
    doc.text(`Date: ${resume.createdAt.toLocaleDateString()}`);
    doc.text(`ATS Score: ${resume.atsScore ?? "Not Available"}`);
    doc.moveDown();

    doc.fontSize(13).text("AI Feedback:", { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(resume.aiFeedback, {
      align: "left",
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

module.exports = router;
