/** Tags grouped by category: the tag page and the front page's filter. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { groupTags, topTagGroups, usedTagGroups } from '../src/lib/taggroups.ts';

const categories = [
	{ id: 'component', name: '' },
	{ id: 'interface', name: '' },
	{ id: 'empty', name: 'Nothing here' }
];
const tag = (slug: string, category: string, project_count: number) => ({ slug, name: slug.toUpperCase(), category, project_count });
const tags = [
	tag('usb-c', 'interface', 1),
	...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((slug, index) => tag(slug, 'component', 7 - index)),
	tag('unused', 'component', 0),
	tag('can', 'interface', 0)
];
const slugs = (group: { tags: { slug: string }[] }) => group.tags.map((t) => t.slug);

test('tags sit under their categories, in the categories\' order, most used first', () => {
	const groups = groupTags(categories, [...tags].reverse());
	assert.deepEqual(groups.map((group) => group.category), ['component', 'interface'], 'empty categories are left out');
	assert.deepEqual(slugs(groups[0]), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'unused']);
	assert.deepEqual(slugs(groups[1]), ['usb-c', 'can']);
});

test('the front page shows the five most used per category and counts the rest', () => {
	const [components, interfaces] = topTagGroups(categories, tags, 5);
	assert.deepEqual(slugs(components), ['a', 'b', 'c', 'd', 'e']);
	assert.equal(components.more, 2, 'f and g; the unused tag is not counted');
	assert.deepEqual(slugs(interfaces), ['usb-c'], 'no unused tags');
	assert.equal(interfaces.more, 0);
});

test('a tag being filtered by stays visible, whatever its rank', () => {
	const [components, interfaces] = topTagGroups(categories, tags, 5, ['g', 'can']);
	assert.deepEqual(slugs(components), ['a', 'b', 'c', 'd', 'e', 'g']);
	assert.equal(components.more, 1);
	assert.deepEqual(slugs(interfaces), ['usb-c', 'can'], 'even one no board uses');
});

test('the tag page lists only tags in use, by name', () => {
	const shuffled = [tag('zeta', 'component', 9), tag('alpha', 'component', 1), tag('mid', 'component', 4), tag('idle', 'component', 0)];
	const groups = usedTagGroups(categories, [...shuffled, tag('can', 'interface', 0)]);
	assert.deepEqual(groups.map((group) => group.category), ['component'], 'a category with only unused tags disappears');
	assert.deepEqual(slugs(groups[0]), ['alpha', 'mid', 'zeta']);
});
