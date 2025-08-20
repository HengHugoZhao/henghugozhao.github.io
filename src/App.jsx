import { Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Publications from "./pages/Publications";
import News from "./pages/News";
import Miscellanea from "./pages/Miscellanea";

export default function App() {
  return (
    <div className="site">
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/publications" element={<Publications />} />
          <Route path="/news" element={<News />} />
          <Route path="/misc" element={<Miscellanea />} />
          
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
