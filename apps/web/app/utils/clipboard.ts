/**
 * Puts text on the clipboard: the async API, else the browser's own Copy of a selected field,
 * added to `host` (an open modal dialog, so the selection is inside the top layer). True when
 * it worked. Copy technical details (Help, About, and Report a problem) and Report a problem's Copy use it.
 */
export async function writeClipboard(text: string, host?: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Refused (no permission, an insecure page): the page's own copy below.
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  (host ?? document.body).append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
