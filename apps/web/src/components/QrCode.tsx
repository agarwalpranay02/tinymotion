"use client";

import qrcode from "qrcode-generator";
import { useEffect, useState } from "react";

/** A QR code for the current page (or `path`), so a laptop visitor can continue on their phone. */
export function QrCode({ path, className = "h-40 w-40" }: { path?: string; className?: string }) {
  const [svg, setSvg] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const u = new URL(path ?? window.location.pathname, window.location.origin).toString();
    const q = qrcode(0, "M");
    q.addData(u);
    q.make();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- needs window.location, so it can only run after mount
    setUrl(u);
    setSvg(q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
  }, [path]);
  return (
    <figure className="inline-flex flex-col items-center gap-2">
      <div className={`overflow-hidden rounded-md bg-white p-1.5 ${className}`} role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="mono max-w-[16rem] break-all text-center text-[0.72rem] text-[var(--fg-3)]">{url.replace(/^https?:\/\//, "")}</figcaption>
    </figure>
  );
}
