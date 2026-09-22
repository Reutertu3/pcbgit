/** Themes offered in the picker. Colours live in app.css; these are just the swatches. */
export const THEMES = [
	{ id: 'forest', dark: true, label: 'Forest', swatches: ['#273338', '#2b5748', '#618764', '#9cb080'] },
	{ id: 'gruvbox-dark', dark: true, label: 'Gruvbox Dark', swatches: ['#282828', '#3c3836', '#fe8019', '#ebdbb2'] },
	{ id: 'gruvbox-light', dark: false, label: 'Gruvbox Light', swatches: ['#fbf1c7', '#ebdbb2', '#af3a03', '#3c3836'] },
	{ id: 'nord', dark: true, label: 'Nord', swatches: ['#2e3440', '#3b4252', '#88c0d0', '#eceff4'] },
	{ id: 'light', dark: false, label: 'Light', swatches: ['#ffffff', '#eceef2', '#2b5748', '#14171c'] },
	{ id: 'midnight', dark: true, label: 'Midnight', swatches: ['#0b0d10', '#1f242d', '#d9873f', '#e8ebef'] }
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'forest';
