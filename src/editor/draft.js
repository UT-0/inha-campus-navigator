/**
 * Storage key of the Map Editor's autosaved draft. Kept in its own tiny
 * module so the app can read a draft for "Preview in app" (?preview=1)
 * without loading the editor itself.
 */
export const DRAFT_KEY = 'icn.editor.draft';
