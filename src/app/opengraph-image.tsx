import { ImageResponse } from "next/og";

// LINEなどでURLを送ったときに出る画像（画像ファイルを持たず、ここで生成する）
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "わりかん精算 — 誰が誰にいくら払えばいいかを最小回数で";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          color: "white",
          fontSize: 64,
          fontWeight: 700,
        }}
      >
        <div style={{ fontSize: 120 }}>💸</div>
        <div style={{ marginTop: 16 }}>わりかん精算</div>
        <div style={{ marginTop: 24, fontSize: 36, fontWeight: 400, opacity: 0.9 }}>
          誰が誰にいくら払えばいいかを、最小回数で
        </div>
      </div>
    ),
    size,
  );
}
