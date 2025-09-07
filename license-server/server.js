import express from 'express';
import cors from 'cors';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Get the current file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
const file = join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

// Initialize database with default data if it doesn't exist
async function initializeDB() {
  await db.read();
  if (!db.data || !db.data.licenses) {
    db.data = { licenses: [] };
    await db.write();
  }
}

// Routes
app.get('/api/licenses', async (req, res) => {
  await db.read();
  res.json(db.data.licenses || []);
});

app.post('/api/licenses', async (req, res) => {
  const { licenseKey } = req.body;
  
  if (!licenseKey) {
    return res.status(400).json({ error: 'License key is required' });
  }
  
  await db.read();
  
  // Ensure db.data.licenses exists
  if (!db.data.licenses) {
    db.data.licenses = [];
  }
  
  // Check if license already exists
  const exists = db.data.licenses.some(license => license.key === licenseKey);
  if (exists) {
    return res.status(400).json({ error: 'License key already exists' });
  }
  
  // Add new license
  db.data.licenses.push({
    key: licenseKey,
    active: true,
    createdAt: new Date().toISOString()
  });
  
  await db.write();
  res.status(201).json({ message: 'License added successfully' });
});

app.delete('/api/licenses/:licenseKey', async (req, res) => {
  const { licenseKey } = req.params;
  
  await db.read();
  
  // Ensure db.data.licenses exists
  if (!db.data.licenses) {
    return res.status(404).json({ error: 'No licenses found' });
  }
  
  const initialLength = db.data.licenses.length;
  db.data.licenses = db.data.licenses.filter(license => license.key !== licenseKey);
  
  if (db.data.licenses.length === initialLength) {
    return res.status(404).json({ error: 'License not found' });
  }
  
  await db.write();
  res.json({ message: 'License removed successfully' });
});

app.get('/api/validate/:licenseKey', async (req, res) => {
  const { licenseKey } = req.params;
  
  await db.read();
  
  // Ensure db.data.licenses exists
  if (!db.data.licenses) {
    return res.json({ valid: false, error: 'No licenses found' });
  }
  
  const license = db.data.licenses.find(
    license => license.key === licenseKey && license.active === true
  );
  
  if (license) {
    res.json({ valid: true });
  } else {
    res.status(404).json({ valid: false, error: 'Invalid or inactive license' });
  }
});

// Start server
async function startServer() {
  try {
    await initializeDB();
    app.listen(PORT, () => {
      console.log(`License server running on port ${PORT}`);
      console.log(`Database file: ${file}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
