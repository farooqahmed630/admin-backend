const express = require("express")
const router = express.Router()
const userController = require("../controllers/user.controller")
const { body } = require("express-validator")

// Validation middleware for user updates
const validateUserUpdate = [
  body("name").optional().trim().isLength({ min: 1 }).withMessage("Name cannot be empty"),
  body("email").optional().isEmail().withMessage("Please provide a valid email"),
  body("balance").optional().isNumeric().withMessage("Balance must be a number"),
  body("role").optional().isIn(["user", "admin", "moderator", "superadmin"]).withMessage("Invalid role"),
  body("calculatorUsage").optional().isInt({ min: 0 }).withMessage("Calculator usage must be a non-negative integer"),
  body("inviteCode").optional().trim(),
  body("referredBy").optional().trim(),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  body("country").optional().trim().isLength({ min: 1 }).withMessage("Country cannot be empty"),
  body("walletStatus").optional().isIn(["Connected", "Not Connected", "Pending"]).withMessage("Invalid wallet status"),
  body("recentAmount").optional().isNumeric().withMessage("Recent amount must be a number"),
]

// Validation for session updates
const validateSessionUpdate = [
  body("sessionNumber").isInt({ min: 1, max: 4 }).withMessage("Session number must be between 1 and 4"),
  body("action").isIn(["unlock", "complete", "claim", "lock"]).withMessage("Invalid action"),
]

// Validation for notification settings
const validateNotificationSettings = [
  body("sessionUnlocked").optional().isBoolean().withMessage("sessionUnlocked must be a boolean"),
  body("pushEnabled").optional().isBoolean().withMessage("pushEnabled must be a boolean"),
]

// Validation for FCM token
const validateFcmToken = [body("token").notEmpty().withMessage("FCM token is required")]

// Validation for screenshot
const validateScreenshot = [
  body("screenshot").notEmpty().withMessage("Screenshot data is required"),
  body("screenshot.url").optional().isURL().withMessage("Screenshot URL must be valid"),
  body("screenshot.description").optional().trim(),
]

// Debug: Check if all controller functions exist
console.log("Available controller functions:", Object.keys(userController))

// ===== BASIC USER ROUTES =====

// Get all users (with pagination, search, filtering)
router.get("/", userController.getUsers)
// ===== USER COUNT ENDPOINT =====

// Get total user count
router.get("/count", userController.getUserCount);
// Get user profile (current user)
// router.get("/profile", auth, userController.getProfile)
// ... existing routes ...

// ===== USER COUNT ENDPOINT =====

// Get total user count
router.get("/count", userController.getUserCount);

// ===== STATISTICS AND ANALYTICS =====

// Get comprehensive user statistics
router.get("/stats/overview", userController.getUserStats)

// ... rest of the routes ...
// Update user profile (current user)
// router.put("/profile", auth, userController.updateProfile)

// Update any user (admin function)
router.put("/:id", validateUserUpdate, userController.updateUser)

// ===== SESSION MANAGEMENT =====

// Get user sessions
router.get("/:id/sessions", userController.getUserSessions)

// Update user session (unlock, complete, claim, lock)
router.put("/:id/sessions", validateSessionUpdate, userController.updateUserSession)

// ===== NOTIFICATION SETTINGS =====

// Update notification settings
router.put("/:id/notifications", validateNotificationSettings, userController.updateNotificationSettings)

// ===== FCM TOKEN MANAGEMENT =====

// Add FCM token
router.post("/:id/fcm-token", validateFcmToken, userController.addFcmToken)

// Remove FCM token
router.delete("/:id/fcm-token", validateFcmToken, userController.removeFcmToken)

// ===== SCREENSHOT MANAGEMENT =====x

//GET Screenshot
router.get("/:userId/screenshots", userController.getUserScreenshots);

// Add screenshot
router.post("/:id/screenshots", validateScreenshot, userController.addScreenshot)

// ===== STATISTICS AND ANALYTICS =====

// Get comprehensive user statistics
router.get("/stats/overview", userController.getUserStats)

// Get total referrals
router.get("/stats/referrals", userController.getTotalReferrals)

// Get total connected wallets
router.get("/stats/wallets", userController.getTotalConnectedWallets)

// Get calculator users
router.get("/calculator-users", userController.getCalculatorUsers)

// Get total calculator usage
router.get("/stats/calculator-usage", userController.getTotalCalculatorUsage)

// ===== USER MANAGEMENT ACTIONS =====

// Ban user
router.put("/:id/ban", userController.banUser)

// Unban user
router.put("/:id/unban", userController.unbanUser)

// Manual coin transfer
router.post("/:id/transfer", userController.manualCoinTransfer)

// Edit user balance (specific endpoint)
router.post("/edit-balance", userController.editUserBalance)

// ===== AUTHENTICATION ROUTES (commented out - uncomment when auth middleware is available) =====

// Change password
// router.put("/change-password", auth, userController.changePassword)

// Protected profile routes
// router.get("/profile", auth, userController.getProfile)
// router.put("/profile", auth, userController.updateProfile)

// Protected admin routes
// router.put("/:id", auth, validateUserUpdate, userController.updateUser)
// router.put("/:id/ban", auth, userController.banUser)
// router.put("/:id/unban", auth, userController.unbanUser)
// router.post("/:id/transfer", auth, userController.manualCoinTransfer)
// router.post("/edit-balance", auth, userController.editUserBalance)
// router.put("/:id/sessions", auth, validateSessionUpdate, userController.updateUserSession)
// router.put("/:id/notifications", auth, validateNotificationSettings, userController.updateNotificationSettings)
// router.post("/:id/fcm-token", auth, validateFcmToken, userController.addFcmToken)
// router.delete("/:id/fcm-token", auth, validateFcmToken, userController.removeFcmToken)
// router.post("/:id/screenshots", auth, validateScreenshot, userController.addScreenshot)

module.exports = router
