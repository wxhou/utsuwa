// Proactive check-ins — the first messaging-category module. Off by default;
// while enabled the Rust scheduler wakes candidate moments and the check-in
// engine (this package) turns a remembered fact into a bounded, auditable
// greeting.
import type { ModuleDefinition } from '$lib/types/module';
import { reminderStore } from '$lib/stores/reminders.svelte';
import { modulesStore } from '$lib/stores/modules.svelte';
import {
	checkinConfigFromSettings,
	dismissPendingCheckins,
	pushScheduleSnapshot,
	requestNotificationPermission
} from './proactive-bridge';
import { logProactive } from './telemetry';

async function pushProactiveSnapshot(): Promise<void> {
	await pushScheduleSnapshot(
		reminderStore.scheduleSnapshotReminders(),
		checkinConfigFromSettings(
			modulesStore.getModuleSettings('proactive'),
			modulesStore.isModuleEnabled('proactive')
		)
	);
}

export const proactiveModule: ModuleDefinition = {
	metadata: {
		id: 'proactive',
		name: 'Proactive check-ins',
		description: 'She reaches out on her own, anchored in a memory of you',
		category: 'messaging',
		icon: 'message'
	},

	settingsSchema: {
		fields: [
			{
				key: 'maxPerDay',
				type: 'number',
				label: 'Max per day',
				description: 'Daily cap for proactive messages (1–3, only lowerable)'
			},
			{
				key: 'quietHours',
				type: 'select',
				label: 'Quiet hours',
				description: 'Times of day she stays silent',
				options: [
					{ value: '22-8', label: '22:00–08:00' },
					{ value: '23-9', label: '23:00–09:00' },
					{ value: '0-7', label: '00:00–07:00' }
				]
			},
			{
				key: 'quietEnabled',
				type: 'boolean',
				label: 'Enable quiet hours'
			},
			{
				key: 'paused',
				type: 'boolean',
				label: 'Pause everything'
			}
		]
	},

	isConfigured(): boolean {
		// Nothing to configure: the greeting reuses the chat model the user
		// already set up, and an unavailable model just skips silently.
		return true;
	},

	async onEnable() {
		// Desktop APIs are always granted; the request is the mobile/web contract.
		await requestNotificationPermission();
		await pushProactiveSnapshot();
		logProactive('module_enabled');
	},

	async onDisable() {
		// Disable = pause semantics: withdraw queued slots too.
		await dismissPendingCheckins();
		await pushProactiveSnapshot();
		logProactive('module_disabled');
	},

	onSettingsChange(settings) {
		logProactive('module_settings_changed', {
			enabled: modulesStore.isModuleEnabled('proactive'),
			paused: !!settings.paused,
			maxPerDay: settings.maxPerDay as number,
			quietEnabled: !!settings.quietEnabled
		});
		if (settings.paused) void dismissPendingCheckins();
		void pushProactiveSnapshot();
	}
};