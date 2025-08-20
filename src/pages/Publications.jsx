import pubs from "../data/publications";

export default function Publications() {
  return (
    <section className="stack">
      <h1>Publications</h1>
      <ul className="pubs">
        {pubs.map((p) => (
          <li key={p.id} className="pub pub__grid">
            {p.thumb && (
              <a href={p.project || p.links?.pdf || "#"} target="_blank" rel="noreferrer">
                <img
                  src={p.thumb}
                  alt={`${p.title} thumbnail`}
                  className="pub__thumb"
                  loading="lazy"
                />
              </a>
            )}

            <div className="pub__body">
              <div className="pub__title">
                <a
                  href={p.project || p.links?.pdf || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="pub__titleLink"
                >
                  {p.title}
                </a>
              </div>

              {/* <div className="pub__authors">{p.authors}</div> */}
              <div className="pub__authors" dangerouslySetInnerHTML={{ __html: p.authors }} />

              <div className="pub__venue">
                <em>{p.venue}</em> {p.year && <>({p.year})</>}
                {p.note && <> · <span className="pub__note">{p.note}</span></>}
                {p.links?.pdf && (
                  <>
                    {" · "}
                    <a href={p.links.pdf} target="_blank" rel="noreferrer">PDF/Project</a>
                  </>
                )}
                {p.links?.code && p.links.code.trim() && (
                  <>
                    {" · "}
                    <a href={p.links.code} target="_blank" rel="noreferrer">Code</a>
                  </>
                )}
              </div>

              {p.abstract && (
                <details className="pub__abs">
                  <summary>Show Abstract</summary>
                  <p>{p.abstract}</p>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
