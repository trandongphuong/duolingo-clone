export {};
declare global { namespace NodeJS { interface ProcessEnv {
  DATABASE_URL?: string;
  APP_ORIGIN?: string;
  SESSION_PASSWORD?: string;
  SESSION_SECURE?: string;
  SESSION_TTL_SECONDS?: string;
  MEDIA_DIR?: string;
} } }
