import pubs from "../data/publications";
import news from "../data/news";

const IconEmail = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <polyline points="2,4 12,13 22,4"/>
  </svg>
);

const IconGithub = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const IconScholar = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M5.242 13.769L0 9.5 12 1l12 8.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/>
  </svg>
);

const GradIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ flexShrink: 0, marginTop: "3px", opacity: 0.7 }}>
    <path d="M12 3L1 9l11 6 11-6-11-6zM1 17l11 6 11-6M1 13l11 6 11-6"/>
  </svg>
);

export default function Home() {
  return (
    <div className="profile-page">

      <aside className="sidebar">
        <img src="/profile.jpg" alt="Heng Hugo Zhao" className="sidebar__img" />
        <h1 className="sidebar__name">Heng (Hugo) Zhao</h1>
        <p className="sidebar__title">Ph.D. Student</p>
        <p className="sidebar__school">University of Virginia</p>
        <div className="sidebar__links">
          <a href="mailto:qgg5se@virginia.edu" className="sidebar__icon" title="Email">
            <IconEmail />
          </a>
          <a href="https://github.com/HengHugoZhao" className="sidebar__icon" title="GitHub" target="_blank" rel="noreferrer">
            <IconGithub />
          </a>
          <a href="https://scholar.google.com/citations?hl=en&user=E6CZurQAAAAJ" className="sidebar__icon" title="Google Scholar" target="_blank" rel="noreferrer">
            <IconScholar />
          </a>
        </div>
      </aside>

      <div className="main-content">
        <section className="about">
          <h2 className="content-heading">About Me</h2>
          <p>
            I'm a first-year Ph.D. student in the{" "}
            <a href="https://engineering.virginia.edu/departments/computer-science" target="_blank" rel="noreferrer">
              Department of Computer Science
            </a>{" "}
            at the University of Virginia, School of Engineering, where I am a member of the{" "}
            <a href="https://zzeng.me/lab/" target="_blank" rel="noreferrer">TAKO Lab</a> advised by{" "}
            <a href="https://zzeng.me" target="_blank" rel="noreferrer">Dr. Zhe Zeng</a>.
            My research interests lie in the development of <strong>Trustworthy AI</strong>, with a particular emphasis on{" "}
            <strong>Interpretable Learning</strong> and <strong>Model Explainability</strong>. I am motivated by the challenge
            of making machine learning systems not only accurate, but also transparent, reliable, and aligned with human reasoning.
            Currently, I am exploring <strong>neurosymbolic AI</strong>.
          </p>
          <p>
            I obtained a B.S. degree with <em>Cum Laude</em> in CS and Stats at Wake Forest University,
            where I was fortunate to conduct undergraduate research advised by{" "}
            <a href="https://yangfan.sites.wfu.edu" target="_blank" rel="noreferrer">Dr. Fan Yang</a> and{" "}
            <a href="https://berenhaut.sites.wfu.edu" target="_blank" rel="noreferrer">Dr. Kenneth S. Berenhaut</a>.
            Much of my work there focused on <strong>interpretable large language models (LLMs)</strong>—investigating
            how concepts are represented inside model embeddings, and how those representations can be made more interpretable.
          </p>
        </section>

        <div className="info-grid">
          <section>
            <h3 className="info-heading">Interests</h3>
            <ul className="interest-list">
              <li>Probabilistic ML</li>
              <li>Trustworthy AI</li>
              <li>Model Explainability</li>
              <li>Neurosymbolic AI</li>
            </ul>
          </section>

          <section>
            <h3 className="info-heading">Education</h3>
            <div className="edu-list">
              <div className="edu-item">
                <GradIcon />
                <div>
                  <div className="edu-item__deg">Ph.D. in Computer Science</div>
                  <div className="edu-item__school">University of Virginia</div>
                </div>
              </div>
              <div className="edu-item">
                <GradIcon />
                <div>
                  <div className="edu-item__deg">B.S. in Computer Science</div>
                  <div className="edu-item__school">Wake Forest University</div>
                </div>
              </div>
              <div className="edu-item">
                <GradIcon />
                <div>
                  <div className="edu-item__deg">B.S. in Statistics</div>
                  <div className="edu-item__school">Wake Forest University</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {news.length > 0 && (
          <section className="home-sec">
            <h2 className="home-sec__title">Recent News</h2>
            <ul className="news-list">
              {news.map((n) => (
                <li key={n.id} className="news-row">
                  <span className="news-row__date">{n.date}</span>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="home-sec">
          <h2 className="home-sec__title">Publications</h2>
          <ul className="pub-list">
            {pubs.map((p) => (
              <li key={p.id} className="pub-card">
                {p.thumb && (
                  <a href={p.project || p.links?.pdf || "#"} target="_blank" rel="noreferrer">
                    <img src={p.thumb} alt={`${p.title} thumbnail`} className="pub-card__thumb" loading="lazy" />
                  </a>
                )}
                <div className="pub-card__body">
                  <p className="pub-card__title">
                    <a href={p.project || p.links?.pdf || "#"} target="_blank" rel="noreferrer">
                      {p.title}
                    </a>
                  </p>
                  <p className="pub-card__authors" dangerouslySetInnerHTML={{ __html: p.authors }} />
                  <p className="pub-card__meta">
                    <em>{p.venue}</em>{p.year && ` (${p.year})`}
                    {p.note && ` · ${p.note}`}
                    {p.links?.pdf && <>{" · "}<a href={p.links.pdf} target="_blank" rel="noreferrer">PDF / Project</a></>}
                    {p.links?.code && p.links.code.trim() && <>{" · "}<a href={p.links.code} target="_blank" rel="noreferrer">Code</a></>}
                  </p>
                  {p.abstract && (
                    <details className="pub-card__abs">
                      <summary>Abstract</summary>
                      <p>{p.abstract}</p>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
