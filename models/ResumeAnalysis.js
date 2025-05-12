const mongoose = require("mongoose");

const ResumeAnalysisSchema = new mongoose.Schema({
  fileName: String,
  jobRole: String,
  resumeText: String,
  aiFeedback: String,
  atsScore: Number, // <- NEW FIELD
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("ResumeAnalysis", ResumeAnalysisSchema);
