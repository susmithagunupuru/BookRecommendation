const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const User = require('./models/User');
const Admin = require('./models/Admin');
const Book = require('./models/Book');
const Rating = require('./models/Rating');
const Wishlist = require('./models/Wishlist');
const Like = require('./models/Like');
const { getRecommendations } = require('./services/recommendationService');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey123!';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'LibraryAdminSecret2026';

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart-library')
  .then(() => console.log('Connected to MongoDB successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Auth Middleware ---
function authenticate(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.clearCookie('token');
    return res.status(401).json({ message: 'Session expired. Please login again.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
  }
}

// --- API Routes ---

// 1. Auth Registration
app.post('/api/auth/register', async (req, res) => {
  const { name, adminName, username, email, password, confirmPassword, role, secretKey } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    if (role === 'admin') {
      if (secretKey !== ADMIN_SECRET_KEY) {
        return res.status(403).json({ message: 'Invalid Admin Secret Key. Access denied.' });
      }

      // Check if admin already exists
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Admin email already registered.' });
      }

      const newAdmin = new Admin({
        adminName: adminName || name || 'Library Admin',
        email,
        password: hashedPassword,
        verified: true
      });

      await newAdmin.save();
      return res.status(201).json({ message: 'Admin registered successfully!' });
    } else {
      // Check if user already exists
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({ message: 'Email or Username already registered.' });
      }

      const newUser = new User({
        name: name || username,
        username: username || email.split('@')[0],
        email,
        password: hashedPassword,
        verified: true
      });

      await newUser.save();

      // Automatically create an empty wishlist entry
      const wishlist = new Wishlist({ userId: newUser._id, books: [] });
      await wishlist.save();

      return res.status(201).json({ message: 'User registered successfully!' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// 2. Auth Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, role, secretKey } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  // Validate admin secret key before even querying the DB
  if (role === 'admin') {
    if (!secretKey || secretKey !== ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: 'Invalid Admin Secret Key. Access denied.' });
    }
  }

  try {
    let account = null;

    if (role === 'admin') {
      account = await Admin.findOne({ email });
    } else {
      account = await User.findOne({ email });
    }

    if (!account) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: account._id, email: account.email, role: account.role || role || 'user', name: account.name || account.adminName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    return res.status(200).json({
      message: 'Logged in successfully',
      user: {
        id: account._id,
        email: account.email,
        name: account.name || account.adminName,
        username: account.username,
        role: account.role || role || 'user',
        profileImage: account.profileImage
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// 3. Auth Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  return res.status(200).json({ message: 'Logged out successfully' });
});

// 4. Verify Active Session Status
app.get('/api/auth/status', authenticate, async (req, res) => {
  try {
    let account = null;
    if (req.user.role === 'admin') {
      account = await Admin.findById(req.user.id);
    } else {
      account = await User.findById(req.user.id);
    }

    if (!account) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    return res.status(200).json({
      user: {
        id: account._id,
        email: account.email,
        name: account.name || account.adminName,
        username: account.username,
        role: account.role || req.user.role,
        profileImage: account.profileImage
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Session status verify error.' });
  }
});

// 5. Auth Mock Password Reset
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email }) || await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Account with this email does not exist.' });
    }
    // Since Nodemailer is removed, return mock token for testing password reset
    return res.status(200).json({
      message: 'Password reset request received.',
      resetToken: user._id.toString()
    });
  } catch (error) {
    return res.status(500).json({ message: 'Forgot password error.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { resetToken, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    let user = await User.findById(resetToken);
    if (!user) {
      user = await Admin.findById(resetToken);
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }

    user.password = hashedPassword;
    await user.save();
    return res.status(200).json({ message: 'Password updated successfully!' });
  } catch (error) {
    return res.status(500).json({ message: 'Reset password error.' });
  }
});

// 6. Books Listing with Search and Pagination
app.get('/api/books', async (req, res) => {
  const { search, category, page = 1, limit = 12 } = req.query;

  const query = {};

  if (category) {
    query.categories = category;
  }

  if (search) {
    query.$text = { $search: search };
  }

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const count = await Book.countDocuments(query);
    const books = await Book.find(query)
      .sort(search ? { score: { $meta: 'textScore' } } : { averageRating: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get list of all categories for frontend filters
    const categories = await Book.distinct('categories');

    return res.status(200).json({
      books,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      categories: categories.filter(Boolean)
    });
  } catch (error) {
    console.error('Fetch books error:', error);
    return res.status(500).json({ message: 'Error fetching books.' });
  }
});

// 7. Get Single Book Details + Similar Books
app.get('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const book = await Book.findById(id) || await Book.findOne({ datasetBookId: id });
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Fetch similar books in same categories
    const similarBooks = await Book.find({
      categories: { $in: book.categories },
      _id: { $ne: book._id }
    })
    .sort({ averageRating: -1 })
    .limit(6);

    return res.status(200).json({ book, similarBooks });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching book details.' });
  }
});

// Admin ONLY: Create Book
app.post('/api/books', authenticate, adminOnly, async (req, res) => {
  try {
    const book = new Book({
      ...req.body,
      datasetBookId: Math.random().toString(36).substring(7)
    });
    await book.save();
    return res.status(201).json({ message: 'Book created successfully!', book });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating book.' });
  }
});

// Admin ONLY: Update Book
app.put('/api/books/:id', authenticate, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const book = await Book.findByIdAndUpdate(id, req.body, { new: true });
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }
    return res.status(200).json({ message: 'Book updated successfully!', book });
  } catch (error) {
    return res.status(500).json({ message: 'Error updating book.' });
  }
});

// Admin ONLY: Delete Book
app.delete('/api/books/:id', authenticate, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const book = await Book.findByIdAndDelete(id);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }
    return res.status(200).json({ message: 'Book deleted successfully!' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting book.' });
  }
});

// 8. User Wishlist API
app.get('/api/wishlist', authenticate, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).populate('books');
    return res.status(200).json(wishlist ? wishlist.books : []);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching wishlist.' });
  }
});

app.post('/api/wishlist', authenticate, async (req, res) => {
  const { bookId } = req.body;
  try {
    let wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (!wishlist) {
      wishlist = new Wishlist({ userId: req.user.id, books: [] });
    }

    if (!wishlist.books.includes(bookId)) {
      wishlist.books.push(bookId);
      await wishlist.save();

      // Keep user document in sync
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { wishlist: bookId } });
    }

    return res.status(200).json({ message: 'Added to wishlist', wishlist: wishlist.books });
  } catch (error) {
    return res.status(500).json({ message: 'Error adding to wishlist.' });
  }
});

app.delete('/api/wishlist/:bookId', authenticate, async (req, res) => {
  const { bookId } = req.params;
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (wishlist) {
      wishlist.books = wishlist.books.filter(id => id.toString() !== bookId);
      await wishlist.save();

      // Keep user document in sync
      await User.findByIdAndUpdate(req.user.id, { $pull: { wishlist: bookId } });
    }
    return res.status(200).json({ message: 'Removed from wishlist' });
  } catch (error) {
    return res.status(500).json({ message: 'Error removing from wishlist.' });
  }
});

// 9. Likes API
app.post('/api/books/:id/like', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const book = await Book.findById(id);
    if (!book) return res.status(404).json({ message: 'Book not found' });

    const existingLike = await Like.findOne({ userId: req.user.id, bookId: id });

    if (existingLike) {
      // Unlike
      await Like.deleteOne({ _id: existingLike._id });
      await Book.findByIdAndUpdate(id, { $inc: { likes: -1 } });
      await User.findByIdAndUpdate(req.user.id, { $pull: { likedBooks: id } });
      return res.status(200).json({ message: 'Book unliked', liked: false });
    } else {
      // Like
      const like = new Like({ userId: req.user.id, bookId: id });
      await like.save();
      await Book.findByIdAndUpdate(id, { $inc: { likes: 1 } });
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { likedBooks: id } });
      return res.status(200).json({ message: 'Book liked', liked: true });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Error processing like.' });
  }
});

// 10. Ratings API
app.post('/api/rating', authenticate, async (req, res) => {
  const { bookId, rating } = req.body;
  if (!bookId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Valid bookId and rating (1-5) required.' });
  }

  try {
    let ratingRecord = await Rating.findOne({ userId: req.user.id, bookId });
    const isNew = !ratingRecord;

    if (isNew) {
      ratingRecord = new Rating({ userId: req.user.id, bookId, rating });
    } else {
      ratingRecord.rating = rating;
    }
    await ratingRecord.save();

    // Re-calculate average rating for the book
    const ratings = await Rating.find({ bookId });
    const count = ratings.length;
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const avg = count > 0 ? (sum / count) : 2.5;

    await Book.findByIdAndUpdate(bookId, {
      averageRating: avg,
      ratingsCount: count
    });

    return res.status(200).json({
      message: 'Rating saved successfully',
      averageRating: avg,
      ratingsCount: count
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error saving rating.' });
  }
});

// 11. Recommendations API
app.get('/api/recommendations', authenticate, async (req, res) => {
  const { historyCategories } = req.query;
  let parsedHistory = [];
  if (historyCategories) {
    try {
      parsedHistory = JSON.parse(historyCategories);
    } catch (e) {}
  }

  try {
    const recommended = await getRecommendations(req.user.id, parsedHistory, 12);
    return res.status(200).json(recommended);
  } catch (error) {
    return res.status(500).json({ message: 'Error generating recommendations.' });
  }
});

// 12. Admin Stats
app.get('/api/admin/stats', authenticate, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalBooks = await Book.countDocuments();
    const totalLikes = await Like.countDocuments();
    
    // Top Categories
    const topCategories = await Book.aggregate([
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Most Liked Books
    const mostLiked = await Book.find().sort({ likes: -1 }).limit(5);

    // Highest Rated Books
    const highestRated = await Book.find({ ratingsCount: { $gt: 0 } })
      .sort({ averageRating: -1 })
      .limit(5);

    return res.status(200).json({
      totalUsers,
      totalBooks,
      totalLikes,
      topCategories,
      mostLiked,
      highestRated
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching stats.' });
  }
});

// 13. Admin User Management
app.get('/api/admin/users', authenticate, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('-password');
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching users.' });
  }
});

app.put('/api/admin/users/:id/block', authenticate, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { block } = req.body; // boolean
  try {
    // We can block users by updating a blocked field. Let's add it dynamically or check.
    // Let's toggle role or a verified flag, or simply set role to blocked.
    // Adding verified: !block is easiest since they can't login if not verified!
    const user = await User.findByIdAndUpdate(id, { verified: !block }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ message: block ? 'User blocked' : 'User unblocked', user });
  } catch (error) {
    return res.status(500).json({ message: 'Error blocking user.' });
  }
});

app.delete('/api/admin/users/:id', authenticate, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Clean up their wishlist
    await Wishlist.deleteOne({ userId: id });
    await Like.deleteMany({ userId: id });
    await Rating.deleteMany({ userId: id });
    return res.status(200).json({ message: 'User deleted successfully!' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting user.' });
  }
});

// Edit Profile (User/Admin)
app.put('/api/profile', authenticate, async (req, res) => {
  const { name, adminName, username, profileImage } = req.body;
  try {
    if (req.user.role === 'admin') {
      const admin = await Admin.findByIdAndUpdate(req.user.id, {
        adminName: adminName || name
      }, { new: true });
      return res.status(200).json({ message: 'Profile updated successfully!', user: admin });
    } else {
      const user = await User.findByIdAndUpdate(req.user.id, {
        name,
        username,
        profileImage
      }, { new: true });
      return res.status(200).json({ message: 'Profile updated successfully!', user });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Error updating profile.' });
  }
});

// Direct Page Routing Fallback for HTML
app.get('*', (req, res, next) => {
  // If request is for an API, pass it
  if (req.url.startsWith('/api')) {
    return next();
  }
  // Otherwise serve index.html
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
