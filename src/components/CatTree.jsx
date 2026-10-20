import { useEffect, useRef } from "react";
import { CUSHION_LIFT, TREE_H, TREE_PADS, TREE_W, paintTree } from "./cats/tree";

// A pixel-art cat tree for Yuzu and Ono. Each cushion also carries an
// invisible `.cat-tree__pad` strip along its top, which the cat engine reads
// as a platform the cats can jump onto, walk along and nap on.
export default function CatTree() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!g) return;
    g.putImageData(new ImageData(paintTree(), TREE_W, TREE_H), 0, 0);
  }, []);

  return (
    <div className="cat-tree" aria-hidden="true">
      <canvas ref={canvasRef} className="cat-tree__art" width={TREE_W} height={TREE_H} />
      {TREE_PADS.map((pad) => (
        <span
          key={`${pad.cx}-${pad.cy}`}
          className="cat-tree__pad"
          style={{
            left: `${((pad.cx - pad.rx + 5) / TREE_W) * 100}%`,
            width: `${((2 * pad.rx - 10) / TREE_W) * 100}%`,
            top: `${((pad.cy - CUSHION_LIFT) / TREE_H) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
