import CatPlayground from "../components/CatPlayground";
import CatTree from "../components/CatTree";

export default function Miscellanea() {
  return (
    <section className="stack miscellanea-page">
      <h1>Miscellanea</h1>
      <p className="misc-intro misc-interactive-surface">
        Outside of research, I enjoy jazz music (alto/tenor/baritone saxophone), basketball, fencing, and swimming.
        I also share my life with my cats, <b>Yuzu</b> and <b>Ono</b>.
      </p>

      <CatPlayground />

      <div className="cat-gallery" aria-label="Yuzu and Ono">
        <figure className="cat-section misc-interactive-surface" data-cat="yuzu">
          <img src="/Yuzu.JPG" alt="Yuzu, a flame point Siamese cat" className="cat-photo" />
          <figcaption className="cat-caption">YUZU 🐾</figcaption>
        </figure>
        <figure className="cat-section misc-interactive-surface" data-cat="ono">
          <img src="/Ono.jpg" alt="Ono, a Siamese kitten" className="cat-photo" />
          <figcaption className="cat-caption">ONO 🐾</figcaption>
        </figure>
        <CatTree />
      </div>
    </section>
  );
}
