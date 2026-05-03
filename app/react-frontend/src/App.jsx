import React, { useState } from 'react';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import ColdStartForm from './pages/ColdStartForm';
import SearchPage from './pages/SearchPage';
import ConfigPage from './pages/ConfigPage';
import BookDetailPage from './pages/BookDetailPage';
import Sidebar from './components/Sidebar';

export default function App() {
  const [npm, setNpm] = useState('');
  const [userType, setUserType] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [coldRecs, setColdRecs] = useState(null);
  
  const [currentPage, setCurrentPage] = useState('landing');
  const [selectedBook, setSelectedBook] = useState(null);
  const [previousPage, setPreviousPage] = useState('landing');

  const handleLogin = async (inputNpm) => {
    try {
      const res = await fetch(`http://localhost:8000/check-user?npm=${inputNpm}`);
      const data = await res.json();
      
      setNpm(inputNpm);
      setUserType(data.status);
      setUserInfo(data.user || {});
      setColdRecs(null);
      
      if (data.status === 'warm') {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('cold_form');
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      alert("Backend tidak dapat dihubungi.");
    }
  };

  const handleLogout = () => {
    setNpm('');
    setUserType(null);
    setUserInfo(null);
    setColdRecs(null);
    setCurrentPage('landing');
  };

  const handleBookSelect = (book, fromPage) => {
    setSelectedBook(book);
    setPreviousPage(fromPage);
    setCurrentPage('book_detail');
  };

  const goBack = () => {
    setCurrentPage(previousPage);
    setSelectedBook(null);
  };

  return (
    <div className="flex min-h-screen bg-white text-black font-sans">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        npm={npm} 
        handleLogout={handleLogout} 
      />

      <main className="flex-grow p-8 max-w-7xl mx-auto w-full">
        {currentPage === 'landing' && <LandingPage onLogin={handleLogin} />}
        
        {currentPage === 'cold_form' && (
          <ColdStartForm 
            npm={npm} 
            onComplete={(info, recs) => {
              setUserInfo(info);
              setColdRecs(recs);
              setCurrentPage('dashboard');
            }} 
          />
        )}
        
        {currentPage === 'dashboard' && (
          <Dashboard 
            npm={npm} 
            userType={userType} 
            userInfo={userInfo} 
            setUserInfo={setUserInfo}
            initialColdRecs={coldRecs} 
            onBookSelect={(book) => handleBookSelect(book, 'dashboard')}
          />
        )}
        
        {currentPage === 'search' && (
          <SearchPage onBookSelect={(book) => handleBookSelect(book, 'search')} />
        )}
        
        {currentPage === 'config' && <ConfigPage />}
        
        {currentPage === 'book_detail' && (
          <BookDetailPage book={selectedBook} onBack={goBack} />
        )}
      </main>
    </div>
  );
}
