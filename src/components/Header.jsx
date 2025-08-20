import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";

export default function Header() {
  const [dark, setDark] = useState(
    () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const navLink = ({ isActive }) =>
    "nav-link" + (isActive ? " nav-link--active" : "");

  return (
    <header className="header">
      <div className="container header__inner">
        <div className="brand">
          <NavLink to="/" className="brand__name">Heng Zhao</NavLink>
          {/* <span className="brand__subtitle"></span> */}
        </div>

        <nav className="nav">
          <NavLink to="/" className={navLink} end>Home</NavLink>
          <NavLink to="/publications" className={navLink}>Publications</NavLink>
          <NavLink to="/news" className={navLink}>Recent News</NavLink>
          <NavLink to="/misc" className={navLink}>Miscellanea</NavLink>
          <a href="/heng_cv.pdf" className="nav-link" target="_blank" rel="noreferrer">CV</a>
        </nav>

        <button className="btn" onClick={() => setDark((v) => !v)}>
          {dark ? "☀️" : "🌙"}
        </button>
      </div>
    </header>
  );
}
