export * from "./generated/api";
export {
  setBaseUrl,
  setAuthTokenGetter,
  ApiError,
  customFetch,
} from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
export * from "./generated/api.schemas";
