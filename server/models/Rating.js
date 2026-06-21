const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 }
}, { timestamps: true });

// Avoid duplicate ratings from the same user for the same book
ratingSchema.index({ userId: 1, bookId: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);
