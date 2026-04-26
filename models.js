const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Item Schema
const itemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  uniqueCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['active', 'returned', 'deactivated'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  returnedAt: {
    type: Date
  }
});

// Message Schema
const messageSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  senderType: {
    type: String,
    enum: ['finder', 'owner'],
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  time: {
    type: Date,
    default: Date.now
  },
  isAbuse: {
    type: Boolean,
    default: false
  },
  senderIP: {
    type: String
  }
});

const User = mongoose.model('User', userSchema);
const Item = mongoose.model('Item', itemSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = { User, Item, Message };
