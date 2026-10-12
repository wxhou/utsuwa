<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { t } from '$lib/i18n';
	import type { AppMode } from '$lib/types/character';

	interface Props {
		mode: AppMode;
		onModeChange: (mode: AppMode) => void;
		onNext: () => void;
		onBack: () => void;
	}

	let { mode, onModeChange, onNext, onBack }: Props = $props();
</script>

<div class="ob-step">
	<div class="ob-head">
		<h2 class="ob-title">{t('onboarding.chooseMode')}</h2>
		<p class="ob-subtitle">{t('onboarding.changeAnytime')}</p>
	</div>

	<div class="mode-list">
		<button
			type="button"
			class="mode-option"
			aria-pressed={mode === 'dating_sim'}
			class:selected={mode === 'dating_sim'}
			onclick={() => onModeChange('dating_sim')}
		>
			<span class="opt-radio">
				{#if mode === 'dating_sim'}<Icon name="check" size={12} />{/if}
			</span>
			<span class="opt-text">
				<span class="opt-title">{t('onboarding.datingSim')}</span>
				<span class="opt-desc">{t('onboarding.datingSimDesc')}</span>
			</span>
		</button>

		<button
			type="button"
			class="mode-option"
			aria-pressed={mode === 'companion'}
			class:selected={mode === 'companion'}
			onclick={() => onModeChange('companion')}
		>
			<span class="opt-radio">
				{#if mode === 'companion'}<Icon name="check" size={12} />{/if}
			</span>
			<span class="opt-text">
				<span class="opt-title">{t('onboarding.companion')}</span>
				<span class="opt-desc">{t('onboarding.companionDesc')}</span>
			</span>
		</button>
	</div>

	<div class="ob-actions ob-actions--split">
		<button class="btn btn-secondary" onclick={onBack}>
			<Icon name="chevron-left" size={16} />
			{t('common.back')}
		</button>
		<button class="btn btn-primary" onclick={onNext}>
			{t('common.next')}
			<Icon name="chevron-right" size={16} />
		</button>
	</div>
</div>

<style>
	.mode-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.mode-option {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
		width: 100%;
		text-align: left;
		padding: 1rem 1.1rem;
		background: var(--bg-secondary);
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		cursor: pointer;
		font-family: inherit;
		transition: border-color 0.15s, background 0.15s, transform 0.1s;
	}

	.mode-option:hover {
		background: var(--bg-tertiary);
	}

	.mode-option:active {
		transform: scale(0.99);
	}

	.mode-option.selected {
		border-color: var(--accent);
		background: var(--accent-muted);
	}

	.opt-radio {
		flex-shrink: 0;
		margin-top: 0.1rem;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 2px solid var(--border-light);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-contrast);
		transition: background 0.15s, border-color 0.15s;
	}

	.mode-option.selected .opt-radio {
		background: var(--accent);
		border-color: var(--accent);
	}

	.opt-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.opt-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.opt-desc {
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text-secondary);
	}
</style>
