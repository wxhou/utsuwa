<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { t } from '$lib/i18n';

	interface Props {
		name: string;
		systemPrompt: string;
		onNameChange: (name: string) => void;
		onSystemPromptChange: (prompt: string) => void;
		onNext: () => void;
		onBack: () => void;
	}

	let { name, systemPrompt, onNameChange, onSystemPromptChange, onNext, onBack }: Props = $props();

	const isValid = $derived(name.trim().length > 0);
</script>

<div class="ob-step">
	<div class="ob-head">
		<h2 class="ob-title">{t('onboarding.nameCompanion')}</h2>
		<p class="ob-subtitle">{t('onboarding.nameSubtitle')}</p>
	</div>

	<div class="ob-field">
		<label for="name" class="ob-label">{t('onboarding.name')}</label>
		<input
			id="name"
			type="text"
			class="ob-input"
			value={name}
			oninput={(e) => onNameChange(e.currentTarget.value)}
			placeholder={t('onboarding.namePlaceholder')}
		/>
	</div>

	<details class="ob-advanced"><summary>Personalize their personality</summary>
	<div class="ob-field">
		<label for="personality" class="ob-label">{t('onboarding.corePersonality')}</label>
		<textarea
			id="personality"
			class="ob-textarea"
			value={systemPrompt}
			oninput={(e) => onSystemPromptChange(e.currentTarget.value)}
			placeholder={t('onboarding.personalityPlaceholder')}
			rows="5"
		></textarea>
		<span class="ob-hint">{t('onboarding.personalityHint')}</span>
	</div>
	</details>

	<div class="ob-actions ob-actions--split">
		<button class="btn btn-secondary" onclick={onBack}>
			<Icon name="chevron-left" size={16} />
			{t('common.back')}
		</button>
		<button class="btn btn-primary" onclick={onNext} disabled={!isValid}>
			{t('common.next')}
			<Icon name="chevron-right" size={16} />
		</button>
	</div>
</div>
