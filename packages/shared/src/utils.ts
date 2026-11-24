import { APP_NAME, APP_TAGLINE } from "./constants.js";

export function formatAppIdentity(): string {
  return `${APP_NAME} — ${APP_TAGLINE}`;
}
