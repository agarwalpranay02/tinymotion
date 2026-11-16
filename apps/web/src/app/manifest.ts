import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TinyMotion: activity recognition on your phone",
    short_name: "TinyMotion",
    description: "Recognises walking, stairs, sitting, standing and lying from your phone's motion sensors, on the device. Download the same tiny models for microcontrollers.",
    start_url: "/live?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#10122a",
    theme_color: "#10122a",
    lang: "en",
    categories: ["health", "utilities", "education", "developer"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Go live", url: "/live?source=shortcut" },
      { name: "Analyze a recording", url: "/analyze?source=shortcut" },
      { name: "Model studio", url: "/studio?source=shortcut" },
    ],
  };
}
