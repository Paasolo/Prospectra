import { useEffect } from "react";
import { APP_NAME, APP_TAGLINE } from "@prospectra/shared";

type SeoProps = {
  title: string;
  description?: string;
};

export function Seo({ title, description = APP_TAGLINE }: SeoProps) {
  useEffect(() => {
    document.title = `${title} | ${APP_NAME}`;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);
  }, [title, description]);

  return null;
}
