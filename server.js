require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const sharp = require("sharp");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// MongoDB Atlas Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Atlas Connected Successfully"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// MongoDB Portfolio Schema (Flexible Link for Gallery)
const portfolioSchema = new mongoose.Schema({
  title: { type: String, required: true },
  link: { type: String, default: "#" },
  category: { type: String, required: true },
  imageUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Portfolio = mongoose.model("Portfolio", portfolioSchema);

// Memory Storage for Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ================= ROUTES ================= */

// 1. Admin Login Verification
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return res.json({ success: true, message: "Login successful!" });
  }
  return res.status(401).json({ success: false, message: "Invalid username or password" });
});

// 2. Upload Portfolio Item
app.post("/api/portfolio", upload.single("image"), async (req, res) => {
  try {
    const { title, link, category } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image file is required" });
    }

    // Dynamic Image Optimization (Resize & Compress via Sharp)
    let sharpInstance = sharp(req.file.buffer);

    if (category === "gallery") {
      // Gallery Section 6 Images (16:9 Landscape Ratio)
      sharpInstance = sharpInstance.resize(800, 450, { fit: "cover" });
    } else {
      // Portfolio Cards (1:1 Square Ratio)
      sharpInstance = sharpInstance.resize(600, 600, { fit: "cover" });
    }

    const compressedImageBuffer = await sharpInstance
      .jpeg({ quality: 80 })
      .toBuffer();

    // Upload Compressed Buffer to Cloudinary
    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "portfolio_items" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        stream.end(compressedImageBuffer);
      });
    };

    const cloudinaryRes = await uploadToCloudinary();

    // Save Record to MongoDB
    const newItem = new Portfolio({
      title,
      link: link || "#",
      category,
      imageUrl: cloudinaryRes.secure_url,
    });

    await newItem.save();
    res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Get All Items (or Filter by Category)
app.get("/api/portfolio", async (req, res) => {
  try {
    const { category } = req.query;
    let query = {};
    if (category && category !== "all") {
      query.category = category;
    }
    const items = await Portfolio.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Update Portfolio Item
app.put("/api/portfolio/:id", upload.single("image"), async (req, res) => {
  try {
    const { title, link, category } = req.body;
    let updateData = { title, link: link || "#", category };

    // If new image uploaded
    if (req.file) {
      let sharpInstance = sharp(req.file.buffer);

      if (category === "gallery") {
        sharpInstance = sharpInstance.resize(800, 450, { fit: "cover" });
      } else {
        sharpInstance = sharpInstance.resize(600, 600, { fit: "cover" });
      }

      const compressedImageBuffer = await sharpInstance
        .jpeg({ quality: 80 })
        .toBuffer();

      const uploadToCloudinary = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "portfolio_items" },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          stream.end(compressedImageBuffer);
        });
      };

      const cloudinaryRes = await uploadToCloudinary();
      updateData.imageUrl = cloudinaryRes.secure_url;
    }

    const updatedItem = await Portfolio.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, data: updatedItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Delete Portfolio Item
app.delete("/api/portfolio/:id", async (req, res) => {
  try {
    await Portfolio.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend Server running on port ${PORT}`));