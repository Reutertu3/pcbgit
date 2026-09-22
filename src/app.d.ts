import type { User } from '$lib/server/auth';
import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			sessionId: string | null;
			locale: Locale;
		}
		interface PageData {
			locale: Locale;
			user: {
				id: string;
				username: string;
				displayName: string;
				role: 'user' | 'admin';
			} | null;
		}
	}
}

export {};
