import Link from "next/link";
import "./globals.css";

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center p-8">
        <div className="text-center">
          <p className="display mono text-7xl">404</p>
          <p className="mt-4 text-lg">No signal at this address.</p>
          <Link className="btn btn-primary mt-8" href="/">Go to TinyMotion</Link>
        </div>
      </body>
    </html>
  );
}
