const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  datasetBookId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  subtitle: { type: String },
  authors: [{ type: String }],
  publisher: { type: String },
  publishedDate: { type: String },
  description: { type: String },
  pageCount: { type: Number },
  categories: [{ type: String }],
  image: { type: String },
  isbn13: { type: String },
  averageRating: { type: Number, default: 2.5 },
  ratingsCount: { type: Number, default: 0 },
  likes: { type: Number, default: 0 }
}, { timestamps: true });

// Create indexes for efficient searching
bookSchema.index({ title: 'text', subtitle: 'text', description: 'text' });
bookSchema.index({ categories: 1 });
bookSchema.index({ authors: 1 });

module.exports = mongoose.model('Book', bookSchema);
