import { useEffect, useRef } from "react";
import { CAT_DEFS } from "./cats/data";
import { createCatPlayground } from "./cats/engine";

export default function CatPlayground() {
  const areaRef = useRef(null);
  const buttonRef = useRef(null);
  const statusRef = useRef(null);
  const ballRef = useRef(null);
  const partsRef = useRef(CAT_DEFS.map(() => ({})));

  const setPart = (index, key) => (element) => {
    partsRef.current[index][key] = element;
  };

  useEffect(() => {
    const area = areaRef.current;
    const page = area?.closest(".miscellanea-page");
    if (!area || !page || !buttonRef.current || !ballRef.current || !statusRef.current) return undefined;
    return createCatPlayground({
      page,
      area,
      ballElement: ballRef.current,
      button: buttonRef.current,
      status: statusRef.current,
      catElements: partsRef.current,
    });
  }, []);

  return (
    <>
      <div className="cat-play-toolbar">
        <button ref={buttonRef} className="cat-play-button" type="button" aria-label="Play with a ball" aria-pressed="false" title="Play with a ball">
          <span className="cat-play-button__ball" aria-hidden="true" />
        </button>
        <span ref={statusRef} className="cat-play-status" role="status" aria-live="polite" />
      </div>

      <div ref={areaRef} className="cat-playground" aria-label="Yuzu and Ono, interactive cats">
        {CAT_DEFS.map((cat, index) => (
          <span key={`${cat.id}-shadow`} ref={setPart(index, "shadow")} className="cat-shadow" aria-hidden="true" />
        ))}
        {CAT_DEFS.map((cat, index) => (
          <canvas key={`${cat.id}-canvas`} ref={setPart(index, "canvas")} className="roaming-cat__canvas" data-cat={cat.id} aria-hidden="true" />
        ))}
        {CAT_DEFS.map((cat, index) => (
          <div
            key={cat.id}
            ref={setPart(index, "el")}
            className="roaming-cat"
            data-cat={cat.id}
            role="button"
            tabIndex="0"
            aria-label={`${cat.name}: press to pet, drag to pick up`}
          >
            <span className="roaming-cat__mood" aria-hidden="true">♥</span>
            <span className="roaming-cat__sleep" aria-hidden="true">z Z</span>
            <span className="roaming-cat__name" aria-hidden="true">{cat.name}</span>
          </div>
        ))}
        <span ref={ballRef} className="cat-ball" data-mode="hidden" data-visible="false" />
      </div>
    </>
  );
}
