<script>
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Lenis smooth scroll — faithful port of the original App.js setup.
	onMount(() => {
		let lenis;
		let raf;
		let destroyed = false;
		(async () => {
			const Lenis = (await import('lenis')).default;
			if (destroyed) return;
			lenis = new Lenis({
				duration: 1.15,
				smoothWheel: true,
				easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
			});
			const loop = (time) => {
				lenis.raf(time);
				raf = requestAnimationFrame(loop);
			};
			raf = requestAnimationFrame(loop);
		})();

		return () => {
			destroyed = true;
			if (raf) cancelAnimationFrame(raf);
			lenis?.destroy();
		};
	});
</script>

<div class="App" data-testid="app-root">
	{@render children()}
</div>
