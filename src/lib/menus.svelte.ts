/**
 * The one toolbar menu that is open (language, theme, notifications, user).
 * Each menu's button stops its click from reaching the page, whose clicks close
 * menus; without a shared state that also kept the other menus open underneath.
 */
let openMenu = $state<string | null>(null);

export const toolbarMenu = {
	isOpen: (id: string) => openMenu === id,
	/** Opens `id`, closing any other, or closes it; true when it is now open. */
	toggle(id: string) {
		openMenu = openMenu === id ? null : id;
		return openMenu === id;
	},
	close(id: string) {
		if (openMenu === id) openMenu = null;
	}
};
