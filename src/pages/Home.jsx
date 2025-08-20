export default function Home() {
  return (
    <section className="stack">
      <div className="hero">
        <img src="/profile.jpg" alt="Heng Hugo Zhao" className="hero__img" />
        <div className="hero__text">
          <h1>Heng (Hugo) Zhao</h1>
            <p style={{ color: "var(--muted)", marginTop: "-0.5rem" }}>
               <a href="mailto:qgg5se@virginia.edu" style={{ textDecoration: "none", color: "inherit" }}>
                qgg5se@virginia.edu
                </a>
            </p>
          <p>
            I’m a first-year Ph.D. student in the{" "}
            <a href="https://engineering.virginia.edu/departments/computer-science" target="_blank" rel="noreferrer">
              Department of Computer Science
            </a> at the University of Virginia, School of Engineering, where I am a member of the <a href="https://zzeng.me/lab/" target="_blank" rel="noreferrer">TAKO Lab</a> advised by{" "}
            <a href="https://zzeng.me" target="_blank" rel="noreferrer">Dr. Zhe Zeng</a>. 
            My research interests lie in the development of <b>Trustworthy AI</b>, with a particular emphasis on{" "}
            <b>Interpretable Learning</b> and <b>Model Explainability</b>. I am motivated by the challenge of making machine learning systems not only accurate, but also transparent, reliable, and aligned with human reasoning.
            Currently, I am exploring <b>neurosymbolic AI</b>.
          </p>
          <p>
            I obtained a B.S. degree with <i>Cum Laude</i> in CS and Stats at Wake Forest University, 
            where I was fortunate to conduct undergraduate research advised by{" "}
            <a href="https://yangfan.sites.wfu.edu" target="_blank" rel="noreferrer">Dr. Fan Yang</a>.
            Much of my work there focused on <b>interpretable large language models (LLMs)</b>--investigating how concepts are represented inside model embeddings, and how those representations can be made more interpretable.
          </p>
        </div>
      </div>
    </section>
  );
}
