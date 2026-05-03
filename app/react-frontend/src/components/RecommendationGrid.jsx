import React from 'react';
import BookCard from './BookCard';

export default function RecommendationGrid({ books, serendipityScore, onBookSelect }) {
  if (!books || books.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        Tidak ada buku ditemukan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Serendipity Score Banner */}
      {serendipityScore > 0 && (
        <div className="flex items-center gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
          <span className="text-xl">🌟</span>
          <p className="text-sm text-blue-900">
            <span className="font-semibold">Serendipity Score:</span> 
            <code className="mx-1 px-1.5 py-0.5 bg-white rounded text-blue-700 font-mono">
              {serendipityScore.toFixed(4)}
            </code>
            <span className="text-blue-700/70">(Semakin tinggi, semakin beragam dan di luar kebiasaan Anda)</span>
          </p>
        </div>
      )}

      {/* 
        Grid Layout:
        - Mobile: 2 columns
        - Tablet: 4 columns
        - Desktop: 6 columns
        gap-4 ensures tight, clean spacing
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
        {books.map((book, index) => (
          <BookCard 
            key={book.book_id || index} 
            book={book} 
            onClickDetail={onBookSelect}
          />
        ))}
      </div>
    </div>
  );
}
