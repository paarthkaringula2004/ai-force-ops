export type CookieChoice = "required" | "declined";

// A fresh value detects blocked writes even when an older preference still exists.
export function saveCookieChoice(choice: CookieChoice): boolean {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const attributes = `; Path=/; SameSite=Lax${secure}`;
  const contains = (name: string, value: string) => document.cookie.split(";").some(part => part.trim() === `${name}=${value}`);
  try {
    const probe = crypto.randomUUID();
    document.cookie = `aiforce_cookie_test=${probe}; Max-Age=60${attributes}`;
    if (!contains("aiforce_cookie_test", probe)) return false;
    document.cookie = `aiforce_cookie_choice=${choice}; Max-Age=31536000${attributes}`;
    return contains("aiforce_cookie_choice", choice);
  } catch {
    return false;
  } finally {
    try { document.cookie = `aiforce_cookie_test=; Max-Age=0${attributes}`; } catch { /* Storage may be disabled entirely. */ }
  }
}
