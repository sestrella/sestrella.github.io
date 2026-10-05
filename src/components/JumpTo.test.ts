import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import JumpTo from './JumpTo.astro';

const items = Array.from({ length: 7 }, (_, index) => ({
	label: `Section ${index + 1}`,
	href: `#section-${index + 1}`,
}));

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

async function render(itemsToRender: typeof items, visibleCount?: number) {
	return container.renderToString(JumpTo, {
		props: { items: itemsToRender, visibleCount },
	});
}

function expectLink(html: string | undefined, item: (typeof items)[number]) {
	expect(html).toMatch(new RegExp(`<a href="${item.href}"[^>]*>${item.label}</a>`));
}

describe('JumpTo', () => {
	it('renders nothing when there are no items', async () => {
		const html = await render([]);

		expect(html).not.toContain('data-jump');
	});

	it('shows all links without a toggle when there is no overflow', async () => {
		const html = await render(items.slice(0, 5));

		expect(html).toMatch(/<nav class="jump" data-jump aria-label="Jump to"/);
		for (const item of items.slice(0, 5)) {
			expectLink(html, item);
		}
		expect(html).not.toContain('data-jump-toggle');
	});

	it('shows five links by default and hides the rest behind a toggle', async () => {
		const html = await render(items);
		const overflow = html.match(
			/<span class="jump-overflow" data-jump-overflow hidden[^>]*>([\s\S]*?)<\/span>/,
		);

		expect(overflow).not.toBeNull();
		for (const item of items.slice(0, 5)) {
			expectLink(html, item);
		}
		for (const item of items.slice(5)) {
			expectLink(overflow?.[1], item);
		}
		expect(html).toContain('data-total="7"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('Show all 7');
	});

	it('respects a custom visibleCount', async () => {
		const html = await render(items, 2);
		const overflow = html.match(
			/<span class="jump-overflow" data-jump-overflow hidden[^>]*>([\s\S]*?)<\/span>/,
		);

		expectLink(html, items[0]);
		expectLink(html, items[1]);
		expectLink(overflow?.[1], items[2]);
		expectLink(overflow?.[1], items[6]);
		expect(html).toContain('Show all 7');
	});
});
