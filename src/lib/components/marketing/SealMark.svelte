<script lang="ts">
	// The hanko-style accent seal that opens each day-phase section. Pure
	// decoration; the section headings carry the text semantics. 器 needs CJK
	// glyphs the display face lacks, so the seal reads from the base font stack.
	let { small = false }: { small?: boolean } = $props();
</script>

<span class="seal" class:small aria-hidden="true">器</span>

<style>
	.seal {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 6px;
		background: var(--stat-affection);
		color: #fff;
		font-size: 17px;
		font-weight: 700;
		line-height: 1;
		font-family: var(--font-sans);
		animation: sealIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
		animation-delay: 0.15s;
	}

	.small {
		width: 20px;
		height: 20px;
	}

	@keyframes sealIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.seal {
			animation: none;
		}
	}
</style>
