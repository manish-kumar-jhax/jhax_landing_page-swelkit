<script>
	import { Check } from 'lucide-svelte';
	import Reveal from './Reveal.svelte';
	import { apiPost } from '@/api.js';

	let email = $state('');
	let status = $state('idle'); // idle | loading | success | error
	let message = $state('');

	const validate = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

	async function submit(e) {
		e?.preventDefault();
		if (!validate(email)) {
			status = 'error';
			message = 'Please enter a valid email';
			return;
		}
		status = 'loading';
		try {
			await apiPost('/leads', { email, source: 'final_cta' });
			status = 'success';
			message = "We'll be in touch within 24 hours";
			email = '';
			setTimeout(() => {
				status = 'idle';
				message = '';
			}, 4000);
		} catch {
			status = 'error';
			message = 'Something went wrong. Try again.';
		}
	}

	let borderColor = $derived(
		status === 'success' ? '#16A34A' : status === 'error' ? '#DC2626' : 'rgba(255,255,255,0.10)'
	);

	const trust = ['No credit card', 'No commitment', 'See a real restaurant live', '20 minutes'];
</script>

<section id="book-demo" data-testid="final-cta" class="relative py-28 md:py-40 overflow-hidden">
	<!-- Ambient glow -->
	<div
		aria-hidden="true"
		class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[600px] blur-3xl opacity-50 pointer-events-none"
		style="background: radial-gradient(closest-side, rgba(232,80,10,0.22), transparent);"
	></div>

	<div class="relative max-w-[1000px] mx-auto text-center px-6 md:px-10">
		<Reveal
			y={12}
			amount={0.3}
			class="inline-flex items-center gap-2 rounded-full font-mono text-[11px] tracking-[0.18em] uppercase mb-8"
			style="background: rgba(232,80,10,0.08); border: 1px solid rgba(232,80,10,0.3); color: #FF6B2B; padding: 8px 16px;"
		>
			<span class="w-1.5 h-1.5 rounded-full dot-pulse" style="background: #E8500A;"></span>
			The last thing
		</Reveal>

		<Reveal
			tag="h2"
			y={24}
			amount={0.3}
			duration={0.9}
			class="font-display text-cream"
			style="font-size: clamp(48px, 8vw, 100px); letter-spacing: -0.045em; line-height: 0.93;"
		>
			Your competitors
			<br />
			are already
			<br />
			<span class="text-orange">falling behind.</span>
		</Reveal>

		<p
			class="mt-8 mx-auto text-muted-warm"
			style="max-width: 620px; font-size: 18px; font-weight: 300; line-height: 1.6;"
		>
			Book a free 20-minute call. We&apos;ll show JHAX working on a real restaurant — then tell you
			what it would find in yours.
		</p>

		<form
			onsubmit={submit}
			novalidate
			data-testid="lead-form"
			class="mt-10 mx-auto flex flex-col sm:flex-row gap-3 max-w-[560px]"
		>
			<div class="relative flex-1">
				<input
					type="email"
					bind:value={email}
					oninput={() => {
						if (status === 'error') status = 'idle';
					}}
					placeholder={status === 'success'
						? "✓ We'll be in touch within 24 hours!"
						: 'your@email.com'}
					data-testid="lead-email-input"
					class="w-full h-[56px] px-6 rounded-full bg-transparent text-cream placeholder:text-muted-warm outline-none transition-all"
					style="border: 1px solid {borderColor}; background: #0d0d0d; font-size: 15px; font-weight: 500;"
					onfocus={(e) => {
						if (status === 'idle') e.currentTarget.style.borderColor = '#E8500A';
					}}
					onblur={(e) => {
						if (status === 'idle') e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
					}}
				/>
			</div>
			<button
				type="submit"
				disabled={status === 'loading'}
				data-testid="lead-submit-btn"
				class="h-[56px] inline-flex items-center justify-center gap-2 rounded-full px-8 font-semibold whitespace-nowrap"
				style="background: #E8500A; color: #fff; font-size: 15px; box-shadow: 0 20px 60px -20px rgba(232,80,10,0.6); transition: transform .2s ease, box-shadow .2s ease;"
				onmouseenter={(e) => {
					e.currentTarget.style.transform = 'translateY(-2px)';
					e.currentTarget.style.boxShadow = '0 28px 72px -20px rgba(232,80,10,0.8)';
				}}
				onmouseleave={(e) => {
					e.currentTarget.style.transform = 'translateY(0)';
					e.currentTarget.style.boxShadow = '0 20px 60px -20px rgba(232,80,10,0.6)';
				}}
			>
				{status === 'loading' ? 'Booking…' : 'Show Me'}
				<span aria-hidden="true">→</span>
			</button>
		</form>

		{#if status === 'success'}
			<div
				class="mt-4 inline-flex items-center gap-2 text-[13px] font-mono uppercase tracking-[0.16em]"
				style="color: #16A34A;"
				data-testid="lead-success"
			>
				<Check size={14} />
				{message}
			</div>
		{/if}
		{#if status === 'error'}
			<div
				class="mt-4 text-[13px] font-mono uppercase tracking-[0.16em]"
				style="color: #DC2626;"
				data-testid="lead-error"
			>
				{message}
			</div>
		{/if}

		<div
			class="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-warm"
		>
			{#each trust as t (t)}
				<span class="inline-flex items-center gap-2">
					<span style="color: #E8500A;">✓</span>
					{t}
				</span>
			{/each}
		</div>
	</div>
</section>
