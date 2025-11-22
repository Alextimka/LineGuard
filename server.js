const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    const allowedTypes = /jpeg|jpg|png|gif|bmp|tiff/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, bmp, tiff)'));
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle image upload and YOLO processing
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const imagePath = req.file.path;
    
    // Call Python YOLO script
    const yoloResults = await runYoloDetection(imagePath);
    
    // Clean up uploaded file after processing
    setTimeout(() => {
      try {
        fs.unlinkSync(imagePath);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }, 5000); // Delete file after 5 seconds
    
    res.json({
      success: true,
      imagePath: imagePath,
      detections: yoloResults
    });
    
  } catch (error) {
    console.error('Upload processing error:', error);
    
    // Clean up file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file after error:', cleanupError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during image processing'
    });
  }
});

// Function to run YOLO detection using Python script
function runYoloDetection(imagePath) {
  return new Promise((resolve, reject) => {
    // Check if Python script exists
    const pythonScriptPath = path.join(__dirname, 'yolo_detector.py');
    
    if (!fs.existsSync(pythonScriptPath)) {
      reject(new Error('YOLO detection script not found'));
      return;
    }
    
    // Spawn Python process
    const pythonProcess = spawn('python', [pythonScriptPath, imagePath]);
    
    let result = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // Parse JSON result from Python script
          const yoloResponse = JSON.parse(result.trim());
          
          // Extract just the detections array from the YOLO response
          if (yoloResponse.success && Array.isArray(yoloResponse.detections)) {
            resolve(yoloResponse.detections);
          } else {
            reject(new Error('YOLO response did not contain valid detections'));
          }
        } catch (parseError) {
          console.log('Raw Python output:', result);
          reject(new Error(`Failed to parse YOLO results: ${parseError.message}`));
        }
      } else {
        reject(new Error(`YOLO processing failed: ${error || `Process exited with code ${code}`}`));
      }
    });
    
    pythonProcess.on('error', (spawnError) => {
      reject(new Error(`Failed to start YOLO process: ${spawnError.message}`));
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('YOLO processing timeout'));
    }, 30000);
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'LineGuard Server is running',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
  }
  
  console.error('Global error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 LineGuard Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload endpoint: POST http://localhost:${PORT}/upload`);
  console.log(`🛡️  LineGuard Interface: http://localhost:${PORT}`);
});

module.exports = app;