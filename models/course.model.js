const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    courseName: { type: String, required: true, unique: true },
    // Remove the single language field - we'll store all languages in the pages
    
    pages: [
      {
        // Title in all 5 languages
        title: {
          en: { type: String, required: true },
          hi: { type: String, default: "" },
          ur: { type: String, default: "" },
          ar: { type: String, default: "" },
          es: { type: String, default: "" }
        },
        // Content in all 5 languages
        content: {
          en: { type: String, required: true },
          hi: { type: String, default: "" },
          ur: { type: String, default: "" },
          ar: { type: String, default: "" },
          es: { type: String, default: "" }
        },
        time: { type: String, required: true },
      },
    ],
    uploadedBy: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Course = mongoose.model("Course", courseSchema);

module.exports = Course;
