const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const axios = require("axios"); // Make sure axios is required
const ResumeAnalysis = require("../models/ResumeAnalysis");

// --- START: MODIFIED analyzeWithAI function ---
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
  // console.log("[analyzeWithAI] Full Prompt being sent to AI:\n", prompt); // Optional: Uncomment to log the full prompt if needed

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo", // Or your preferred model
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, // Crucial: Ensure this env variable is set
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[analyzeWithAI] Step 2: AI API Call Successful.");
    const content = response.data.choices[0].message.content;
    console.log("[analyzeWithAI] Step 3: Raw AI Response Content:\n", content); // Log the FULL response

    let atsScore = null;
    // Original Regex: Ensure this matches the AI's output format for the score
    // In analyzeWithAI function in resumeController.js
    const match = content.match(
      /ATS Compatibility (?:Score|Rating):\s*(\d+(\.\d+)?)\/10/i
    );
    console.log("[analyzeWithAI] Step 4: ATS Score Regex Match Result:", match);

    if (match && match[1]) {
      // Ensure 'match' is not null and 'match[1]' (the capturing group for the number) exists
      atsScore = parseFloat(match[1]);
      console.log(
        "[analyzeWithAI] Step 5: Successfully Parsed ATS Score:",
        atsScore
      );
    } else {
      console.log(
        "[analyzeWithAI] Step 5: Failed to parse ATS Score from AI response. 'match' or 'match[1]' was null/undefined."
      );
    }

    return {
      analysis: content,
      atsScore: atsScore, // Will be null if not parsed or if an error occurred
    };
  } catch (aiError) {
    console.error("[analyzeWithAI] CRITICAL ERROR CALLING OPENROUTER AI:");
    if (aiError.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("AI Error - Data:", aiError.response.data);
      console.error("AI Error - Status:", aiError.response.status);
      console.error("AI Error - Headers:", aiError.response.headers);
    } else if (aiError.request) {
      // The request was made but no response was received
      console.error(
        "AI Error - Request (No response received):",
        aiError.request
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error(
        "AI Error - Message (Error in setting up request):",
        aiError.message
      );
    }
    // console.error("AI Error Config:", aiError.config); // Optional: Log the config of the failed request
    return {
      analysis:
        "Error: Could not retrieve AI analysis due to an API failure. Please check backend logs.",
      atsScore: null, // Ensure atsScore is null if the AI call fails
    };
  }
};
// --- END: MODIFIED analyzeWithAI function ---

const handleResumeUpload = async (req, res) => {
  const file = req.file; // Define file here to access it in catch block if needed

  try {
    console.log("[handleResumeUpload] Received request to upload resume.");
    const jobRole = req.body.jobRole || "Frontend Developer"; // Default job role if not provided
    console.log("[handleResumeUpload] Job Role:", jobRole);

    if (!file) {
      console.log("[handleResumeUpload] Error: No file uploaded.");
      return res.status(400).json({ error: "No file uploaded" });
    }
    console.log(
      "[handleResumeUpload] File received:",
      file.originalname,
      "Size:",
      file.size,
      "Path:",
      file.path
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
      // Clean up the uploaded file if it's unsupported and exists
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        console.log(
          "[handleResumeUpload] Cleaned up unsupported file:",
          file.path
        );
      }
      return res
        .status(400)
        .json({ error: "Unsupported file type. Please upload PDF or DOCX." });
    }

    // Clean up the uploaded file from 'uploads/' directory after parsing its content
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      console.log(
        "[handleResumeUpload] Cleaned up successfully parsed file:",
        file.path
      );
    }
    console.log(
      "[handleResumeUpload] File parsed. Extracted text length:",
      resumeText.length
    );

    // Basic text cleaning
    resumeText = resumeText.replace(/\s+/g, " ").trim();
    if (resumeText.length === 0) {
      console.log(
        "[handleResumeUpload] Warning: Extracted resume text is empty after cleaning."
      );
    }

    console.log("[handleResumeUpload] Calling analyzeWithAI function...");
    const { analysis, atsScore } = await analyzeWithAI(resumeText, jobRole);

    // --- THIS IS A KEY LOGGING POINT ---
    console.log(
      "[handleResumeUpload] ATS Score returned from analyzeWithAI:",
      atsScore
    );
    console.log(
      "[handleResumeUpload] Analysis snippet returned from analyzeWithAI:",
      analysis ? analysis.substring(0, 200) + "..." : "N/A"
    ); // Log a snippet
    // --- END OF KEY LOGGING POINT ---

    console.log("[handleResumeUpload] Saving analysis to MongoDB...");
    const newAnalysis = await ResumeAnalysis.create({
      fileName: file.originalname,
      jobRole,
      resumeText, // Storing the cleaned resume text
      aiFeedback: analysis, // Storing the full AI analysis
      atsScore: atsScore, // Storing the parsed ATS score (could be null)
      user: req.userId, // From authMiddleware
    });
    console.log(
      "[handleResumeUpload] Analysis saved with ID:",
      newAnalysis._id,
      "ATS Score saved:",
      atsScore
    );

    // Respond to the client
    res.json({
      success: true,
      jobRole,
      analysis, // Send full analysis back
      atsScore, // Send parsed ATS score back
      analysisId: newAnalysis._id, // Send the ID of the new analysis document
    });
  } catch (err) {
    console.error(
      "[handleResumeUpload] CRITICAL ERROR in handleResumeUpload:",
      err
    );
    // Attempt to clean up the uploaded file if an error occurs and file path exists
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
        console.log(
          "[handleResumeUpload] Cleaned up file due to error:",
          file.path
        );
      } catch (unlinkErr) {
        console.error(
          "[handleResumeUpload] Error cleaning up file after an error:",
          unlinkErr
        );
      }
    }
    res
      .status(500)
      .json({ error: "Failed to process resume. Please check server logs." });
  }
};

module.exports = { handleResumeUpload };
