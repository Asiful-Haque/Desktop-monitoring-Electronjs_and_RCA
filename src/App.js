import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ScreenshotApp from './pages/ScreenshotApp';

function App() {
  console.log("✅ App component loaded with router");
   return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/screenshot" element={<ScreenshotApp />} />
      </Routes>
    </Router>
  );
}

export default App;
