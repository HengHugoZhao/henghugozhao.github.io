export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div>© {year} Heng Zhao</div>
        <div className="footer__links">
          <a href="mailto:qgg5se@virginia.edu">Email</a>
          <a href="https://github.com/HengHugoZhao" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://scholar.google.com/" target="_blank" rel="noreferrer">Scholar</a>
          <a href="/public/heng_cv.pdf" target="_blank" rel="noreferrer">CV</a>
        </div>
      </div>
    </footer>
  );
}
