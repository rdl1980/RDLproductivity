import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RDL Productivity",
    short_name: "RDL",
    start_url: "/boards",
    display: "standalone",
    background_color: "#0a1f44",
    theme_color: "#0a1f44",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
