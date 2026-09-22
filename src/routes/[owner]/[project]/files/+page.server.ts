import type { PageServerLoad } from './$types';
import { listTree, readBlob } from '$lib/server/git';
import { repoPath } from '$lib/server/paths';

const TEXT_EXTENSIONS =
	/\.(md|markdown|txt|kicad_pro|kicad_sch|kicad_pcb|kicad_dru|kicad_wks|net|csv|json|yml|yaml|toml|ini|cfg|py|sh|c|h|cpp|hpp|rs|js|ts|xml|gbr|drl|step|stp)$/i;
const MAX_PREVIEW_BYTES = 400 * 1024;

export const load: PageServerLoad = async ({ parent, url }) => {
	const { project, commit } = await parent();
	if (!commit) return { tree: [], preview: null, totalBytes: 0 };

	const repo = repoPath(project.owner_username, project.slug);
	let tree: { path: string; size: number }[] = [];
	try {
		tree = await listTree(repo, commit.sha);
	} catch {
		return { tree: [], preview: null, totalBytes: 0 };
	}

	const wanted = url.searchParams.get('file');
	let preview: { path: string; content: string; truncated: boolean } | null = null;

	if (wanted) {
		const entry = tree.find((file) => file.path === wanted);
		if (entry && TEXT_EXTENSIONS.test(entry.path)) {
			const content = await readBlob(repo, commit.sha, entry.path);
			preview = {
				path: entry.path,
				content: content.slice(0, MAX_PREVIEW_BYTES),
				truncated: content.length > MAX_PREVIEW_BYTES
			};
		}
	}

	return {
		tree,
		preview,
		previewable: tree.filter((file) => TEXT_EXTENSIONS.test(file.path)).map((file) => file.path),
		totalBytes: tree.reduce((sum, file) => sum + file.size, 0)
	};
};
