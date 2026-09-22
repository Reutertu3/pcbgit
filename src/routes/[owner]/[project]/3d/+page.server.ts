import type { PageServerLoad } from './$types';
import { run } from '$lib/server/db';
import { listTree, readBlob } from '$lib/server/git';
import { repoPath } from '$lib/server/paths';
import { artifactMeta, listArtifacts } from '$lib/server/render/artifacts';
import { analyzeBoardText, type Mount } from '$lib/server/render/board';
import { artifactUrl } from '$lib/server/projectcontext';

export const load: PageServerLoad = async ({ parent }) => {
	const { commit, project } = await parent();
	const [glb] = commit ? listArtifacts(commit.id, 'pcb_glb') : [];
	if (!commit || !glb) return { modelUrl: null, mounts: {} };

	let { mounts } = artifactMeta<{ mounts?: Record<string, Mount> }>(glb);
	if (!mounts) {
		// Rendered before mount types were recorded: work them out once from the
		// board file and cache them on the artifact, so no re-render is needed.
		mounts = await mountsFromRepo(repoPath(project.owner_username, project.slug), commit.sha);
		run('UPDATE artifacts SET meta = ? WHERE id = ?', JSON.stringify({ ...artifactMeta(glb), mounts }), glb.id);
	}
	return { modelUrl: artifactUrl(glb), mounts };
};

async function mountsFromRepo(repo: string, sha: string): Promise<Record<string, Mount>> {
	try {
		const boards = (await listTree(repo, sha)).filter((file) => file.path.endsWith('.kicad_pcb'));
		// The shallowest board file is the project's own, as in the renderer.
		boards.sort((a, b) => a.path.split('/').length - b.path.split('/').length);
		if (!boards.length) return {};
		return analyzeBoardText(await readBlob(repo, sha, boards[0].path)).mounts;
	} catch {
		return {};
	}
}
