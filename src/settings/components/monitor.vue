<template>
	<section class="tw-flex-grow-1 tw-align-self-start">
		<div class="tw-flex tw-align-items-center">
			<header>
				{{ t(type.i18n, type.title) }}
			</header>

			<div :style="{ position: 'relative', width: `${settings_preview_width/10}px`, height: `${settings_preview_height/10}px`, margin: '10px' }">
				<template v-for="mon in monitors">
					<label :style="{ border: 'solid 1px var(--color-text-base)', width: `${mon.width/10}px`, height: `${mon.height/10}px`, top: `${(mon.top-settings_preview_offset_top)/10}px`, left: `${(mon.left-settings_preview_offset_left)/10}px`, position: 'absolute', textAlign: 'center' }">
						<input v-model="selected" :value="mon" type="radio" style="min-width: auto;">
						<br>
						{{ mon.label }}
						<br>
						({{ mon.width }}&times;{{ mon.height }})
					</label>
				</template>
			</div>

		</div>
		<div class="tw-c-text-alt-2">
			{{ t('setting.filter.monitor.about', 'This setting requires that this site has the Window Management permission. Please be sure that it is allowed.') }}
		</div>
	</section>
</template>

<script>

import { sortScreens, matchScreen } from 'utilities/object';

let last_id = 0;

export default {
	props: ['value', 'type', 'filters', 'context'],

	data() {
		return {
			id: last_id++,
			has_monitors: true,
			monitors: [],
			ready: false,
			selected: null,
			settings_preview_offset_left: 0,
			settings_preview_offset_top: 0,
			settings_preview_width: 0,
			settings_preview_height: 0,
		}
	},

	created() {
		this.detectMonitors();
	},

	watch: {
		selected() {
			if ( ! this.ready || ! this.selected )
				return;

			const data = this.value.data = this.value.data || {};

			data.label = this.selected.label;
			data.index = this.monitors.indexOf(this.selected);
			data.top = this.selected.top;
			data.left = this.selected.left;
			data.width = this.selected.width;
			data.height = this.selected.height;
		}
	},

	methods: {
		async detectMonitors() {
			let data;
			try {
				data = await window.getScreenDetails();
			} catch(err) {
				console.error('Unable to get screen details', err);
				this.has_monitors = false;
				this.monitors = [];
				return;
			}

			this.monitors = [];
			let leftMost = Infinity;
			let rightMost = -Infinity;
			let topMost = Infinity;
			let bottomMost = -Infinity;
			for(const mon of data.screens) {
				this.monitors.push({
					top: mon.top,
					left: mon.left,
					label: mon.label,
					width: mon.width,
					height: mon.height
				});
				leftMost = Math.min(leftMost, mon.left);
				rightMost = Math.max(rightMost, mon.left + mon.width);
				topMost = Math.min(topMost, mon.top);
				bottomMost = Math.max(bottomMost, mon.top + mon.height);
			}

			this.settings_preview_offset_left = leftMost;
			this.settings_preview_offset_top = topMost;
			this.settings_preview_width = rightMost - leftMost;
			this.settings_preview_height = bottomMost - topMost;

			sortScreens(this.monitors);
			if ( this.value.data )
				this.selected = matchScreen(this.monitors, this.value.data);

			this.ready = true;

			if ( ! this.selected )
				this.selected = this.monitors[0];
		}
	}
}

</script>