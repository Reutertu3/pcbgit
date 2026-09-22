import type { User } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			sessionId: string | null;
		}
		interface PageData {
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
