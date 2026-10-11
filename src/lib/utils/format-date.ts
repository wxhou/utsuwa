export function formatDate(raw: string | Date, locale: string = 'en'): string {
	const d = raw instanceof Date ? raw : new Date(raw + 'T00:00:00');
	const tag = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
	return d.toLocaleDateString(tag, {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}
