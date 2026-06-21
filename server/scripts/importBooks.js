const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const Book = require('../models/Book');

const csvFilePath = 'C:\\Users\\Teja\\Downloads\\archive (5)\\google_books_dataset.csv';
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart-library';

async function importBooks() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully.');

    // Clear existing books
    console.log('Clearing existing books collection...');
    await Book.deleteMany({});
    console.log('Existing books collection cleared.');

    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found at: ${csvFilePath}`);
    }

    console.log('Starting CSV parsing and import...');
    let count = 0;
    let batch = [];
    const BATCH_SIZE = 1000;

    const stream = fs.createReadStream(csvFilePath)
      .pipe(csv());

    for await (const row of stream) {
      // Clean and validate authors
      let authorsList = [];
      if (row.authors) {
        authorsList = row.authors.split(',').map(a => a.trim()).filter(a => a);
      }

      // Clean and validate categories
      let categoriesList = [];
      if (row.categories) {
        categoriesList = row.categories.split(',').map(c => c.trim()).filter(c => c);
      }

      // Handle default values and type casting
      const bookData = {
        datasetBookId: row.book_id || Math.random().toString(36).substring(7),
        title: row.title || 'Untitled Book',
        subtitle: row.subtitle || '',
        authors: authorsList,
        publisher: row.publisher || 'Unknown Publisher',
        publishedDate: row.published_date || 'Unknown',
        description: row.description || 'No description available.',
        pageCount: parseInt(row.page_count, 10) || 0,
        categories: categoriesList,
        image: row.thumbnail || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=300',
        isbn13: row.isbn_13 || '',
        averageRating: parseFloat(row.average_rating) || 2.5,
        ratingsCount: parseInt(row.ratings_count, 10) || 0,
        likes: 0
      };

      batch.push(bookData);

      if (batch.length >= BATCH_SIZE) {
        await Book.insertMany(batch);
        count += batch.length;
        console.log(`Imported ${count} books...`);
        batch = [];
      }
    }

    // Insert remaining records
    if (batch.length > 0) {
      await Book.insertMany(batch);
      count += batch.length;
      console.log(`Imported ${count} books total.`);
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

importBooks();
