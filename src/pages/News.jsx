import news from "../data/news";

export default function News() {
  return (
    <section className="stack">
      <h1>Recent News</h1>
      <ul className="news">
        {news.map((n) => (
          <li key={n.id} className="news__item">
            <div className="news__date">{n.date}</div>
            <div className="news__body">{n.text}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
