import React from 'react';

export default function BookCard({ book, onClickDetail }) {
  const isWarm = book.type?.toLowerCase() === 'warm';
  
  return (
    <div className="group flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300">
      {/* Image Container */}
      <div className="relative aspect-[2/3] w-full bg-gray-50 overflow-hidden">
        {book.image_url ? (
          <img 
            src={book.image_url} 
            alt={book.judul_buku} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-4xl text-gray-300">
            📔
          </div>
        )}
        
        {/* Badges positioned over the image */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {book.type && (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider shadow-sm
              ${isWarm ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-50 text-blue-700'}`}>
              {book.type}
            </span>
          )}
          {book.score && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-white/90 text-orange-500 backdrop-blur-sm shadow-sm">
              ★ {book.score.toFixed(3)}
            </span>
          )}
        </div>
      </div>

      {/* Content Container */}
      <div className="flex flex-col flex-grow p-4">
        <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mb-1" title={book.judul_buku}>
          {book.judul_buku || "Judul tidak tersedia"}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-1 mb-4">
          {book.penulis || "Penulis tidak diketahui"}
        </p>
        
        {/* Detail Button (Pushed to bottom) */}
        <div className="mt-auto pt-2 border-t border-gray-50">
          <button 
            onClick={() => onClickDetail(book)}
            className="w-full py-1.5 text-xs font-semibold text-gray-600 hover:text-black bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Lihat Detail
          </button>
        </div>
      </div>
    </div>
  );
}
