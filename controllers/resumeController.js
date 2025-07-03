/**
 * Resume Controller
 * Handles resume upload, parsing, AI analysis, and file management
 */

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const axios = require("axios");
const ResumeAnalysis = require("../models/ResumeAnalysis");

/**
 * Analyze resume text using AI service
 * @param {string} resumeText - Extracted text from resume
 * @param {string} jobRole - Target job role for analysis
 * @returns {Object} Analysis result with feedback and ATS score
 */
const analyzeWithAI = async (resumeText, jobRole) => {
  const prompt = `
You are a resume reviewer. Analyze the following resume for the role of "${jobRole}". Provide:
1. Suggestions for improvement
2. List of missing keywords relevant to the "${jobRole}" position
3. Any formatting or grammar issues
4. ATS compatibility rating (out of 10) — format it like this at the end: ATS Score: X/10

Resume:
${resumeText}
`;

  console.log(`[AI Analysis] Starting analysis for job role: "${jobRole}"`);

  try {
    // Call OpenRouter AI API
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo-16k",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[AI Analysis] API call successful");
    const content = response.data.choices[0].message.content;

    // Extract ATS score from AI response
    let atsScore = null;
    const scoreMatch = content.match(
      /ATS(?: Compatibility)? (?:Score|Rating):\s*(\d+(?:\.\d+)?)\/10/i
    );

    if (scoreMatch && scoreMatch[1]) {
      atsScore = Number.parseFloat(scoreMatch[1]);
      console.log("[AI Analysis] ATS Score extracted:", atsScore);
    } else {
      console.log("[AI Analysis] Could not extract ATS score from response");
    }

    return {
      analysis: content,
      atsScore: atsScore,
    };
  } catch (aiError) {
    console.error("[AI Analysis] Error calling OpenRouter AI:", {
      message: aiError.message,
      status: aiError.response?.status,
      data: aiError.response?.data,
    });

    return {
      analysis:
        "Error: Could not retrieve AI analysis due to an API failure. Please check backend logs.",
      atsScore: null,
    };
  }
};

/**
 * Extract text content from uploaded file
 * @param {Object} file - Multer file object
 * @returns {string} Extracted text content
 */
const extractTextFromFile = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  let resumeText = "";

  console.log(`[File Processing] Extracting text from ${ext} file`);

  if (ext === ".pdf") {
    const dataBuffer = fs.readFileSync(file.path);
    const pdfData = await pdfParse(dataBuffer);
    resumeText = pdfData.text;
  } else if (ext === ".docx") {
    const data = await mammoth.extractRawText({ path: file.path });
    resumeText = data.value;
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  // Clean and normalize text
  resumeText = resumeText.replace(/\s+/g, " ").trim();

  if (resumeText.length === 0) {
    console.warn("[File Processing] Warning: Extracted text is empty");
  }

  return resumeText;
};

/**
 * Clean up temporary file
 * @param {string} filePath - Path to file to be deleted
 */
const cleanupTempFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error(
          `[Cleanup] Error deleting temporary file: ${filePath}`,
          unlinkErr
        );
      } else {
        console.log(
          `[Cleanup] Successfully deleted temporary file: ${filePath}`
        );
      }
    });
  }
};

/**
 * Handle resume upload and analysis
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const handleResumeUpload = async (req, res) => {
  try {
    console.log("[Resume Upload] Processing resume upload request");

    const jobRole = req.body.jobRole || "Frontend Developer";
    console.log(`[Resume Upload] Job Role: ${jobRole}`);

    // Validate file upload
    if (!req.file) {
      console.log("[Resume Upload] Error: No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    console.log(
      `[Resume Upload] File received: ${file.originalname} (${file.size} bytes)`
    );

    // Extract text from uploaded file
    let resumeText;
    try {
      resumeText = await extractTextFromFile(file);
      console.log(
        `[Resume Upload] Text extracted successfully (${resumeText.length} characters)`
      );
    } catch (extractError) {
      console.error("[Resume Upload] Error extracting text:", extractError);
      cleanupTempFile(file.path);
      return res.status(400).json({
        error:
          "Could not extract text from file. Please ensure it's a valid PDF or DOCX file.",
      });
    }

    // Clean up temporary file after text extraction
    cleanupTempFile(file.path);

    // Analyze resume with AI
    console.log("[Resume Upload] Starting AI analysis...");
    const { analysis, atsScore } = await analyzeWithAI(resumeText, jobRole);

    console.log(
      `[Resume Upload] AI analysis completed. ATS Score: ${atsScore}`
    );

    // Save analysis to database
    console.log("[Resume Upload] Saving analysis to database...");
    const newAnalysis = await ResumeAnalysis.create({
      fileName: file.originalname,
      jobRole,
      resumeText,
      aiFeedback: analysis,
      atsScore: atsScore,
      user: req.userId,
    });

    console.log(`[Resume Upload] Analysis saved with ID: ${newAnalysis._id}`);

    // Return success response
    res.json({
      success: true,
      jobRole,
      analysis,
      atsScore,
      analysisId: newAnalysis._id,
    });
  } catch (err) {
    console.error("[Resume Upload] Critical error:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });

    // Cleanup file if error occurs
    if (req.file && req.file.path) {
      cleanupTempFile(req.file.path);
    }

    res.status(500).json({
      error: "Failed to process resume. Please check server logs.",
    });
  }
};

module.exports = { handleResumeUpload };
