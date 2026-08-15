export type Contribution = {
	repo: string;
	number: number;
	title: string;
	url: string;
	mergedAt: string;
	body: string | null;
	language: string;
};

export type ContributionData = {
	mergedPrs: Contribution[];
	repoCount: number;
	years: { year: number; prs: Contribution[] }[];
	repoGroups: { repo: string; prs: Contribution[]; count: number }[];
	languageGroups: { language: string; prs: Contribution[]; count: number }[];
	byYear: Record<number, Contribution[]>;
	byRepo: Record<string, Contribution[]>;
	byLanguage: Record<string, Contribution[]>;
	languages: string[];
};

const USERNAME = process.env.GITHUB_USERNAME ?? 'sestrella';
const GRAPHQL_URL = 'https://api.github.com/graphql';

const token = process.env.GITHUB_TOKEN;

if (!token) {
	throw new Error('GITHUB_TOKEN is required. Set the GITHUB_TOKEN environment variable and retry.');
}

const headers: Record<string, string> = {
	Accept: 'application/vnd.github+json',
	'Content-Type': 'application/json',
	Authorization: `Bearer ${token}`,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SearchNode = {
	number: number;
	title: string;
	url: string;
	mergedAt: string | null;
	bodyText: string | null;
	repository: {
		nameWithOwner: string;
		primaryLanguage: { name: string } | null;
	};
};

type SearchResult = {
	search: {
		issueCount: number;
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: (SearchNode | null)[];
	};
};

const SEARCH_QUERY = `
	query SearchMergedPrs($q: String!, $cursor: String) {
		search(query: $q, type: ISSUE, first: 100, after: $cursor) {
			issueCount
			pageInfo {
				hasNextPage
				endCursor
			}
			nodes {
				... on PullRequest {
					number
					title
					url
					mergedAt
					bodyText
					repository {
						nameWithOwner
						primaryLanguage {
							name
						}
					}
				}
			}
		}
	}
`;

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const body = JSON.stringify({ query, variables });
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(GRAPHQL_URL, { method: 'POST', headers, body });
		if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
			const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
			await sleep(Math.max(0, reset - Date.now()) + 1000);
			continue;
		}
		if (!res.ok) {
			throw new Error(
				`GitHub GraphQL request failed (${res.status}). Set GITHUB_TOKEN to authenticate.`,
			);
		}
		const data = await res.json();
		if (data.errors?.length) {
			throw new Error(`GitHub GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`);
		}
		return data.data as T;
	}
	throw new Error('GitHub API rate limited; retry the build later or set GITHUB_TOKEN.');
}

async function fetchMergedPrs(username: string): Promise<Contribution[]> {
	const prs: Contribution[] = [];
	let cursor: string | null = null;
	for (let page = 0; page < 10; page++) {
		const data = await graphql<SearchResult>(SEARCH_QUERY, {
			q: `author:${username} is:pr is:merged`,
			cursor,
		});
		const nodes = data.search.nodes.filter((n): n is SearchNode => n !== null);
		if (nodes.length === 0) break;
		for (const node of nodes) {
			prs.push({
				repo: node.repository.nameWithOwner,
				number: node.number,
				title: node.title,
				url: node.url,
				mergedAt: node.mergedAt ?? '',
				body: node.bodyText,
				language: node.repository.primaryLanguage?.name ?? 'Other',
			});
		}
		if (!data.search.pageInfo.hasNextPage || prs.length >= data.search.issueCount) break;
		cursor = data.search.pageInfo.endCursor;
	}
	return prs;
}

export function languageSlug(language: string) {
	return (
		language
			.toLowerCase()
			.replaceAll('#', 'sharp')
			.replaceAll('+', 'plus')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'other'
	);
}

export function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

export function contributionRepoUrl(repo: string) {
	return `/contributions/repositories/${repo}`;
}

export function anchorId(input: string) {
	return (
		input
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'x'
	);
}

function groupBy<T>(items: T[], key: (item: T) => string | number) {
	return items.reduce((acc, item) => {
		const k = key(item);
		(acc[k] ??= []).push(item);
		return acc;
	}, {} as Record<string, T[]>);
}

async function load(): Promise<ContributionData> {
	const mergedPrs = (await fetchMergedPrs(USERNAME))
		.filter((pr) => pr.repo.split('/')[0] !== USERNAME)
		.sort((a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime());

	const byYear = groupBy(mergedPrs, (pr) => new Date(pr.mergedAt).getUTCFullYear());
	const byRepo = groupBy(mergedPrs, (pr) => pr.repo);
	const byLanguage = groupBy(mergedPrs, (pr) => pr.language);

	const years = Object.entries(byYear)
		.map(([year, prs]) => ({ year: Number(year), prs }))
		.sort((a, b) => b.year - a.year);

	const repoGroups = Object.entries(byRepo)
		.map(([repo, prs]) => ({ repo, prs, count: prs.length }))
		.sort((a, b) => b.count - a.count);

	const languageGroups = Object.entries(byLanguage)
		.map(([language, prs]) => ({ language, prs, count: prs.length }))
		.sort((a, b) => b.count - a.count || a.language.localeCompare(b.language));

	return {
		mergedPrs,
		repoCount: Object.keys(byRepo).length,
		years,
		repoGroups,
		languageGroups,
		byYear,
		byRepo,
		byLanguage,
		languages: languageGroups.map((g) => g.language),
	};
}

let cache: Promise<ContributionData> | null = null;

export function loadContributions(): Promise<ContributionData> {
	cache ??= load();
	return cache;
}
