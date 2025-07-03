/**
 * Resume Analysis Model
 * Defines the schema for storing resume analysis data in MongoDB
 */

const mongoose = require("mongoose");

const ResumeAnalysisSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
    },
    jobRole: {
      type: String,
      required: [true, "Job role is required"],
      trim: true,
    },
    resumeText: {
      type: String,
      required: [true, "Resume text is required"],
    },
    aiFeedback: {
      type: String,
      required: [true, "AI feedback is required"],
    },
    atsScore: {
      type: Number,
      min: [0, "ATS score cannot be negative"],
      max: [10, "ATS score cannot exceed 10"],
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  }
);

// Indexes for better query performance
ResumeAnalysisSchema.index({ user: 1, createdAt: -1 });
ResumeAnalysisSchema.index({ atsScore: 1 });

module.exports = mongoose.model("ResumeAnalysis", ResumeAnalysisSchema);
