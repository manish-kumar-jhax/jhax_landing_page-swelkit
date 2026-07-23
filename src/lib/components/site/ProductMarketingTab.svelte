<script>
	const goals = [
		'Bring back customers who stopped coming',
		'Fill Tuesday lunch',
		'Push high-margin deal',
		'Promote new menu item'
	];
	let goal = $state(0);
</script>

<div class="grid gap-5">
	<div class="rounded-xl p-5" style="background: #0a0a0a; border: 1px solid #1E1E1E;">
		<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-orange mb-3">
			Promotion Builder · Goal
		</div>
		<div class="flex flex-wrap gap-2">
			{#each goals as g, i (g)}
				<button
					type="button"
					onclick={() => (goal = i)}
					class="px-3 py-2 rounded-full text-[12.5px] transition-colors"
					style="background: {goal === i ? 'rgba(232,80,10,0.14)' : '#0f0f0f'}; color: {goal === i
						? '#FF6B2B'
						: '#8a8785'}; border: 1px solid {goal === i ? 'rgba(232,80,10,0.4)' : '#1E1E1E'};"
				>
					{g}
				</button>
			{/each}
		</div>
	</div>

	<!-- Banner preview -->
	<div class="rounded-xl overflow-hidden" style="border: 1px solid #1E1E1E;">
		<div
			class="flex items-center justify-between px-4 py-2 border-b"
			style="border-color: #1E1E1E; background: #0a0a0a;"
		>
			<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-ghost">
				Banner preview · Generated in 3s
			</div>
			<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-warm">
				WhatsApp · SMS · IG
			</div>
		</div>
		<div
			class="relative p-8 md:p-10"
			style="background: linear-gradient(135deg, #1a0d05 0%, #E8500A 55%, #FF6B2B 100%);"
		>
			<div
				aria-hidden="true"
				class="absolute inset-0 opacity-30"
				style="background-image: radial-gradient(#00000030 1px, transparent 1px); background-size: 12px 12px;"
			></div>
			<div class="relative">
				<div class="font-mono text-[10px] uppercase tracking-[0.28em]" style="color: #FFE3D0;">
					We miss you — come back this week
				</div>
				<div
					class="mt-2 font-display text-white"
					style="font-size: clamp(28px, 3.8vw, 44px); letter-spacing: -0.03em; line-height: 1.05;"
				>
					Your favorite table
					<br />
					is waiting.
				</div>
				<div class="mt-3 font-mono text-[12px]" style="color: #FFE3D0;">
					20% off your next visit · Valid this week only
				</div>
			</div>
		</div>
	</div>

	<!-- ROI card -->
	<div class="rounded-xl p-5" style="background: #0a0a0a; border: 1px solid #1E1E1E;">
		<div class="flex items-center justify-between mb-2">
			<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-orange">
				Money made vs money spent
			</div>
			<div
				class="font-mono text-[10px] px-2 py-0.5 rounded-full"
				style="background: rgba(22,163,74,0.14); color: #22C55E; border: 1px solid rgba(22,163,74,0.3);"
			>
				SUCCESS
			</div>
		</div>
		<div
			class="text-cream font-display"
			style="font-size: 26px; letter-spacing: -0.02em; line-height: 1.15;"
		>
			Last promotion made
			<span class="text-orange"> $340 in 48 hours</span> — 8 people came back.
		</div>
		<div class="flex flex-wrap gap-2 mt-4">
			{#each [['Sent to', '127'], ['Opened', '89'], ['Redeemed', '8'], ['Recovered', '$340']] as [l, v] (l)}
				<div
					class="px-3 py-1.5 rounded-full font-mono text-[11px]"
					style="background: #0f0f0f; border: 1px solid #1E1E1E;"
				>
					<span class="text-ghost">{l}: </span>
					<span class="text-cream">{v}</span>
				</div>
			{/each}
		</div>
	</div>
</div>
