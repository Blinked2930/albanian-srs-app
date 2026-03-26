import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Albanian SRS",
    short_name: "Albanian SRS",
    description: "An Albanian language spaced repetition learning app",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF5F7",
    theme_color: "#FFF5F7",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/srs-icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: "/icons/srs-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any maskable",
      }
    ],
  };
}
