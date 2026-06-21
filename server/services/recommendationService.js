const Book = require('../models/Book');
const User = require('../models/User');

/**
 * Generates personalized book recommendations for a user.
 * @param {string} userId - The MongoDB ObjectId of the user.
 * @param {Array<string>} searchHistoryCategories - Optional array of categories visited during search history.
 * @param {number} limit - Maximum number of recommendations to return.
 * @returns {Promise<Array>} - Array of Book documents.
 */
async function getRecommendations(userId, searchHistoryCategories = [], limit = 10) {
  try {
    const user = await User.findById(userId)
      .populate('wishlist')
      .populate('likedBooks');

    if (!user) {
      // Fallback: Return top-rated global books if user not found
      return await Book.find().sort({ averageRating: -1, ratingsCount: -1 }).limit(limit);
    }

    const excludedBookIds = new Set([
      ...user.wishlist.map(b => b._id.toString()),
      ...user.likedBooks.map(b => b._id.toString())
    ]);

    // Gather categories of interest
    const interestCategories = new Set(searchHistoryCategories || []);

    user.wishlist.forEach(book => {
      if (book.categories) {
        book.categories.forEach(cat => interestCategories.add(cat));
      }
    });

    user.likedBooks.forEach(book => {
      if (book.categories) {
        book.categories.forEach(cat => interestCategories.add(cat));
      }
    });

    const categoryArray = Array.from(interestCategories).filter(Boolean);

    // Fallback: If no categories of interest, recommend global high-rated books
    if (categoryArray.length === 0) {
      return await Book.find({
        _id: { $nin: Array.from(excludedBookIds).map(id => new mongoose.Types.ObjectId(id)) }
      })
      .sort({ averageRating: -1, ratingsCount: -1 })
      .limit(limit);
    }

    // Query books matching the user's categories of interest
    const candidateBooks = await Book.find({
      categories: { $in: categoryArray },
      _id: { $nin: user.wishlist.concat(user.likedBooks).map(b => b._id) }
    }).limit(100); // Fetch a candidate pool

    // Score candidates based on category overlap and average rating
    const scoredBooks = candidateBooks.map(book => {
      let categoryMatchCount = 0;
      if (book.categories) {
        book.categories.forEach(cat => {
          if (interestCategories.has(cat)) {
            categoryMatchCount++;
          }
        });
      }

      // Hybrid score: overlap strength + normalized rating influence
      const score = (categoryMatchCount * 2.0) + (book.averageRating || 0);
      return { book, score };
    });

    // Sort by score descending and return the top items
    scoredBooks.sort((a, b) => b.score - a.score);

    return scoredBooks.slice(0, limit).map(sb => sb.book);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    // Safe fallback
    return await Book.find().sort({ averageRating: -1, ratingsCount: -1 }).limit(limit);
  }
}

module.exports = {
  getRecommendations
};
