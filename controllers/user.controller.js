const User = require("../models/user.model")
const { validationResult } = require("express-validator")
const { recordTransfer } = require("./transfer.controller")

const CACHE_DURATION = 300
const cache = new Map()

// Get all users with pagination and filtering
const getUsers = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const sortBy = req.query.sortBy || "createdAt"
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1
    const search = req.query.search || ""
    const role = req.query.role
    const isActive = req.query.isActive
    const country = req.query.country
    const walletStatus = req.query.walletStatus

    const cacheKey = `users_${page}_${limit}_${sortBy}_${sortOrder}_${search}_${role}_${isActive}_${country}_${walletStatus}`

    if (cache.has(cacheKey)) {
      const cachedData = cache.get(cacheKey)
      if (Date.now() - cachedData.timestamp < CACHE_DURATION * 1000) {
        return res.json(cachedData.data)
      }
      cache.delete(cacheKey)
    }

    const query = {}
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { inviteCode: { $regex: search, $options: "i" } },
      ]
    }

    if (role) query.role = role
    if (isActive !== undefined) query.isActive = isActive === "true"
    if (country) query.country = { $regex: country, $options: "i" }
    if (walletStatus) query.walletStatus = walletStatus

    const skip = (page - 1) * limit
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ])

    const totalPages = Math.ceil(total / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    const responseData = {
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage,
          hasPrevPage,
        },
      },
    }

    cache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
    })

    res.json(responseData)
  } catch (error) {
    console.error("Error in getUsers:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Update user - handles all editable fields from frontend
const updateUser = async (req, res) => {
  try {
    const { id } = req.params
    const updateData = req.body

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      })
    }

    const currentUser = await User.findById(id)
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Allowed fields for update
    const allowedFields = [
      "name",
      "email",
      "balance",
      "isActive",
      "role",
      "calculatorUsage",
      "inviteCode",
      "referredBy",
      "walletAddresses",
      "walletStatus",
      "country",
      "notificationSettings",
      "recentAmount",
      "screenshots",
    ]

    const updateObject = {}
    allowedFields.forEach((field) => {
      if (updateData.hasOwnProperty(field)) {
        updateObject[field] = updateData[field]
      }
    })

    // Handle nested objects
    if (updateData.walletAddresses) {
      updateObject.walletAddresses = {
        metamask: updateData.walletAddresses.metamask || currentUser.walletAddresses?.metamask || null,
        trustWallet: updateData.walletAddresses.trustWallet || currentUser.walletAddresses?.trustWallet || null,
      }
    }

    if (updateData.notificationSettings) {
      updateObject.notificationSettings = {
        sessionUnlocked:
          updateData.notificationSettings.sessionUnlocked ?? currentUser.notificationSettings?.sessionUnlocked ?? true,
        pushEnabled:
          updateData.notificationSettings.pushEnabled ?? currentUser.notificationSettings?.pushEnabled ?? true,
      }
    }

    const updatedUser = await User.findByIdAndUpdate(id, updateObject, {
      new: true,
      runValidators: true,
    }).select("-password")

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    cache.clear()

    res.json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
      changes: updateObject,
    })
  } catch (error) {
    console.error("Error in updateUser:", error)
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map((err) => err.message)
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: validationErrors,
      })
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0]
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      })
    }

    res.status(500).json({
      success: false,
      message: "Error updating user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Session Management
const updateUserSession = async (req, res) => {
  try {
    const { id } = req.params
    const { sessionNumber, action } = req.body

    if (!sessionNumber || !action) {
      return res.status(400).json({
        success: false,
        message: "Session number and action are required",
      })
    }

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    const sessionIndex = user.sessions.findIndex((s) => s.sessionNumber === sessionNumber)
    if (sessionIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      })
    }

    const session = user.sessions[sessionIndex]

    switch (action) {
      case "unlock":
        session.unlockedAt = new Date()
        session.isLocked = false
        break
      case "complete":
        session.completedAt = new Date()
        break
      case "claim":
        session.isClaimed = true
        break
      case "lock":
        session.isLocked = true
        break
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid action",
        })
    }

    await user.save()
    cache.clear()

    res.json({
      success: true,
      message: `Session ${sessionNumber} ${action}ed successfully`,
      session: session,
    })
  } catch (error) {
    console.error("Error in updateUserSession:", error)
    res.status(500).json({
      success: false,
      message: "Error updating session",
      error: error.message,
    })
  }
}

// Get user sessions
const getUserSessions = async (req, res) => {
  try {
    const { id } = req.params
    const user = await User.findById(id).select("sessions")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      sessions: user.sessions,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching sessions",
      error: error.message,
    })
  }
}

// Update notification settings
const updateNotificationSettings = async (req, res) => {
  try {
    const { id } = req.params
    const { sessionUnlocked, pushEnabled } = req.body

    const updateObject = {}
    if (sessionUnlocked !== undefined) updateObject["notificationSettings.sessionUnlocked"] = sessionUnlocked
    if (pushEnabled !== undefined) updateObject["notificationSettings.pushEnabled"] = pushEnabled

    const user = await User.findByIdAndUpdate(id, updateObject, { new: true }).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    cache.clear()

    res.json({
      success: true,
      message: "Notification settings updated successfully",
      notificationSettings: user.notificationSettings,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating notification settings",
      error: error.message,
    })
  }
}

// Add FCM token
const addFcmToken = async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.body

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      })
    }

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Add token if it doesn't exist
    if (!user.fcmTokens.includes(token)) {
      user.fcmTokens.push(token)
      await user.save()
    }

    cache.clear()

    res.json({
      success: true,
      message: "FCM token added successfully",
      fcmTokens: user.fcmTokens,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding FCM token",
      error: error.message,
    })
  }
}

// Remove FCM token
const removeFcmToken = async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.body

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      })
    }

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    user.fcmTokens = user.fcmTokens.filter((t) => t !== token)
    await user.save()

    cache.clear()

    res.json({
      success: true,
      message: "FCM token removed successfully",
      fcmTokens: user.fcmTokens,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing FCM token",
      error: error.message,
    })
  }
}

//GET Screenshots
 const getUserScreenshots = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user and only select the screenshots field
    const user = await User.findById(userId).select("screenshots");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      screenshots: user.screenshots || [],
    });
  } catch (error) {
    console.error("Error fetching screenshots:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// Add screenshot
const addScreenshot = async (req, res) => {
  try {
    const { id } = req.params
    const { screenshot } = req.body

    if (!screenshot) {
      return res.status(400).json({
        success: false,
        message: "Screenshot data is required",
      })
    }

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    user.screenshots.push({
      ...screenshot,
      uploadedAt: new Date(),
    })
    await user.save()

    cache.clear()

    res.json({
      success: true,
      message: "Screenshot added successfully",
      screenshots: user.screenshots,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding screenshot",
      error: error.message,
    })
  }
}

// Get user statistics
const getUserStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalBalance: { $sum: "$balance" },
          totalReferrals: {
            $sum: {
              $cond: [{ $ne: ["$referredBy", null] }, 1, 0],
            },
          },
          totalCalculatorUsage: { $sum: "$calculatorUsage" },
          connectedWallets: {
            $sum: {
              $cond: [
                {
                  $or: [
                    {
                      $and: [{ $ne: ["$walletAddresses.metamask", null] }, { $ne: ["$walletAddresses.metamask", ""] }],
                    },
                    {
                      $and: [
                        { $ne: ["$walletAddresses.trustWallet", null] },
                        { $ne: ["$walletAddresses.trustWallet", ""] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          activeUsers: {
            $sum: {
              $cond: [{ $eq: ["$isActive", true] }, 1, 0],
            },
          },
        },
      },
    ])

    const countryStats = await User.aggregate([
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])

    res.json({
      success: true,
      stats: stats[0] || {},
      countryStats,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user statistics",
      error: error.message,
    })
  }
}

// Existing functions (keeping all the original ones)
const getTotalReferrals = async (req, res) => {
  try {
    const totalReferrals = await User.countDocuments({
      referredBy: { $ne: null },
    })
    res.json({ success: true, totalReferrals })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching total referrals",
      error: error.message,
    })
  }
}

const banUser = async (req, res) => {
  try {
    const { id } = req.params
    const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true })
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }
    cache.clear()
    res.json({ success: true, message: "User banned", user })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error banning user",
      error: error.message,
    })
  }
}

const unbanUser = async (req, res) => {
  try {
    const { id } = req.params
    const user = await User.findByIdAndUpdate(id, { isActive: true }, { new: true })
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }
    cache.clear()
    res.json({ success: true, message: "User unbanned", user })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error unbanning user",
      error: error.message,
    })
  }
}

const manualCoinTransfer = async (req, res) => {
  try {
    const { id } = req.params
    const { amount, reason } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be positive",
      })
    }

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    const previousBalance = user.balance || 0
    user.balance = previousBalance + amount
    user.recentAmount = amount
    await user.save()

    cache.clear()

    res.json({
      success: true,
      message: "Coins transferred successfully",
      user,
      transaction: {
        previousBalance,
        newBalance: user.balance,
        amountTransferred: amount,
        reason,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error transferring coins",
      error: error.message,
    })
  }
}

const getTotalConnectedWallets = async (req, res) => {
  try {
    const totalWallets = await User.countDocuments({
      $or: [
        { "walletAddresses.metamask": { $ne: null, $exists: true, $ne: "" } },
        { "walletAddresses.trustWallet": { $ne: null, $exists: true, $ne: "" } },
      ],
    })
    res.json({ success: true, totalWallets })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching wallet count",
      error: error.message,
    })
  }
}

const getCalculatorUsers = async (req, res) => {
  try {
    const users = await User.find({ calculatorUsage: { $gt: 0 } })
    res.json({ success: true, users })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching calculator users",
      error: error.message,
    })
  }
}

const getTotalCalculatorUsage = async (req, res) => {
  try {
    const result = await User.aggregate([
      {
        $group: {
          _id: null,
          totalCalculatorUsage: { $sum: "$calculatorUsage" },
        },
      },
    ])
    const totalCalculatorUsage = result[0]?.totalCalculatorUsage || 0
    res.json({ success: true, totalCalculatorUsage })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching total calculator usage",
      error: error.message,
    })
  }
}

const editUserBalance = async (req, res) => {
  try {
    const { email, newBalance, admin } = req.body
    if (!email || typeof newBalance !== "number" || newBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid input: email and positive number required.",
      })
    }

    const user = await User.findOne({
      email: new RegExp(`^${email}$`, "i"),
    })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      })
    }

    const balanceBefore = user.balance || 0
    const newTotalBalance = balanceBefore + newBalance
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        balance: newTotalBalance,
        recentAmount: newBalance,
      },
      { new: true },
    )

    await recordTransfer({
      email: user.email,
      userName: user.name,
      amount: newBalance,
      adminName: admin || "System",
    })

    console.log(`[INFO] Admin "${admin}" updated balance of "${user.email}" by ${newBalance}`)

    cache.clear()

    return res.status(200).json({
      success: true,
      message: "Balance manually updated and transfer recorded.",
      user: updatedUser,
      transaction: {
        balanceBefore,
        newBalance: updatedUser.balance,
        amountChanged: newBalance,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    console.error("editUserBalance error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to update user balance.",
      error: error.message,
    })
  }
}

const updateProfile = async (req, res) => {
  try {
    const allowedUpdates = ["name", "username", "email", "country", "notificationSettings"]
    const updates = {}
    allowedUpdates.forEach((field) => {
      if (req.body[field]) {
        updates[field] = req.body[field]
      }
    })

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    })
  } catch (error) {
    console.error("Error in updateProfile:", error)
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password")
    res.json({ success: true, user })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching profile",
      error: error.message,
    })
  }
}
// Get total user count - ADD THIS FUNCTION
const getUserCount = async (req, res) => {
  try {
    console.log("🔢 /api/users/count endpoint called");
    
    // Count ALL users in the database
    const totalUsers = await User.countDocuments({});
    
    console.log(`✅ Total users found: ${totalUsers}`);
    
    res.json({
      success: true,
      count: totalUsers,
      totalUsers: totalUsers,
      message: `Total users: ${totalUsers}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Error counting users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to count users",
      details: error.message,
      count: 0
    });
  }
};
const changePassword = async (req, res) => {
  try {
    const userId = req.user._id
    const { oldPassword, newPassword, confirmPassword } = req.body

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    const isMatch = await user.comparePassword(oldPassword)
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Old password is incorrect",
      })
    }

    user.password = newPassword
    await user.save()

    res.json({ success: true, message: "Password changed successfully" })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error.message,
    })
  }
}

module.exports = {
  getUsers,
  updateUser,
  updateUserSession,
  getUserSessions,
  updateNotificationSettings,
  addFcmToken,
  removeFcmToken,
  getUserScreenshots,
  addScreenshot,
  getUserStats,
  getTotalReferrals,
  banUser,
  unbanUser,
  manualCoinTransfer,
  getTotalConnectedWallets,
  getCalculatorUsers,
  getTotalCalculatorUsage,
  editUserBalance,
  updateProfile,
  getProfile,
  changePassword,getUserCount,
}
