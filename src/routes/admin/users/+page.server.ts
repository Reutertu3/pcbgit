import { fail } from '@sveltejs/kit';
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
			`SELECT u.id, u.username, u.email, u.display_name, u.role, u.is_active, u.created_at,
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
		if (usernameError) return fail(400, { error: usernameError });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, { error: 'Enter a valid email.' });
		if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters.' });
		if (getUserByUsername(username)) return fail(409, { error: 'That username is taken.' });
		if (get('SELECT 1 AS x FROM users WHERE email = ?', email)) {
			return fail(409, { error: 'That email is already registered.' });
		}

		createUser({ username, email, password, role });
		audit(locals.user!.id, 'admin.user_create', username, role);
		return { success: true, message: `Created ${username}.` };
	},

	setRole: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const role = form.get('role') === 'admin' ? 'admin' : 'user';

		if (role === 'user' && isLastAdmin(id)) {
			return fail(400, { error: 'This is the only active administrator.' });
		}
		run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role, now(), id);
		audit(locals.user!.id, 'admin.user_role', getUserById(id)?.username ?? id, role);
		return { success: true, message: 'Role updated.' };
	},

	toggleActive: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const user = getUserById(id);
		if (!user) return fail(404, { error: 'User not found.' });
		if (user.is_active && isLastAdmin(id)) {
			return fail(400, { error: 'This is the only active administrator.' });
		}

		const next = user.is_active ? 0 : 1;
		run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', next, now(), id);
		// A disabled account should lose its sessions immediately.
		if (!next) destroyUserSessions(id);
		audit(locals.user!.id, next ? 'admin.user_enable' : 'admin.user_disable', user.username);
		return { success: true, message: `${user.username} ${next ? 'enabled' : 'disabled'}.` };
	},

	resetPassword: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const password = String(form.get('password') ?? '');
		if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters.' });

		const user = getUserById(id);
		if (!user) return fail(404, { error: 'User not found.' });

		run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(password), now(), id);
		destroyUserSessions(id);
		audit(locals.user!.id, 'admin.user_password_reset', user.username);
		return { success: true, message: `Password reset for ${user.username}.` };
	},

	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const user = getUserById(id);
		if (!user) return fail(404, { error: 'User not found.' });
		if (id === locals.user!.id) return fail(400, { error: 'You cannot delete your own account here.' });
		if (isLastAdmin(id)) return fail(400, { error: 'This is the only active administrator.' });

		// Projects cascade, but their bare repositories must go too.
		const projects = all<{ slug: string }>('SELECT slug FROM projects WHERE owner_id = ?', id);
		const { deleteRepo } = await import('$lib/server/git');
		for (const project of projects) await deleteRepo(user.username, project.slug);

		run('DELETE FROM users WHERE id = ?', id);
		audit(locals.user!.id, 'admin.user_delete', user.username, `${projects.length} board(s)`);
		return { success: true, message: `Deleted ${user.username} and ${projects.length} board(s).` };
	}
};
