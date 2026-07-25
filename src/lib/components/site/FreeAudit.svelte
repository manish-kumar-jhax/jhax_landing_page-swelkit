<script>
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import {
		Search,
		Star,
		MessageSquare,
		Clock,
		Activity,
		Wrench,
		Sparkles,
		AlertTriangle,
		ArrowRight,
		Download,
		Loader2,
		X,
		Building2,
		User,
		Mail,
		Phone
	} from 'lucide-svelte';
	import { runAudit as runAuditRequest } from '@/audit/index.js';
	import { saveLead } from '@/leads.js';
	import { scrollToEl } from '@/lenis.js';

	// Kept in sync with the backend heuristics (audit.js).
	const BENCHMARK_RATING = 4.7;
	const VISIBILITY_REVIEW_FLOOR = 150;

	const LOADING_STEPS = [
		{ emoji: '🔍', label: 'Finding your restaurant' },
		{ emoji: '📖', label: 'Reading your reviews' },
		{ emoji: '⏰', label: 'Checking your busy hours' },
		{ emoji: '🏆', label: 'Comparing to other restaurants nearby' },
		{ emoji: '💰', label: 'Finding money leaks' }
	];

	const EXAMPLES = [
		{ name: "Katz's Delicatessen", city: 'New York', label: "Katz's Delicatessen · New York" },
		{ name: 'Franklin Barbecue', city: 'Austin', label: 'Franklin Barbecue · Austin' },
		{ name: 'Pike Place Chowder', city: 'Seattle', label: 'Pike Place Chowder · Seattle' }
	];

	const TIER_STYLES = {
		URGENT: { Icon: AlertTriangle, color: '#F87171', bg: 'rgba(220,38,38,0.10)', bd: 'rgba(220,38,38,0.35)' },
		'FIX THIS': { Icon: Wrench, color: '#FF6B2B', bg: 'rgba(232,80,10,0.12)', bd: 'rgba(232,80,10,0.40)' },
		OPPORTUNITY: { Icon: Sparkles, color: '#22C55E', bg: 'rgba(22,163,74,0.10)', bd: 'rgba(22,163,74,0.30)' }
	};

	// ---------- Turn the API response into what the report UI renders ----------
	function buildFindings({ rating, reviewCount, moneyLost, openNow }) {
		const out = [];

		if (rating != null && rating < BENCHMARK_RATING) {
			const gap = (BENCHMARK_RATING - rating).toFixed(1);
			out.push({
				tier: rating < 4.0 ? 'URGENT' : 'FIX THIS',
				title: `Your rating is ${rating.toFixed(1)}★ — ${gap} below the 4.7 that keeps tables full`,
				body: "Each star is worth ~5–9% of revenue. Reply to recent reviews and fix the top complaint — that's the fastest lift.",
				impact: moneyLost ? `$${moneyLost.toLocaleString('en-US')} / week` : null
			});
		} else if (rating != null) {
			out.push({
				tier: 'OPPORTUNITY',
				title: `Your ${rating.toFixed(1)}★ rating is doing the heavy lifting`,
				body: "You're at or above the 4.7 benchmark. Protect it — a single quiet month of unanswered reviews can undo it fast.",
				impact: null
			});
		}

		if (reviewCount != null) {
			if (reviewCount < VISIBILITY_REVIEW_FLOOR) {
				out.push({
					tier: 'FIX THIS',
					title: `Only ${reviewCount.toLocaleString('en-US')} public reviews — you're hard to find`,
					body: "Thin review counts push you down Google's local results. A simple 'leave us a review' prompt at checkout compounds every week.",
					impact: null
				});
			} else {
				out.push({
					tier: 'OPPORTUNITY',
					title: `${reviewCount.toLocaleString('en-US')} reviews is real reach`,
					body: "You already have the audience. Turning happy reviewers into referrers is the cheapest growth you'll find.",
					impact: null
				});
			}
		}

		if (openNow === false) {
			out.push({
				tier: 'OPPORTUNITY',
				title: "You're closed right now — are your Google hours exact?",
				body: 'Wrong or missing hours are a top cause of lost walk-ins. Double-check every day, including holidays.',
				impact: null
			});
		}

		return out.slice(0, 3);
	}

	function buildReportFromApi(data) {
		const p = data.place || {};
		const est = data.estimated || {};
		const oh = p.opening_hours || {};
		const rating = typeof p.rating === 'number' ? p.rating : null;
		const reviewCount = typeof p.review_count === 'number' ? p.review_count : null;
		const openNow = oh.open_now;
		const moneyLost = est.money_lost_weekly ?? 0;

		const kpis = [
			{ label: 'Rating', value: rating != null ? rating.toFixed(1) : '—', suffix: rating != null ? '★' : '', icon: Star },
			{ label: 'Reviews', value: reviewCount != null ? reviewCount.toLocaleString('en-US') : '—', icon: MessageSquare },
			{ label: 'Open now', value: openNow === true ? 'Open' : openNow === false ? 'Closed' : '—', icon: Clock },
			{ label: 'Health', value: est.health_score != null ? String(est.health_score) : '—', suffix: '/100', icon: Activity }
		];

		return {
			name: p.name || 'Your restaurant',
			location: p.address || 'From public info only',
			dataSource: data.data_source || 'estimated',
			healthScore: est.health_score ?? 0,
			healthLabel: est.health_label || '',
			moneyLost,
			basis: est.basis || '',
			kpis,
			reviews: Array.isArray(p.top_reviews) ? p.top_reviews : [],
			findings: buildFindings({ rating, reviewCount, moneyLost, openNow })
		};
	}

	// ---------- PDF report template (fresh light DOM node, print-optimized) ----------
	const escHtml = (s) =>
		String(s ?? '').replace(
			/[&<>"']/g,
			(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
		);

	const pdfScoreColor = (v) => (v >= 75 ? '#16A34A' : v >= 50 ? '#E8500A' : '#DC2626');
	const PDF_TIER_COLOR = { URGENT: '#DC2626', 'FIX THIS': '#E8500A', OPPORTUNITY: '#16A34A' };

	function buildPdfTemplate(report) {
		const money = '$' + (report.moneyLost || 0).toLocaleString('en-US') + ' / wk';
		const sColor = pdfScoreColor(report.healthScore);

		const sectionTitle = (t) =>
			`<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#E8500A;font-weight:700;">${t}</div>`;

		const kpiHtml = (report.kpis || [])
			.map(
				(k) => `
			<div style="flex:1;border:1px solid #e6e2dc;border-radius:10px;padding:10px 12px;background:#faf8f5;">
				<div style="font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:#9a9691;">${escHtml(k.label)}</div>
				<div style="font-size:19px;font-weight:800;color:#141414;margin-top:3px;">${escHtml(k.value)}${
					k.suffix ? `<span style="font-size:12px;color:#E8500A;font-weight:700;"> ${escHtml(k.suffix)}</span>` : ''
				}</div>
			</div>`
			)
			.join('');

		const findingsHtml =
			(report.findings || [])
				.map((f) => {
					const c = PDF_TIER_COLOR[f.tier] || '#E8500A';
					return `
				<div style="border:1px solid #e6e2dc;border-left:4px solid ${c};border-radius:8px;padding:11px 13px;margin-top:9px;background:#ffffff;break-inside:avoid;page-break-inside:avoid;">
					<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
						<span style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${c};">${escHtml(f.tier)}</span>
						${f.impact ? `<span style="font-size:11px;font-weight:700;color:${c};white-space:nowrap;">~${escHtml(f.impact)}</span>` : ''}
					</div>
					<div style="font-size:13.5px;font-weight:600;color:#141414;margin-top:5px;line-height:1.3;">${escHtml(f.title)}</div>
					<div style="font-size:11.5px;color:#5c5854;margin-top:4px;line-height:1.45;">${escHtml(f.body)}</div>
				</div>`;
				})
				.join('') || `<div style="font-size:12px;color:#6B6866;margin-top:9px;">No findings.</div>`;

		const reviewsHtml =
			report.reviews && report.reviews.length
				? report.reviews
						.slice(0, 3)
						.map(
							(r) => `
				<div style="border:1px solid #e6e2dc;border-radius:8px;padding:10px 12px;margin-top:9px;background:#faf8f5;break-inside:avoid;page-break-inside:avoid;">
					<div style="display:flex;justify-content:space-between;gap:10px;">
						<span style="font-size:12px;font-weight:600;color:#141414;">${escHtml(r.author || 'Google user')}</span>
						${r.rating != null ? `<span style="font-size:11px;font-weight:700;color:#E8500A;">${escHtml(r.rating)}★</span>` : ''}
					</div>
					${r.text ? `<div style="font-size:11.5px;color:#5c5854;margin-top:4px;line-height:1.45;">${escHtml(r.text)}</div>` : ''}
					${
						r.relative_time
							? `<div style="font-size:9.5px;color:#9a9691;margin-top:5px;text-transform:uppercase;letter-spacing:0.06em;">${escHtml(r.relative_time)}</div>`
							: ''
					}
				</div>`
						)
						.join('')
				: `<div style="font-size:12px;color:#6B6866;margin-top:9px;border:1px dashed #e0dcd5;border-radius:8px;padding:12px;background:#faf8f5;">No public reviews available for this restaurant.</div>`;

		const bannerHtml =
			report.dataSource === 'estimated'
				? `<div style="flex:1;border:1px solid #f0d9c9;border-radius:12px;padding:13px 15px;background:#fff6f0;display:flex;flex-direction:column;justify-content:center;">
					<div style="font-size:10.5px;font-weight:700;color:#B23A06;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">These numbers are estimated</div>
					<div style="font-size:11.5px;line-height:1.5;color:#5c5854;">Location is real; rating and reviews are modelled from public map data. Full verified analysis is available once connected to Google.</div>
				</div>`
				: '';

		const root = document.createElement('div');
		root.setAttribute('data-jhax-pdf', 'true');
		root.style.cssText =
			'width:100%;background:#ffffff;color:#141414;box-sizing:border-box;padding:2px 2px 6px;' +
			"font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;" +
			'opacity:1;transform:none;animation:none;transition:none;';
		root.innerHTML = `
			<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #E8500A;padding-bottom:12px;">
				<div style="min-width:0;">
					<div style="font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:#E8500A;font-weight:700;">Restaurant Health</div>
					<div style="font-size:25px;font-weight:800;line-height:1.15;margin-top:4px;color:#141414;opacity:1;transform:none;animation:none;transition:none;">${escHtml(report.name)}</div>
					<div style="font-size:11.5px;color:#6B6866;margin-top:4px;line-height:1.35;">${escHtml(report.location)}</div>
				</div>
				<div style="text-align:right;flex-shrink:0;">
					<div style="font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;color:#9a9691;">Est. money lost</div>
					<div style="font-size:22px;font-weight:800;color:#E8500A;line-height:1.05;margin-top:3px;white-space:nowrap;">${escHtml(money)}</div>
				</div>
			</div>

			<div style="display:flex;gap:12px;margin-top:16px;">
				<div style="flex-shrink:0;width:120px;border:1px solid #e6e2dc;border-radius:12px;padding:14px 10px;text-align:center;background:#faf8f5;">
					<div style="font-size:40px;font-weight:800;line-height:1;color:${sColor};opacity:1;transform:none;animation:none;transition:none;">${escHtml(report.healthScore)}</div>
					<div style="font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;color:${sColor};margin-top:5px;font-weight:700;">${escHtml(report.healthLabel || '')}</div>
					<div style="font-size:9px;color:#9a9691;margin-top:2px;">Health score / 100</div>
				</div>
				${bannerHtml}
			</div>

			<div style="margin-top:20px;">
				${sectionTitle('Key numbers')}
				<div style="display:flex;gap:9px;margin-top:8px;">${kpiHtml}</div>
			</div>

			<div style="margin-top:20px;">
				${sectionTitle('What JHAX found')}
				${findingsHtml}
			</div>

			<div style="margin-top:20px;">
				${sectionTitle('What people are saying')}
				${reviewsHtml}
			</div>
		`;
		return root;
	}

	// ---------- Component state ----------
	let query = $state('');
	let state = $state('idle'); // idle | loading | report | error
	let stepIndex = $state(0);
	let report = $state(null);
	let error = $state('');
	let pdfState = $state('idle'); // idle | working
	let pdfMsg = $state(''); // user-visible download result / error
	let showSignup = $state(false);
	let signedUp = $state(false);
	let signup = $state({ businessName: '', personName: '', email: '', phone: '' });
	let signupState = $state('idle'); // idle | submitting
	let signupError = $state('');

	let timeouts = [];
	const clearTimers = () => {
		timeouts.forEach(clearTimeout);
		timeouts = [];
	};

	// One-time signup gate — remembered ACROSS browser sessions via localStorage.
	// Once a user has signed up (any restaurant, any time), the form never shows
	// again on this device; downloads go straight through. `signup` fields are also
	// restored so the (now-hidden) form stays prefilled.
	const SIGNUP_KEY = 'jhax_audit_signup';

	function persistSignup(details) {
		try {
			localStorage.setItem(SIGNUP_KEY, JSON.stringify({ signedUp: true, ...details }));
		} catch {
			/* storage disabled / private mode — non-fatal */
		}
	}

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(SIGNUP_KEY) || 'null');
			if (saved?.signedUp) {
				signedUp = true;
				signup.businessName = saved.businessName || '';
				signup.personName = saved.personName || '';
				signup.email = saved.email || '';
				signup.phone = saved.phone || '';
			}
		} catch {
			/* ignore malformed/blocked storage */
		}
		return () => clearTimers();
	});

	const parseQuery = (q) => {
		const cleaned = (q || '').replace(/https?:\/\/\S+/g, '').trim();
		const sep = cleaned.includes('·') ? '·' : cleaned.includes(',') ? ',' : null;
		if (sep) {
			const idx = cleaned.indexOf(sep);
			return { name: cleaned.slice(0, idx).trim(), city: cleaned.slice(idx + sep.length).trim() };
		}
		return { name: cleaned, city: '' };
	};

	async function runAudit({ name, city, display }) {
		clearTimers();
		if (display !== undefined) query = display;
		error = '';
		report = null;
		state = 'loading';
		stepIndex = 0;
		LOADING_STEPS.forEach((_, i) => {
			const t = setTimeout(() => (stepIndex = i), i * 620);
			timeouts.push(t);
		});

		try {
			const data = await runAuditRequest({ name, city });
			clearTimers();
			stepIndex = LOADING_STEPS.length - 1;
			report = buildReportFromApi(data);
			state = 'report';
		} catch (err) {
			clearTimers();
			const status = err?.status;
			let msg;
			if (status === 404) {
				msg = `We couldn't find "${name}"${city ? ` in ${city}` : ''} on Google. Check the spelling, or add the city.`;
			} else if (status === 503) {
				msg = "Live lookups aren't switched on yet — this needs a Google Places API key.";
			} else if (status === 400) {
				msg = 'Type a restaurant name to run the audit.';
			} else {
				msg = 'Something went wrong looking that up. Give it another try in a moment.';
			}
			error = msg;
			state = 'error';
		}
	}

	function submit(e) {
		e?.preventDefault?.();
		const { name, city } = parseQuery(query);
		if (!name) return;
		runAudit({ name, city });
	}

	function submitExample(ex) {
		runAudit({ name: ex.name, city: ex.city, display: ex.label });
	}

	function reset() {
		clearTimers();
		state = 'idle';
		report = null;
		error = '';
		query = '';
		pdfMsg = '';
		// Scroll back UP to the audit search section. Must go through Lenis — native
		// scrollIntoView is overridden by Lenis's RAF loop (worked neither on phone
		// nor desktop before). rAF lets the report unmount first so the target is right.
		if (typeof window !== 'undefined') {
			requestAnimationFrame(() => scrollToEl('audit', -80));
		}
	}

	const slugify = (s) =>
		(s || 'restaurant')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'restaurant';

	async function downloadPdf() {
		if (!report || pdfState === 'working') return;
		pdfState = 'working';
		pdfMsg = '';
		let holder = null;
		try {
			if (document.fonts && document.fonts.ready) {
				try {
					await document.fonts.ready;
				} catch {
					/* non-fatal */
				}
			}

			const html2pdf = (await import('html2pdf.js')).default;
			const el = buildPdfTemplate(report);

			el.querySelectorAll('*').forEach((n) => {
				n.style.opacity = '1';
				n.style.transform = 'none';
				n.style.animation = 'none';
				n.style.transition = 'none';
			});

			holder = document.createElement('div');
			holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:676px;background:#ffffff;';
			holder.appendChild(el);
			document.body.appendChild(holder);

			const dateStr = new Date().toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});

			await html2pdf()
				.set({
					margin: [64, 44, 54, 44],
					filename: `${slugify(report.name)}-jhax-audit-report.pdf`,
					image: { type: 'png' },
					html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
					jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
					pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
				})
				.from(el)
				.toPdf()
				.get('pdf', (pdf) => {
					const total = pdf.internal.getNumberOfPages();
					const pw = pdf.internal.pageSize.getWidth();
					const ph = pdf.internal.pageSize.getHeight();
					for (let i = 1; i <= total; i++) {
						pdf.setPage(i);
						pdf.setFontSize(10);
						pdf.setFont('helvetica', 'bold');
						pdf.setTextColor(232, 80, 10);
						pdf.text('JHAX', 44, 38);
						const jw = pdf.getTextWidth('JHAX');
						pdf.setFont('helvetica', 'normal');
						pdf.setTextColor(70, 70, 70);
						pdf.text(' — Free Restaurant Audit Report', 44 + jw, 38);
						pdf.setTextColor(150, 150, 150);
						pdf.text(dateStr, pw - 44, 38, { align: 'right' });
						pdf.setDrawColor(228, 224, 218);
						pdf.setLineWidth(0.5);
						pdf.line(44, 46, pw - 44, 46);

						pdf.setDrawColor(228, 224, 218);
						pdf.setLineWidth(0.5);
						pdf.line(44, ph - 36, pw - 44, ph - 36);
						pdf.setFontSize(8.5);
						pdf.setFont('helvetica', 'normal');
						pdf.setTextColor(150, 150, 150);
						pdf.text('Generated by JHAX', 44, ph - 22);
						pdf.text(`Page ${i} of ${total}`, pw - 44, ph - 22, { align: 'right' });
					}
				})
				.save();
			pdfMsg = 'Report downloaded to this device — check your downloads folder.';
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error('PDF export failed', err);
			pdfMsg = "Couldn't generate the report — please try again.";
		} finally {
			if (holder && holder.parentNode) holder.parentNode.removeChild(holder);
			pdfState = 'idle';
		}
	}

	function handleDownloadClick() {
		if (signedUp) {
			downloadPdf();
			return;
		}
		signupError = '';
		showSignup = true;
	}

	const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

	async function submitSignup(e) {
		e?.preventDefault?.();
		const businessName = signup.businessName.trim();
		const personName = signup.personName.trim();
		const email = signup.email.trim();
		const phone = signup.phone.trim();

		if (!businessName || !personName || !email) {
			signupError = 'Please fill in business name, your name, and email.';
			return;
		}
		if (!validEmail(email)) {
			signupError = 'Please enter a valid email address.';
			return;
		}
		if (phone && phone.replace(/\D/g, '').length < 7) {
			signupError = 'Please enter a valid phone number, or leave it blank.';
			return;
		}

		signupState = 'submitting';
		signupError = '';
		try {
			await saveLead({
				email,
				business_name: businessName,
				person_name: personName,
				phone: phone || null,
				source: 'audit_report_download'
			});
			signedUp = true;
			persistSignup({ businessName, personName, email, phone });
			showSignup = false;
			signupState = 'idle';
			downloadPdf();
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error('[leads] Firestore write failed:', err?.code || '', err?.message || err);
			signupState = 'idle';
			signupError = 'Something went wrong. Please try again.';
		}
	}

	let totalImpact = $derived(report ? report.moneyLost : 0);

	const signupFields = [
		{ key: 'businessName', label: 'Business name', placeholder: 'e.g. The Corner Bistro', Icon: Building2, type: 'text', testid: 'signup-business' },
		{ key: 'personName', label: 'Your name', placeholder: 'e.g. Maria Lopez', Icon: User, type: 'text', testid: 'signup-name' },
		{ key: 'email', label: 'Email', placeholder: 'you@restaurant.com', Icon: Mail, type: 'email', testid: 'signup-email' },
		{ key: 'phone', label: 'Phone (optional)', placeholder: '(555) 123-4567', Icon: Phone, type: 'tel', testid: 'signup-phone' }
	];

	const exSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	const kpiSlug = (label) => label.toLowerCase().replace(/\s+/g, '-');
</script>

<section id="audit" data-testid="free-audit-section" class="relative py-24 md:py-32">
	<div
		aria-hidden="true"
		class="absolute left-1/2 -translate-x-1/2 -top-10 w-[900px] h-[420px] blur-3xl opacity-40 pointer-events-none"
		style="background: radial-gradient(closest-side, rgba(232,80,10,0.22), transparent);"
	></div>

	<div class="relative max-w-[1180px] mx-auto px-6 md:px-10">
		<!-- Header -->
		<div class="text-center">
			<div
				class="inline-flex items-center gap-2 rounded-full font-mono uppercase tracking-[0.18em]"
				style="background: rgba(232,80,10,0.08); border: 1px solid rgba(232,80,10,0.28); color: #FF6B2B; padding: 6px 14px; font-size: 10.5px;"
			>
				Free Restaurant Audit
			</div>
			<h2
				class="font-display text-cream mt-5 mx-auto"
				style="font-size: clamp(30px, 5vw, 60px); letter-spacing: -0.035em; line-height: 1.02; max-width: 900px;"
			>
				Find out what your restaurant is losing — <span class="text-orange">for free</span>.
			</h2>
			<p
				class="mt-5 mx-auto text-muted-warm"
				style="max-width: 620px; font-size: 16px; line-height: 1.55; font-weight: 300;"
			>
				No sign-up. No credit card. Just type your restaurant name and we&apos;ll show you exactly
				where money is slipping through the cracks.
			</p>
		</div>

		<!-- Search form -->
		<form
			onsubmit={submit}
			data-testid="audit-form"
			class="mt-9 mx-auto flex flex-col sm:flex-row gap-3 max-w-[720px]"
		>
			<div
				class="flex-1 min-w-0 w-full flex items-center gap-2 rounded-full px-5"
				style="background: #0d0d0d; border: 1px solid #1E1E1E; height: 56px;"
			>
				<Search size={16} class="text-muted-warm flex-shrink-0" />
				<input
					type="text"
					bind:value={query}
					placeholder="Restaurant name and city (e.g. Joe's Pizza, New York)"
					data-testid="audit-input"
					class="flex-1 min-w-0 w-full bg-transparent outline-none text-cream placeholder:text-muted-warm"
					style="font-size: 15px; font-weight: 500;"
					disabled={state === 'loading'}
				/>
			</div>
			<button
				type="submit"
				disabled={state === 'loading' || !query.trim()}
				data-testid="audit-submit"
				class="inline-flex items-center justify-center gap-2 rounded-full px-7 font-semibold whitespace-nowrap"
				style="background: #E8500A; color: #fff; font-size: 15px; height: 56px; opacity: {state ===
					'loading' || !query.trim()
					? 0.55
					: 1}; box-shadow: 0 20px 60px -20px rgba(232,80,10,0.6); transition: opacity .2s, transform .2s;"
			>
				{#if state === 'loading'}
					<Loader2 size={16} class="animate-spin" /> Working…
				{:else}
					Get Free Report <ArrowRight size={14} />
				{/if}
			</button>
		</form>

		<!-- Example chips -->
		<div class="mt-5 flex flex-wrap justify-center gap-2" data-testid="audit-examples">
			<span class="font-mono uppercase tracking-[0.18em] text-ghost mr-1 self-center" style="font-size: 10px;">
				Or try:
			</span>
			{#each EXAMPLES as ex (ex.label)}
				<button
					type="button"
					onclick={() => submitExample(ex)}
					disabled={state === 'loading'}
					data-testid="audit-example-{exSlug(ex.name)}"
					class="rounded-full transition-colors"
					style="background: #0d0d0d; border: 1px solid #1E1E1E; color: #6B6866; padding: 8px 14px; font-size: 12.5px;"
					onmouseenter={(e) => {
						if (state !== 'loading') {
							e.currentTarget.style.borderColor = 'rgba(232,80,10,0.4)';
							e.currentTarget.style.color = '#FF6B2B';
						}
					}}
					onmouseleave={(e) => {
						e.currentTarget.style.borderColor = '#1E1E1E';
						e.currentTarget.style.color = '#6B6866';
					}}
				>
					{ex.label}
				</button>
			{/each}
		</div>

		<!-- Loading panel -->
		{#if state === 'loading'}
			<div
				in:fly={{ y: 16, duration: 450, opacity: 0, easing: cubicOut }}
				out:fly={{ y: -8, duration: 450, opacity: 0, easing: cubicOut }}
				class="mt-10 mx-auto max-w-[720px] rounded-2xl p-6 md:p-7"
				style="background: #0d0d0d; border: 1px solid #1E1E1E;"
				data-testid="audit-loading"
			>
				<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-orange mb-4">
					JHAX is looking at your restaurant…
				</div>
				<ul class="space-y-3">
					{#each LOADING_STEPS as s, i (s.label)}
						{@const isDone = i < stepIndex}
						{@const isActive = i === stepIndex}
						<li
							class="flex items-center gap-3"
							data-testid="audit-step-{i}"
							style="opacity: {isDone || isActive ? 1 : 0.35}; transition: opacity .3s;"
						>
							<span
								class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
								style="background: {isActive
									? 'rgba(232,80,10,0.14)'
									: isDone
										? 'rgba(22,163,74,0.14)'
										: '#0f0f0f'}; border: 1px solid {isActive
									? 'rgba(232,80,10,0.4)'
									: isDone
										? 'rgba(22,163,74,0.35)'
										: '#1E1E1E'}; font-size: 15px;"
							>
								{#if isDone}
									<span style="color: #22C55E; font-size: 14px;">✓</span>
								{:else if isActive}
									<Loader2 size={14} class="animate-spin" color="#FF6B2B" />
								{:else}
									<span>{s.emoji}</span>
								{/if}
							</span>
							<span
								class="text-[14.5px]"
								style="color: {isActive ? '#F5F2ED' : isDone ? '#6B6866' : '#3a3835'}; font-weight: {isActive
									? 500
									: 400};"
							>
								{s.label}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Error panel -->
		{#if state === 'error'}
			<div
				in:fly={{ y: 16, duration: 450, opacity: 0, easing: cubicOut }}
				out:fly={{ y: -8, duration: 450, opacity: 0, easing: cubicOut }}
				class="mt-10 mx-auto max-w-[720px] rounded-2xl p-6 md:p-7 flex items-start gap-4"
				style="background: #0d0d0d; border: 1px solid rgba(220,38,38,0.35);"
				data-testid="audit-error"
			>
				<div
					class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
					style="background: rgba(220,38,38,0.10); border: 1px solid rgba(220,38,38,0.35);"
				>
					<AlertTriangle size={18} color="#F87171" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="font-mono text-[10px] uppercase tracking-[0.24em] mb-1" style="color: #F87171;">
						Restaurant not found
					</div>
					<div class="text-cream text-[15px]" style="font-weight: 500; line-height: 1.3;">{error}</div>
					<button
						type="button"
						onclick={reset}
						data-testid="audit-error-retry"
						class="mt-4 inline-flex items-center gap-2 rounded-full text-[13px] font-semibold"
						style="background: #E8500A; color: #fff; padding: 10px 18px;"
					>
						Try again
					</button>
				</div>
			</div>
		{/if}

		<!-- Report -->
		{#if state === 'report' && report}
			<div
				in:fly={{ y: 24, duration: 700, opacity: 0, easing: cubicOut }}
				class="mt-10 rounded-[22px] relative overflow-hidden"
				style="background: #0c0c0c; border: 1px solid rgba(232,80,10,0.28); box-shadow: 0 40px 120px -40px rgba(232,80,10,0.35);"
				data-testid="audit-report"
			>
				<div
					aria-hidden="true"
					class="absolute top-0 left-0 right-0 h-[3px]"
					style="background: linear-gradient(90deg, transparent, #E8500A 30%, #FF6B2B 60%, transparent);"
				></div>
				<div class="p-6 md:p-8">
					<!-- Head — stacks vertically on mobile so labels never overlap and the
					     name has full width to wrap normally at word boundaries. -->
					<div
						class="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-5 sm:gap-6"
					>
						<div
							class="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5 sm:flex-1 min-w-0 sm:min-w-[260px]"
						>
							{#await import('./AuditHealthDial.svelte') then { default: AuditHealthDial }}
								<AuditHealthDial value={report.healthScore} />
							{/await}
							<div class="min-w-0 w-full">
								<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-orange">
									Free audit · Restaurant health
								</div>
								<div
									class="font-display text-cream mt-1"
									style="font-size: clamp(22px, 3vw, 34px); letter-spacing: -0.03em; line-height: 1.08; overflow-wrap: break-word;"
									data-testid="audit-report-name"
								>
									{report.name}
								</div>
								<div
									class="text-muted-warm text-[13px] mt-1"
									style="overflow-wrap: break-word;"
								>
									{report.location} · From public info only
								</div>
							</div>
						</div>

						<div class="text-left sm:text-right">
							<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-ghost">
								Estimated money lost
							</div>
							<div
								class="font-display mt-1"
								style="color: #FF6B2B; font-size: clamp(28px, 3.4vw, 40px); letter-spacing: -0.03em; line-height: 1;"
								data-testid="audit-total-impact"
							>
								${totalImpact.toLocaleString('en-US')}
							</div>
							<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-warm mt-1">
								Every week · Estimated
							</div>
						</div>
					</div>

					<!-- Estimated-data note -->
					{#if report.dataSource === 'estimated'}
						<div
							class="mt-5 flex items-start gap-3 rounded-xl p-3.5"
							style="background: rgba(232,80,10,0.06); border: 1px solid rgba(232,80,10,0.22);"
							data-testid="audit-estimated-note"
						>
							<AlertTriangle size={15} color="#FF6B2B" class="flex-shrink-0 mt-0.5" />
							<div class="text-muted-warm text-[12.5px] leading-snug">
								<span class="text-cream" style="font-weight: 500;">These numbers are estimated.</span>
								Location is real; rating and reviews are modelled from public map data. Full verified
								analysis is available once connected to Google.
							</div>
						</div>
					{/if}

					<!-- KPI pills -->
					<div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
						{#each report.kpis as k (k.label)}
							{@const Icon = k.icon}
							<div
								class="rounded-xl p-4"
								style="background: #0a0a0a; border: 1px solid #1E1E1E;"
								data-testid="audit-kpi-{kpiSlug(k.label)}"
							>
								<div class="flex items-center gap-2 mb-2">
									<Icon size={12} class="text-orange" />
									<span class="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ghost">{k.label}</span>
								</div>
								<div class="flex items-baseline gap-1">
									<span class="font-display text-cream" style="font-size: 26px; letter-spacing: -0.03em;">
										{k.value}
									</span>
									{#if k.suffix}
										<span class="font-mono text-orange" style="font-size: 12px;">{k.suffix}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					<!-- Estimate basis note -->
					{#if report.basis}
						<div class="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ghost" data-testid="audit-basis">
							{report.basis}
						</div>
					{/if}

					<!-- Findings + Reviews -->
					<div class="mt-6 grid gap-5 lg:grid-cols-[1.4fr,1fr]">
						<div class="space-y-3">
							<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-orange">
								What JHAX found
							</div>
							{#each report.findings as f, i (i)}
								{@const st = TIER_STYLES[f.tier] || TIER_STYLES.OPPORTUNITY}
								{@const Icon = st.Icon}
								<div
									in:fly={{ y: 10, duration: 500, delay: 150 + i * 80, opacity: 0, easing: cubicOut }}
									class="rounded-xl p-4 flex items-start gap-3"
									style="background: #0a0a0a; border: 1px solid {st.bd};"
									data-testid="audit-finding-{i}"
								>
									<div
										class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
										style="background: {st.bg}; border: 1px solid {st.bd};"
									>
										<Icon size={16} color={st.color} />
									</div>
									<div class="flex-1 min-w-0">
										<div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
											<span
												class="font-mono text-[9.5px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full"
												style="color: {st.color}; background: {st.bg}; border: 1px solid {st.bd};"
											>
												{f.tier}
											</span>
											{#if f.impact}
												<span
													class="font-mono text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
													style="color: {st.color}; background: {st.bg}; border: 1px solid {st.bd};"
												>
													~{f.impact}
												</span>
											{/if}
										</div>
										<div class="text-cream text-[15px]" style="font-weight: 500; line-height: 1.25;">
											{f.title}
										</div>
										<div class="text-muted-warm text-[13px] mt-1 leading-snug">{f.body}</div>
									</div>
								</div>
							{/each}
						</div>

						<!-- Reviews panel -->
						<div
							class="rounded-2xl p-5"
							style="background: #0a0a0a; border: 1px solid #1E1E1E;"
							data-testid="audit-reviews"
						>
							<div class="flex items-center justify-between mb-4">
								<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-orange">
									What people are saying
								</div>
								<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-ghost">From Google</div>
							</div>
							{#if report.reviews.length === 0}
								<div class="text-muted-warm text-[13px]">No public reviews yet.</div>
							{:else}
								<div class="space-y-3">
									{#each report.reviews.slice(0, 3) as r, i (i)}
										<div
											class="rounded-xl p-3"
											style="background: #0d0d0d; border: 1px solid #1E1E1E;"
											data-testid="audit-review-{i}"
										>
											<div class="flex items-center justify-between mb-1 gap-2">
												<span class="text-cream text-[13px] truncate" style="font-weight: 500;">
													{r.author || 'Google user'}
												</span>
												{#if r.rating != null}
													<span class="font-mono text-[11px] text-orange whitespace-nowrap">{r.rating}★</span>
												{/if}
											</div>
											{#if r.text}
												<div
													class="text-muted-warm text-[12.5px] leading-snug"
													style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;"
												>
													{r.text}
												</div>
											{/if}
											{#if r.relative_time}
												<div class="font-mono text-[10px] uppercase tracking-[0.16em] text-ghost mt-1.5">
													{r.relative_time}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<!-- Bottom CTA -->
					<div
						class="mt-7 rounded-2xl p-5 md:p-6 flex flex-wrap items-center justify-between gap-4"
						style="background: linear-gradient(90deg, rgba(232,80,10,0.08), rgba(232,80,10,0.02)); border: 1px solid rgba(232,80,10,0.35);"
						data-testid="audit-cta"
					>
						<div class="flex-1 min-w-[240px]">
							<div class="text-cream font-display" style="font-size: 20px; letter-spacing: -0.02em; line-height: 1.2;">
								This is only what we can see from the outside.
							</div>
							<div class="text-muted-warm text-[14px] mt-1.5">
								Plug in your Square and JHAX shows you the money you&apos;re losing
								<em style="font-style: italic; color: #F5F2ED;">inside</em> your restaurant too — every
								regular, every shift, every dish.
							</div>
						</div>
						<div class="flex flex-col sm:flex-row flex-wrap gap-2.5 w-full sm:w-auto">
							<button
								type="button"
								onclick={handleDownloadClick}
								disabled={pdfState === 'working'}
								data-testid="audit-download"
								data-html2canvas-ignore="true"
								class="inline-flex items-center justify-center gap-2 rounded-full text-[13px] font-semibold w-full sm:w-auto"
								style="background: #0a0a0a; border: 1px solid rgba(232,80,10,0.45); color: #FF6B2B; padding: 12px 18px; opacity: {pdfState ===
									'working'
									? 0.6
									: 1};"
							>
								{#if pdfState === 'working'}
									<Loader2 size={14} class="animate-spin" /> Preparing…
								{:else}
									<Download size={14} /> Download report
								{/if}
							</button>
							<button
								type="button"
								onclick={reset}
								data-testid="audit-run-another"
								class="rounded-full text-[13px] w-full sm:w-auto text-center"
								style="background: #0a0a0a; border: 1px solid #1E1E1E; color: #6B6866; padding: 12px 18px;"
							>
								Run another
							</button>
							<a
								href="#book-demo"
								data-testid="audit-cta-book"
								class="inline-flex items-center justify-center gap-2 rounded-full text-[14px] font-semibold w-full sm:w-auto"
								style="background: #E8500A; color: #fff; padding: 12px 22px; box-shadow: 0 16px 40px -14px rgba(232,80,10,0.6);"
							>
								Connect your Square <ArrowRight size={14} />
							</a>
						</div>
						{#if pdfMsg}
							<div
								class="basis-full font-mono text-[11px] uppercase tracking-[0.16em] mt-1"
								style="color: {pdfMsg.startsWith('Couldn') ? '#F87171' : '#22C55E'};"
								data-testid="audit-pdf-msg"
							>
								{pdfMsg}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Idle helper strip -->
		{#if state === 'idle'}
			<div
				class="mt-8 flex items-center justify-center gap-6 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ghost"
			>
				<span>Uses only public info</span>
				<span>·</span>
				<span>Instant results</span>
				<span>·</span>
				<span>Real Google data</span>
			</div>
		{/if}
	</div>

	<!-- Signup gate before report download -->
	{#if showSignup}
		<div
			class="fixed inset-0 z-[60] flex items-center justify-center p-4"
			style="background: rgba(4,4,4,0.72); backdrop-filter: blur(4px);"
			transition:fade={{ duration: 250 }}
			onclick={() => signupState !== 'submitting' && (showSignup = false)}
			onkeydown={(e) => e.key === 'Escape' && signupState !== 'submitting' && (showSignup = false)}
			role="button"
			tabindex="-1"
			data-testid="audit-signup-overlay"
		>
			<div
				class="w-full max-w-[440px] rounded-[20px] relative overflow-hidden"
				style="background: #0d0d0d; border: 1px solid rgba(232,80,10,0.3); box-shadow: 0 40px 120px -40px rgba(232,80,10,0.45);"
				in:fly={{ y: 18, duration: 350, opacity: 0, easing: cubicOut }}
				out:fly={{ y: 10, duration: 350, opacity: 0, easing: cubicOut }}
				onclick={(e) => e.stopPropagation()}
				onkeydown={() => {}}
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				data-testid="audit-signup-modal"
			>
				<div
					aria-hidden="true"
					class="absolute top-0 left-0 right-0 h-[3px]"
					style="background: linear-gradient(90deg, transparent, #E8500A 30%, #FF6B2B 60%, transparent);"
				></div>
				<div class="p-6 md:p-7">
					<button
						type="button"
						onclick={() => signupState !== 'submitting' && (showSignup = false)}
						data-testid="audit-signup-close"
						class="absolute top-4 right-4 flex items-center justify-center rounded-full"
						style="width: 30px; height: 30px; background: #0a0a0a; border: 1px solid #1E1E1E; color: #6B6866;"
					>
						<X size={15} />
					</button>

					<div class="font-mono text-[10px] uppercase tracking-[0.24em] text-orange">One quick step</div>
					<h3 class="font-display text-cream mt-2" style="font-size: 24px; letter-spacing: -0.02em; line-height: 1.15;">
						Get your full report
					</h3>
					<p class="text-muted-warm text-[13.5px] mt-2" style="line-height: 1.5;">
						Enter your details and your full PDF report downloads to this device right away.
					</p>

					<form onsubmit={submitSignup} class="mt-5 space-y-3" data-testid="audit-signup-form">
						{#each signupFields as field (field.key)}
							{@const Icon = field.Icon}
							<div>
								<label class="font-mono text-[9px] uppercase tracking-[0.18em] text-ghost" for="audit-{field.testid}">
									{field.label}
								</label>
								<div
									class="flex items-center gap-2 mt-1 rounded-lg px-3 min-w-0"
									style="background: #0a0a0a; border: 1px solid #1E1E1E; height: 44px;"
								>
									<Icon size={14} class="text-muted-warm flex-shrink-0" />
									<input
										id="audit-{field.testid}"
										type={field.type}
										value={signup[field.key]}
										oninput={(e) => (signup[field.key] = e.currentTarget.value)}
										placeholder={field.placeholder}
										disabled={signupState === 'submitting'}
										data-testid="audit-{field.testid}"
										class="flex-1 min-w-0 w-full bg-transparent outline-none text-cream placeholder:text-muted-warm"
										style="font-size: 14px;"
									/>
								</div>
							</div>
						{/each}

						{#if signupError}
							<div class="text-[12.5px] flex items-center gap-2" style="color: #F87171;" data-testid="audit-signup-error">
								<AlertTriangle size={13} /> {signupError}
							</div>
						{/if}

						<button
							type="submit"
							disabled={signupState === 'submitting'}
							data-testid="audit-signup-submit"
							class="w-full inline-flex items-center justify-center gap-2 rounded-full font-semibold mt-1"
							style="background: #E8500A; color: #fff; height: 48px; font-size: 15px; opacity: {signupState ===
								'submitting'
								? 0.6
								: 1}; box-shadow: 0 16px 40px -14px rgba(232,80,10,0.6);"
						>
							{#if signupState === 'submitting'}
								<Loader2 size={15} class="animate-spin" /> Preparing your report…
							{:else}
								Download my report <Download size={15} />
							{/if}
						</button>
						<div class="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ghost text-center">
							No spam · Only about your audit
						</div>
					</form>
				</div>
			</div>
		</div>
	{/if}
</section>
