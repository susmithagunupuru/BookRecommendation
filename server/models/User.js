const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  verified: { type: Boolean, default: true }, // Verification is auto-true as OTP Nodemailer is removed
  profileImage: { type: String, default: 'https://lh3.googleusercontent.com/aida-public/avatar-default.png' },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  likedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  role: { type: String, default: 'user' }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
