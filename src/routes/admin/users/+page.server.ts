import { fail } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import { all, audit, count, get, newId, now, run } from '$lib/server/db';
import {
	createUser,
	destroyUserSessions,
	getUserById,
	getUserByUsername,
	hashPassword,
	validateUsername
} from '$lib/server/auth';

interface AdminUserRow {
	id: string;
	username: string;
	email: string;
	display_name: string;
	avatar: number | null;
	role: 'user' | 'admin';
	is_active: number;
	created_at: number;
	project_count: number;
	token_count: number;
	last_session: number | null;
}

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	const term = `%${search}%`;

	return {
		users: all<AdminUserRow>(
			`SELECT u.id, u.username, u.email, u.display_name, (SELECT updated_at FROM avatars WHERE user_id = u.id) AS avatar, u.role, u.is_active, u.created_at,
			   (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) AS project_count,
			   (SELECT COUNT(*) FROM access_tokens t WHERE t.user_id = u.id) AS token_count,
			   (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_session
			 FROM users u
			 WHERE (? = '' OR u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)
			 ORDER BY u.created_at DESC`,
			search,
			term,
			term,
			term
		),
		search
	};
};

/** The instance must never be left without a way in. */
function isLastAdmin(userId: string) {
	const user = getUserById(userId);
	if (user?.role !== 'admin') return false;
	return count("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1") <= 1;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const role = form.get('role') === 'admin' ? 'admin' : 'user';

		const usernameError = validateUsername(username);
		if (usernameError) return fail(400, { error: translate(locals.locale, usernameError) });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, { error: translate(locals.locale, 'auth.error.email') });
		if (password.length < 8) return fail(400, { error: translate(locals.locale, 'auth.error.passwordShort') });
		if (getUserByUsername(username)) return fail(409, { error: translate(locals.locale, 'auth.error.usernameTaken') });
		if (get('SELECT 1 AS x FROM users WHERE email = ?', email)) {
			return fail(409, { error: translate(locals.locale, 'auth.error.emailTaken') });
		}

		createUser({ username, email, password, role });
		audit(locals.user!.id, 'admin.user_create', username, role);
		return { success: true, message: translate(locals.locale, 'users.created', { name: username }) };
	},

	setRole: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const role = form.get('role') === 'admin' ? 'admin' : 'user';

		if (role === 'user' && isLastAdmin(id)) {
			return fail(400, { error: translate(locals.locale, 'users.error.lastAdmin') });
		}
		run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role, now(), id);
		audit(locals.user!.id, 'admin.user_role', getUserById(id)?.username ?? id, role);
		return { success: true, message: translate(locals.locale, 'users.roleUpdated') };
	},

	toggleActive: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const user = getUserById(id);
		if (!user) return fail(404, { error: translate(locals.locale, 'error.userNotFound') });
		if (user.is_active && isLastAdmin(id)) {
			return fail(400, { error: translate(locals.locale, 'users.error.lastAdmin') });
		}

		const next = user.is_active ? 0 : 1;
		run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', next, now(), id);
		// A disabled account should lose its sessions immediately.
		if (!next) destroyUserSessions(id);
		audit(locals.user!.id, next ? 'admin.user_enable' : 'admin.user_disable', user.username);
		return { success: true, message: translate(locals.locale, next ? 'users.enabled' : 'users.disabled', { name: user.username }) };
	},

	resetPassword: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const password = String(form.get('password') ?? '');
		if (password.length < 8) return fail(400, { error: translate(locals.locale, 'auth.error.passwordShort') });

		const user = getUserById(id);
		if (!user) return fail(404, { error: translate(locals.locale, 'error.userNotFound') });

		run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(password), now(), id);
		destroyUserSessions(id);
		audit(locals.user!.id, 'admin.user_password_reset', user.username);
		return { success: true, message: translate(locals.locale, 'users.passwordReset', { name: user.username }) };
	},

	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const user = getUserById(id);
		if (!user) return fail(404, { error: translate(locals.locale, 'error.userNotFound') });
		if (id === locals.user!.id) return fail(400, { error: translate(locals.locale, 'users.error.self') });
		if (isLastAdmin(id)) return fail(400, { error: translate(locals.locale, 'users.error.lastAdmin') });

		// Projects cascade, but their bare repositories must go too.
		const projects = all<{ slug: string }>('SELECT slug FROM projects WHERE owner_id = ?', id);
		const { deleteRepo } = await import('$lib/server/git');
		for (const project of projects) await deleteRepo(user.username, project.slug);

		run('DELETE FROM users WHERE id = ?', id);
		audit(locals.user!.id, 'admin.user_delete', user.username, `${projects.length} board(s)`);
		return { success: true, message: translate(locals.locale, 'users.deleted', { name: user.username, count: projects.length }) };
	}
};
