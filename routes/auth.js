/**
 * Authentication Routes
 * Handles user registration and login endpoints
 */

const express = require("express");
const router = express.Router();
const { register, login } = require("../controllers/authController");

// User registration endpoint
router.post("/register", register);

// User login endpoint
router.post("/login", login);

module.exports = router;
