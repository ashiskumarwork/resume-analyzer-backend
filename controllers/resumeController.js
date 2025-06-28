const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const axios = require("axios"); // Make sure axios is required
const ResumeAnalysis = require("../models/ResumeAnalysis");

// --- START: MODIFIED analyzeWithAI function (keeping your existing improvements) ---
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

  console.log(
    `[analyzeWithAI] Step 1: Preparing to call AI for job role: "${jobRole}"`
  );

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo-16k", // Or your preferred model
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[analyzeWithAI] Step 2: AI API Call Successful.");
    const content = response.data.choices[0].message.content;
    console.log(
      "[analyzeWithAI] Step 3: Raw AI Response Content snippet:\n",
      content ? content.substring(0, 200) + "..." : "N/A"
    );

    let atsScore = null;
    const match = content.match(
      /ATS(?: Compatibility)? (?:Score|Rating):\s*(\d+(\.\d+)?)\/10/i
    );
    console.log("[analyzeWithAI] Step 4: ATS Score Regex Match Result:", match);

    if (match && match[1]) {
      atsScore = parseFloat(match[1]);
      console.log(
        "[analyzeWithAI] Step 5: Successfully Parsed ATS Score:",
        atsScore
      );
    } else {
      console.log(
        "[analyzeWithAI] Step 5: Failed to parse ATS Score from AI response."
      );
    }

    return {
      analysis: content,
      atsScore: atsScore,
    };
  } catch (aiError) {
    console.error("[analyzeWithAI] CRITICAL ERROR CALLING OPENROUTER AI:");
    if (aiError.response) {
      console.error("AI Error - Data:", aiError.response.data);
      console.error("AI Error - Status:", aiError.response.status);
      console.error("AI Error - Headers:", aiError.response.headers);
    } else if (aiError.request) {
      console.error(
        "AI Error - Request (No response received):",
        aiError.request
      );
    } else {
      console.error(
        "AI Error - Message (Error in setting up request):",
        aiError.message
      );
    }
    return {
      analysis:
        "Error: Could not retrieve AI analysis due to an API failure. Please check backend logs.",
      atsScore: null,
    };
  }
};
// --- END: MODIFIED analyzeWithAI function ---

const handleResumeUpload = async (req, res) => {
  // 'file' will be accessible throughout this function due to lexical scoping
  // but it's populated by multer middleware before this handler is called.
  // It's good practice to check if req.file exists.

  try {
    console.log("[handleResumeUpload] Received request to upload resume.");
    const jobRole = req.body.jobRole || "Frontend Developer";
    console.log("[handleResumeUpload] Job Role:", jobRole);

    if (!req.file) {
      // Check if req.file is populated by multer
      console.log("[handleResumeUpload] Error: No file uploaded by multer.");
      return res.status(400).json({ error: "No file uploaded" });
    }
    const file = req.file; // Assign to local const for clarity if preferred
    console.log(
      "[handleResumeUpload] File received:",
      file.originalname,
      "Size:",
      file.size,
      "Path:",
      file.path // This will be a path in /tmp/uploads/
    );

    const ext = path.extname(file.originalname).toLowerCase();
    let resumeText = "";

    console.log(
      "[handleResumeUpload] Parsing file content for extension:",
      ext
    );
    if (ext === ".pdf") {
      const dataBuffer = fs.readFileSync(file.path);
      const pdfData = await pdfParse(dataBuffer);
      resumeText = pdfData.text;
    } else if (ext === ".docx") {
      const data = await mammoth.extractRawText({ path: file.path });
      resumeText = data.value;
    } else {
      console.log("[handleResumeUpload] Error: Unsupported file type:", ext);
      // No need to clean up here if multer's fileFilter already rejected it,
      // but if it passed fileFilter and then failed here, cleanup is good.
      // The fileFilter in routes/resume.js should prevent unsupported types.
      return res
        .status(400)
        .json({ error: "Unsupported file type. Please upload PDF or DOCX." });
    }

    // ---- START: TEMPORARY FILE DELETION (AFTER PARSING, BEFORE AI CALL) ----
    // We delete the file from /tmp as soon as we have its text content.
    // If AI call fails, we don't want to leave temp files hanging around.
    if (file && file.path && fs.existsSync(file.path)) {
      fs.unlink(file.path, (unlinkErr) => {
        if (unlinkErr) {
          console.error(
            "[handleResumeUpload] Error deleting temporary file after parsing:",
            file.path,
            unlinkErr
          );
        } else {
          console.log(
            "[handleResumeUpload] Successfully deleted temporary file after parsing:",
            file.path
          );
        }
      });
    }
    // ---- END: TEMPORARY FILE DELETION ----

    console.log(
      "[handleResumeUpload] File parsed. Extracted text length:",
      resumeText.length
    );

    resumeText = resumeText.replace(/\s+/g, " ").trim();
    if (resumeText.length === 0) {
      console.log(
        "[handleResumeUpload] Warning: Extracted resume text is empty after cleaning."
      );
      // Consider returning an error if text is empty, as AI analysis might not be useful
      // return res.status(400).json({ error: "Could not extract text from resume or resume is empty." });
    }

    console.log("[handleResumeUpload] Calling analyzeWithAI function...");
    const { analysis, atsScore } = await analyzeWithAI(resumeText, jobRole);

    console.log(
      "[handleResumeUpload] ATS Score returned from analyzeWithAI:",
      atsScore
    );
    console.log(
      "[handleResumeUpload] Analysis snippet returned from analyzeWithAI:",
      analysis ? analysis.substring(0, 200) + "..." : "N/A"
    );

    console.log("[handleResumeUpload] Saving analysis to MongoDB...");
    const newAnalysis = await ResumeAnalysis.create({
      fileName: file.originalname,
      jobRole,
      resumeText,
      aiFeedback: analysis,
      atsScore: atsScore,
      user: req.userId,
    });
    console.log(
      "[handleResumeUpload] Analysis saved with ID:",
      newAnalysis._id,
      "ATS Score saved:",
      atsScore
    );

    res.json({
      success: true,
      jobRole,
      analysis,
      atsScore,
      analysisId: newAnalysis._id,
    });
  } catch (err) {
    console.error(
      "[handleResumeUpload] CRITICAL ERROR in handleResumeUpload:",
      err.name,
      err.message,
      err.stack // Log more error details
    );
    // Attempt to clean up the uploaded file if an error occurs and file.path exists AND it wasn't deleted yet.
    // Note: if the error happened *after* the planned deletion, this won't do anything new.
    // If the error happened *before* parsing, `req.file` might be populated by multer, but it might not have been read yet.
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      // Use req.file.path
      fs.unlink(req.file.path, (unlinkErr) => {
        // Use req.file.path
        if (unlinkErr) {
          console.error(
            "[handleResumeUpload] Error cleaning up file from /tmp after an error:",
            req.file.path, // Use req.file.path
            unlinkErr
          );
        } else {
          console.log(
            "[handleResumeUpload] Cleaned up file from /tmp due to an error:",
            req.file.path // Use req.file.path
          );
        }
      });
    }
    res
      .status(500)
      .json({ error: "Failed to process resume. Please check server logs." });
  }
};

module.exports = { handleResumeUpload };
