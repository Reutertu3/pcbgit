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
import { instanceLimits, limitsFor, storageUsed } from '$lib/server/limits';

interface AdminUserRow {
	id: string;
	username: string;
	email: string;
	display_name: string;
	avatar: number | null;
	role: 'user' | 'admin';
	is_active: number;
	approved: number;
	is_owner: number;
	limit_boards: number | null;
	limit_storage_mb: number | null;
	created_at: number;
	project_count: number;
	token_count: number;
	last_login_at: number | null;
	last_seen_at: number | null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const search = url.searchParams.get('q') ?? '';
	const term = `%${search}%`;

	const users = all<AdminUserRow>(
			`SELECT u.id, u.username, u.email, u.display_name, (SELECT updated_at FROM avatars WHERE user_id = u.id) AS avatar, u.role, u.is_active,
			   u.approved, u.is_owner, u.limit_boards, u.limit_storage_mb, u.created_at,
			   (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) AS project_count,
			   (SELECT COUNT(*) FROM access_tokens t WHERE t.user_id = u.id) AS token_count,
			   u.last_login_at, u.last_seen_at
			 FROM users u
			 WHERE (? = '' OR u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)
			 ORDER BY u.approved ASC, u.created_at DESC`,
			search,
			term,
			term,
			term
		);

	return {
		// Accounts waiting for approval come first.
		users: await Promise.all(
			users.map(async (user) => {
				const limits = limitsFor(user);
				return { ...user, storage: await storageUsed(user.id), boardLimit: limits.boards, storageLimit: limits.storageBytes };
			})
		),
		defaults: instanceLimits(),
		me: locals.user!.id,
		search
	};
};

/**
 * The owner (is_owner) is the admin other admins cannot take out: nobody demotes,
 * disables or deletes it, and only the owner resets its password. Otherwise any
 * admin could lock out the one who set the instance up.
 */
function ownerRefusal(targetId: string, actorId: string, { ownerMay = false } = {}) {
	const target = getUserById(targetId);
	if (!target?.is_owner || (ownerMay && targetId === actorId)) return null;
	return 'users.error.owner' as const;
}

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

		const refused = role === 'user' && ownerRefusal(id, locals.user!.id);
		if (refused) return fail(403, { error: translate(locals.locale, refused) });
		if (role === 'user' && isLastAdmin(id)) {
			return fail(400, { error: translate(locals.locale, 'users.error.lastAdmin') });
		}
		run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role, now(), id);
		audit(locals.user!.id, 'admin.user_role', getUserById(id)?.username ?? id, role);
		return { success: true, message: translate(locals.locale, 'users.roleUpdated') };
	},

	approve: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const user = getUserById(id);
		if (!user) return fail(404, { error: translate(locals.locale, 'error.userNotFound') });
		run('UPDATE users SET approved = 1, is_active = 1, updated_at = ? WHERE id = ?', now(), id);
		audit(locals.user!.id, 'admin.user_approve', user.username);
		return { success: true, message: translate(locals.locale, 'users.approved', { name: user.username }) };
	},

	/** Per-user overrides of the instance limits; an empty field means the default. */
	setLimits: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const user = getUserById(id);
		if (!user) return fail(404, { error: translate(locals.locale, 'error.userNotFound') });
		const read = (name: string) => {
			const raw = String(form.get(name) ?? '').trim();
			return raw === '' ? null : Math.max(0, Math.floor(Number(raw) || 0));
		};
		const boards = read('boards');
		const storage = read('storage_mb');
		run('UPDATE users SET limit_boards = ?, limit_storage_mb = ?, updated_at = ? WHERE id = ?', boards, storage, now(), id);
		audit(locals.user!.id, 'admin.user_limits', user.username, `boards ${boards ?? 'default'}, storage ${storage ?? 'default'} MB`);
		return { success: true, message: translate(locals.locale, 'users.limitsSaved', { name: user.username }) };
	},

	toggleActive: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const user = getUserById(id);
		if (!user) return fail(404, { error: translate(locals.locale, 'error.userNotFound') });
		const refused = ownerRefusal(id, locals.user!.id);
		if (refused) return fail(403, { error: translate(locals.locale, refused) });
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
		const refused = ownerRefusal(id, locals.user!.id, { ownerMay: true });
		if (refused) return fail(403, { error: translate(locals.locale, refused) });

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
		const refused = ownerRefusal(id, locals.user!.id);
		if (refused) return fail(403, { error: translate(locals.locale, refused) });
		if (isLastAdmin(id)) return fail(400, { error: translate(locals.locale, 'users.error.lastAdmin') });

		// Projects cascade, but their bare repositories must go too.
		const projects = all<{ slug: string }>('SELECT slug FROM projects WHERE owner_id = ?', id);
		const { deleteRepo } = await import('$lib/server/git');
		for (const project of projects) await deleteRepo(user.username, project.slug);

		// Sign-up notifications only null their actor when the account goes; they would linger hidden.
		run("DELETE FROM notifications WHERE kind = 'signup' AND (actor_id = ? OR actor_id IS NULL)", id);
		run('DELETE FROM users WHERE id = ?', id);
		audit(locals.user!.id, 'admin.user_delete', user.username, `${projects.length} board(s)`);
		return { success: true, message: translate(locals.locale, 'users.deleted', { name: user.username, count: projects.length }) };
	}
};
