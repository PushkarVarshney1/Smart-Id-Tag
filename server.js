require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const { User, Item, Message } = require('./models');
const { sendMessageNotification } = require('./emailService');
const { 
  generateItemCode, 
  generateQRCode, 
  sanitizeInput, 
  isAuthenticated 
} = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for simplicity
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions"
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests
  message: 'Too many attempts, please try again later'
});

const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 messages
  message: 'Too many messages sent, please try again later'
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================
// API ROUTES
// ============================================

// POST /register - Register new user
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name: sanitizeInput(name),
      email: email.toLowerCase(),
      passwordHash
    });

    await user.save();

    // Auto login
    req.session.userId = user._id;
    req.session.userName = user.name;

    res.json({ 
      success: true, 
      message: 'Registration successful',
      user: { id: user._id, name: user.name, email: user.email }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /login - User login
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create session
    req.session.userId = user._id;
    req.session.userName = user.name;

    res.json({ 
      success: true, 
      message: 'Login successful',
      user: { id: user._id, name: user.name, email: user.email }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /logout - User logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// GET /api/check-auth - Check authentication status
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ 
      authenticated: true, 
      user: { 
        id: req.session.userId, 
        name: req.session.userName 
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// POST /api/add-item - Add new item
app.post('/api/add-item', isAuthenticated, async (req, res) => {
  try {
    const { itemName, description } = req.body;

    if (!itemName) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    // Generate unique code
    let uniqueCode;
    let isUnique = false;
    
    while (!isUnique) {
      uniqueCode = generateItemCode();
      const existing = await Item.findOne({ uniqueCode });
      if (!existing) isUnique = true;
    }

    // Create item
    const item = new Item({
      userId: req.session.userId,
      itemName: sanitizeInput(itemName),
      description: sanitizeInput(description),
      uniqueCode,
      status: 'active'
    });

    await item.save();

    // Generate QR code
    const qrCode = await generateQRCode(uniqueCode, process.env.BASE_URL);

    res.json({ 
      success: true, 
      message: 'Item added successfully',
      item: {
        id: item._id,
        itemName: item.itemName,
        description: item.description,
        uniqueCode: item.uniqueCode,
        qrCode,
        createdAt: item.createdAt
      }
    });

  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// GET /api/my-items - Get user's items
app.get('/api/my-items', isAuthenticated, async (req, res) => {
  try {
    const items = await Item.find({ userId: req.session.userId })
      .sort({ createdAt: -1 });

    // Get message counts for each item
    const itemsWithCounts = await Promise.all(items.map(async (item) => {
      const messageCount = await Message.countDocuments({ 
        itemId: item._id 
      });
      
      return {
        id: item._id,
        itemName: item.itemName,
        description: item.description,
        uniqueCode: item.uniqueCode,
        status: item.status,
        createdAt: item.createdAt,
        returnedAt: item.returnedAt,
        messageCount
      };
    }));

    res.json({ items: itemsWithCounts });

  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

//  Get single item details
app.get('/api/item/:id', isAuthenticated, async (req, res) => {
  try {
    const item = await Item.findOne({ 
      _id: req.params.id, 
      userId: req.session.userId 
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Generate QR code
    const qrCode = await generateQRCode(item.uniqueCode, process.env.BASE_URL);

    res.json({ 
      item: {
        id: item._id,
        itemName: item.itemName,
        description: item.description,
        uniqueCode: item.uniqueCode,
        status: item.status,
        qrCode,
        createdAt: item.createdAt
      }
    });

  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// GET /api/find/:code - Check if code is valid (public endpoint)
app.get('/api/find/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    
    const item = await Item.findOne({ uniqueCode: code });

    if (!item) {
      return res.status(404).json({ error: 'Invalid code', found: false });
    }

    if (item.status !== 'active') {
      return res.status(400).json({ 
        error: 'This item has been marked as returned or deactivated', 
        found: false 
      });
    }

    res.json({ 
      found: true,
      item: {
        id: item._id,
        itemName: item.itemName,
        description: item.description,
        code: item.uniqueCode
      }
    });

  } catch (error) {
    console.error('Find item error:', error);
    res.status(500).json({ error: 'Failed to find item' });
  }
});

// POST /api/send-message - Send message from finder to owner
app.post('/api/send-message', messageLimiter, async (req, res) => {
  try {
    const { itemId, message, finderEmail } = req.body;

    if (!itemId || !message) {
      return res.status(400).json({ error: 'Item ID and message are required' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    // Get item and owner details
    const item = await Item.findById(itemId).populate('userId');

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.status !== 'active') {
      return res.status(400).json({ error: 'This item is no longer active' });
    }

    // Save message
    const newMessage = new Message({
      itemId: item._id,
      senderType: 'finder',
      text: sanitizeInput(message),
      senderIP: req.ip
    });

    await newMessage.save();

    // Send email notification to owner
    await sendMessageNotification(
      item.userId.email,
      item.itemName,
      message,
      item.uniqueCode
    );

    res.json({ 
      success: true, 
      message: 'Message sent successfully! The owner will be notified.' 
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get messages for an item (owner only)
app.get('/api/messages/:itemId', isAuthenticated, async (req, res) => {
  try {
    
    const item = await Item.findOne({ 
      _id: req.params.itemId, 
      userId: req.session.userId 
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found or access denied' });
    }

    const messages = await Message.find({ itemId: item._id })
      .sort({ time: 1 });

    res.json({ 
      item: {
        id: item._id,
        itemName: item.itemName,
        code: item.uniqueCode,
        status: item.status
      },
      messages: messages.map(m => ({
        id: m._id,
        senderType: m.senderType,
        text: m.text,
        time: m.time,
        isAbuse: m.isAbuse
      }))
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Owner replies to finder
app.post('/api/reply/:itemId', isAuthenticated, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const item = await Item.findOne({ 
      _id: req.params.itemId, 
      userId: req.session.userId 
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found or access denied' });
    }

    const reply = new Message({
      itemId: item._id,
      senderType: 'owner',
      text: sanitizeInput(message)
    });

    await reply.save();

    res.json({ 
      success: true, 
      message: 'Reply sent successfully',
      reply: {
        id: reply._id,
        senderType: reply.senderType,
        text: reply.text,
        time: reply.time
      }
    });

  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

//  Mark item as returned
app.post('/api/mark-returned/:itemId', isAuthenticated, async (req, res) => {
  try {
    const item = await Item.findOne({ 
      _id: req.params.itemId, 
      userId: req.session.userId 
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    item.status = 'returned';
    item.returnedAt = new Date();
    await item.save();

    res.json({ 
      success: true, 
      message: 'Item marked as returned',
      item: {
        id: item._id,
        status: item.status,
        returnedAt: item.returnedAt
      }
    });

  } catch (error) {
    console.error('Mark returned error:', error);
    res.status(500).json({ error: 'Failed to update item status' });
  }
});

//  Report abusive message
app.post('/api/report-abuse/:messageId', isAuthenticated, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const item = await Item.findOne({ 
      _id: message.itemId, 
      userId: req.session.userId 
    });

    if (!item) {
      return res.status(403).json({ error: 'Access denied' });
    }

    message.isAbuse = true;
    await message.save();

    res.json({ 
      success: true, 
      message: 'Message reported as abuse. Thank you for reporting.' 
    });

  } catch (error) {
    console.error('Report abuse error:', error);
    res.status(500).json({ error: 'Failed to report message' });
  }
});

// Delete an item
app.delete('/api/item/:id', isAuthenticated, async (req, res) => {
  try {
    const item = await Item.findOne({ 
      _id: req.params.id, 
      userId: req.session.userId 
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Delete associated messages
    await Message.deleteMany({ itemId: item._id });

    // Delete item
    await Item.deleteOne({ _id: item._id });

    res.json({ 
      success: true, 
      message: 'Item deleted successfully' 
    });

  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/add-item', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add-item.html'));
});

app.get('/find/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'finder.html'));
});

app.get('/chat/:itemId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/item/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'item-detail.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Email configured: ${process.env.EMAIL_USER ? 'Yes' : 'No'}`);
});


