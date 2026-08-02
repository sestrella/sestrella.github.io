import { execSync } from 'node:child_process';

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

const headers: Record<string, string> = {
	Accept: 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
};

const token =
	process.env.GITHUB_TOKEN ??
	(() => {
		try {
			return process.env['GH_TOKEN'] ?? execSync('gh auth token', { encoding: 'utf-8' }).trim();
		} catch {
			return undefined;
		}
	})();

if (token) {
	headers.Authorization = `Bearer ${token}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(url, { headers });
		if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
			const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
			await sleep(Math.max(0, reset - Date.now()) + 1000);
			continue;
		}
		if (!res.ok) {
			throw new Error(
				`GitHub API request failed (${res.status}). Set GITHUB_TOKEN for a higher rate limit.`,
			);
		}
		return res.json();
	}
	throw new Error('GitHub API rate limited; retry the build later or set GITHUB_TOKEN.');
}

async function fetchMergedPrs(username: string) {
	const prs = [];
	for (let page = 1; page <= 10; page++) {
		const query = `author:${username} is:pr is:merged`;
		const data = await fetchJson(
			`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`,
		);
		const batch = data.items ?? [];
		if (batch.length === 0) break;
		prs.push(...batch);
		if (prs.length >= data.total_count) break;
	}
	return prs;
}

async function fetchRepoLanguages(repos: string[]) {
	const languages: Record<string, string> = {};
	let index = 0;
	async function worker() {
		while (index < repos.length) {
			const repo = repos[index++];
			try {
				const data = await fetchJson(`https://api.github.com/repos/${repo}`);
				languages[repo] = data.language ?? 'Other';
			} catch {
				languages[repo] = 'Other';
			}
		}
	}
	const workers = Array.from({ length: Math.min(8, repos.length) }, worker);
	await Promise.all(workers);
	return languages;
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
	return `/contributions/repository/${repo}`;
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
	const basePrs = (await fetchMergedPrs(USERNAME))
		.filter((pr) => pr.repository_url.split('/repos/')[1].split('/')[0] !== USERNAME)
		.map((pr) => ({
			repo: pr.repository_url.replace('https://api.github.com/repos/', ''),
			number: pr.number,
			title: pr.title,
			url: pr.html_url,
			mergedAt: pr.pull_request?.merged_at ?? pr.closed_at ?? pr.updated_at,
			body: pr.body,
		}));

	const repoLanguages = await fetchRepoLanguages([...new Set(basePrs.map((pr) => pr.repo))]);

	const mergedPrs = basePrs
		.map((pr) => ({ ...pr, language: repoLanguages[pr.repo] ?? 'Other' }))
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
