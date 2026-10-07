export function binderShareUrl(token: string): string {
  const base = import.meta.env.BASE_URL;
  return `${window.location.origin}${base.endsWith("/") ? base : `${base}/`}view/binder/${token}`;
}

/** App-relative path (no origin) of a public binder, including the router base. */
export function publicBinderPath(token: string): string {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${basePath}/view/binder/${token}`;
}
