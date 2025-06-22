require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { MongoClient, GridFSBucket } = require('mongodb');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// MongoDB connection
const mongoUrl = process.env.MONGODB_URI;
let db, gfs;

MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
  .then(client => {
    db = client.db();
    gfs = new GridFSBucket(db, { bucketName: 'pdfs' });
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://currencychronicle.in' : 'http://localhost:3000'
}));
app.use(express.json());

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: { fileSize: 1024 * 1024 * 10 } // 10MB limit
});

// Upload PDF endpoint
app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadStream = gfs.openUploadStream(req.file.originalname, {
      contentType: 'application/pdf',
      metadata: { uploadDate: new Date() }
    });

    uploadStream.end(req.file.buffer);
    uploadStream.on('finish', () => {
      res.status(200).json({ message: 'PDF uploaded successfully', filename: req.file.originalname });
    });
    uploadStream.on('error', (err) => {
      res.status(500).json({ error: 'Error uploading PDF', details: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Get latest PDF endpoint
app.get('/latest-pdf', async (req, res) => {
  try {
    const files = await db.collection('pdfs.files')
      .find({})
      .sort({ 'metadata.uploadDate': -1 })
      .limit(1)
      .toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'No PDFs found' });
    }

    const file = files[0];
    res.set('Content-Type', file.contentType);
    res.set('Content-Disposition', `inline; filename="${file.filename}"`);

    const downloadStream = gfs.openDownloadStream(file._id);
    downloadStream.pipe(res);
    downloadStream.on('error', (err) => {
      res.status(500).json({ error: 'Error retrieving PDF', details: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'API is running' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});