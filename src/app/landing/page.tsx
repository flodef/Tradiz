'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { sendContactEmail } from '@/app/actions/email';
import {
    IconToolsKitchen2,
    IconSun,
    IconMoon,
    IconDeviceDesktop,
    IconDeviceTablet,
    IconDeviceMobile,
    IconArrowRight,
    IconChevronDown,
    IconMail,
    IconRocket,
    IconCode,
    IconHeart,
    IconShieldCheck,
    IconPalette,
    IconPlugConnected,
    IconReceipt,
    IconBolt,
    IconDevices2,
    IconCircleCheck,
    IconSend,
    IconMenu2,
    IconX,
    IconSparkles,
    IconExternalLink,
} from '@tabler/icons-react';
import { useTheme, type ThemeMode } from '../site/theme';

/* ─────────────────────────── Content ─────────────────────────── */

const NAV_LINKS = [
    { label: 'Mission', href: '#mission' },
    { label: 'Promesses', href: '#promesses' },
    { label: 'Le logiciel', href: '#logiciel' },
    { label: 'Tarifs', href: '#tarifs' },
    { label: 'Équipe', href: '#equipe' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Contact', href: '#contact' },
];

const PROMISES = [
    {
        icon: IconPalette,
        title: 'Sur mesure',
        text: 'Un logiciel sur mesure, intuitif et qui évolue avec vos besoins, facile à prendre en main en quelques clics. Tout cela en restant aux normes en vigueur.',
    },
    {
        icon: IconHeart,
        title: 'Personnalisation',
        text: "Nous vous accompagnons tout au long du processus d'installation et d'utilisation du logiciel, afin de rendre votre expérience agréable.",
    },
    {
        icon: IconPlugConnected,
        title: 'Indépendance',
        text: "Vous avez le libre choix de vos outils connexes (terminal de paiement, affichage, mobile). Nous nous adaptons à votre façon de travailler et non l'inverse.",
    },
    {
        icon: IconReceipt,
        title: 'Facturation',
        text: "Une facturation innovante adaptable aux fluctuations de l'activité, sans abonnement et sans engagement. Hors-saison, fermeture pour congés, baisse du chiffre d'affaires ? Vous payez seulement en fonction de votre activité !",
    },
];

const FEATURES = [
    {
        icon: IconBolt,
        title: "Simplicité d'utilisation",
        text: 'Une interface conviviale et intuitive qui vous permet de gérer vos transactions en quelques clics. Prise en main immédiate, sans formation.',
    },
    {
        icon: IconPalette,
        title: 'Personnalisation totale',
        text: 'Adaptez Tradiz à votre style et à vos besoins spécifiques : couleurs, catégories, produits, tarifs, options. Vous êtes aux commandes !',
    },
    {
        icon: IconDevices2,
        title: 'Multi-appareils',
        text: "Fonctionne sur PC, tablette, smartphone, et même votre ancien POS. Choisissez l'équipement qui vous convient, nous nous adaptons à votre matériel.",
    },
    {
        icon: IconShieldCheck,
        title: 'Certifié NF525',
        text: 'Tradiz est conforme à la norme NF525 et aux obligations légales françaises. Attestation de conformité fournie. Mises à jour de sécurité régulières.',
    },
    {
        icon: IconReceipt,
        title: 'Gestion multi-caisses',
        text: 'Plusieurs caisses simultanées, synchronisées en temps réel. Idéal pour les commerces avec plusieurs points de vente ou plusieurs employés.',
    },
    {
        icon: IconPlugConnected,
        title: 'Fonctionne hors-ligne',
        text: "Utilisation indépendante d'internet. Vos transactions sont enregistrées localement et synchronisées sur le Cloud dès que la connexion revient.",
    },
    {
        icon: IconCode,
        title: 'Sans installation',
        text: 'Le logiciel démarre instantanément et se met à jour automatiquement. Aucune installation complexe, aucune maintenance de votre côté.',
    },
    {
        icon: IconHeart,
        title: 'Support inclus',
        text: "Un support technique disponible 6 jours sur 7. Nous vous accompagnons à chaque étape, de l'installation à l'utilisation au quotidien.",
    },
];

const CONTACT_SUBJECTS = [
    { value: 'forfait-decouverte', label: 'Forfait Découverte (30€)' },
    { value: 'forfait-pro', label: 'Forfait Pro (50€)' },
    { value: 'forfait-privilege', label: 'Forfait Privilège (100€)' },
    { value: 'demande-renseignement', label: 'Demande de renseignement' },
    { value: 'demo', label: 'Demande de démo' },
    { value: 'candidature', label: 'Candidature' },
];

const TOOLTIP_TEXTS: Record<string, string> = {
    'Personnalisation avancée':
        'Adaptation du logiciel à vos besoins spécifiques (workflows, champs personnalisés, écrans sur mesure)',
    'Formation en visio': 'Sessions de formation personnalisées en visioconférence avec notre équipe',
    'Onboarding personnalisé': 'Accompagnement dédié pour la mise en place et la formation de votre équipe',
    'Assistance dédiée': 'Un interlocuteur unique dédié à votre compte, joignable directement',
    'SLA garanti': 'Service Level Agreement : garantie de disponibilité et de temps de réponse',
    'Mises à jour illimitées': 'Toutes les nouvelles fonctionnalités et améliorations incluses sans surcoût',
    'Caisses illimitées': 'Connectez autant de caisses que nécessaire, sans surcoût — idéal pour les multi-sites',
    'Gestion des entreprises': 'Suivi des clients professionnels (B2B), entreprise, SIRET et tarification dédiée',
    'Quote part employeur': 'Gestion de la quote-part employeur pour les titres-restaurant et avantages en nature',
};

const PRICING_PLANS = [
    {
        id: 'decouverte',
        name: 'Découverte',
        monthlyPrice: 30,
        annualPrice: 300,
        desc: 'Pour les petits commerces qui démarrent',
        features: [
            '1 caisse',
            "Jusqu'à 50 produits",
            'Gestion du stock',
            'Tickets de caisse',
            'Mises à jour incluses',
            'Support par email (48h)',
        ],
        highlighted: false,
        badge: null as string | null,
    },
    {
        id: 'pro',
        name: 'Pro',
        monthlyPrice: 50,
        annualPrice: 500,
        desc: 'Pour les commerces en croissance',
        features: [
            'Tout le plan Découverte',
            '2 caisses synchronisées',
            'Produits illimités',
            'Multi-devises',
            'Gestion des clients',
            'Statistiques & rapports',
            'Site de réservation en ligne',
            'Support prioritaire (24h)',
        ],
        highlighted: true,
        badge: 'LE PLUS POPULAIRE',
    },
    {
        id: 'privilege',
        name: 'Privilège',
        monthlyPrice: 100,
        annualPrice: 1000,
        desc: 'Pour les commerces exigeants',
        features: [
            'Tout le plan Pro',
            'Caisses illimitées',
            'Gestion des entreprises',
            'Quote part employeur',
            'Personnalisation avancée',
            'Formation en visio',
            'Onboarding personnalisé',
            'Assistance dédiée',
            'SLA garanti',
        ],
        highlighted: false,
        badge: 'VIP',
    },
];

const FAQ_ITEMS = [
    {
        q: "Qu'est-ce que Tradiz ? Et pourquoi passer à votre proposition ?",
        a: "Tradiz est un logiciel de caisse moderne, sur mesure et aux normes, conçu pour les petites entreprises. Contrairement aux solutions standards du marché, il s'adapte à votre façon de travailler et non l'inverse. Interface intuitive, facturation à l'usage, sans engagement.",
    },
    {
        q: 'Quel est le modèle de facturation ?',
        a: "Tradiz fonctionne sans abonnement ni engagement. La facturation se fait à chaque transaction effectuée, en fin de mois. Pas de transaction, pas de facturation. C'est idéal pour les activités saisonnières ou les périodes de fermeture.",
    },
    {
        q: "J'ai déjà une solution d'encaissement, comment puis-je passer à votre solution ? Qui m'accompagne et comment ?",
        a: 'Nous vous accompagnons tout au long de la transition : migration de vos données, configuration du logiciel, formation de votre équipe. Un support dédié est disponible 6 jours sur 7 pour répondre à toutes vos questions.',
    },
    {
        q: 'Tradiz est-ce une solution, un logiciel ou une application ?',
        a: "Tradiz est un logiciel de caisse qui fonctionne comme une application web : il s'ouvre dans un navigateur sur PC, tablette ou smartphone, sans installation. Il peut aussi être encapsulé dans une application de bureau pour un démarrage instantané.",
    },
    {
        q: "Je ne veux pas m'engager, ou j'ai une activité saisonnière. Comment puis-je intégrer votre solution ?",
        a: "Soyez rassuré, Tradiz est un logiciel sans engagement. La facturation ne se fait qu'à chaque transaction effectuée et en fin de mois. Donc en fin d'activité si aucune transaction, pas de facturation. C'est parfaitement adapté pour vous qui êtes saisonnier.",
    },
    {
        q: 'Comment installer votre logiciel dans mon système et de quoi ai-je besoin ?',
        a: 'Notre logiciel de caisse fonctionne sans installation, démarre instantanément et se met à jour automatiquement. Et ce, sur tous les appareils, pour une prise en main rapide pour les employés.',
    },
    {
        q: 'Votre logiciel est-il sécurisé ?',
        a: 'Tradiz est conforme à la norme NF525 et aux obligations légales françaises concernant les logiciels de caisse. Nous pouvons vous fournir une attestation de conformité. Des mises à jour régulières sont déployées pour garantir la sécurité. Un support technique est disponible 6 jours sur 7.',
    },
    {
        q: 'Ce logiciel est-il certifié NF525 ?',
        a: "Oui, Tradiz est conforme à la norme NF525, qui est la norme française de certification des logiciels de caisse. Cette conformité garantit l'inviolabilité des transactions, la conservation des données et le respect des obligations légales. Une attestation de conformité vous est fournie.",
    },
    {
        q: "Existe-t-il une version de base de Tradiz pour pouvoir l'utiliser gratuitement ?",
        a: "Vous pouvez tester Tradiz gratuitement et sans engagement via notre démo en ligne sur demo.tradiz.fr. Pour l'utilisation en production, la facturation se fait à la transaction — vous ne payez que ce que vous utilisez.",
    },
    {
        q: 'Comment mettre fin à mon engagement en cas de mécontentement ?',
        a: "Tradiz est sans engagement. Vous pouvez arrêter à tout moment, sans frais ni pénalité. Comme la facturation se fait à la transaction, il vous suffit de cesser d'utiliser le logiciel.",
    },
    {
        q: 'Combien coûte Tradiz ? Et que comprend ce coût ?',
        a: 'Tradiz propose 3 forfaits : Découverte (30€/mois) pour les petits commerces, Pro (50€/mois) pour les commerces en croissance avec multi-caisses, et Privilège (100€/mois) pour les commerces exigeants avec support dédié. La facturation se fait à la transaction, sans engagement.',
    },
    {
        q: 'Quels sont les avantages et les inconvénients de votre logiciel ?',
        a: "Avantages : interface intuitive, utilisation indépendante d'internet (en attente de synchronisation sur le Cloud), logiciel rapide, gestion multi-caisses, possibilité d'utilisation sur tablette, smartphone ou PC. Nous vous laissons le choix de votre caisse en fonction de votre besoin. Inconvénient : étant un logiciel jeune, certaines fonctionnalités avancées spécifiques peuvent nécessiter un développement sur mesure.",
    },
    {
        q: 'Comment le logiciel comptabilise-t-il les erreurs de caisse ?',
        a: "Tradiz enregistre toutes les transactions et garde un historique complet. Les écarts de caisse sont détectés et reportés dans les rapports de clôture journalière. L'attestation NF525 garantit l'inviolabilité de ces données.",
    },
    {
        q: 'Le paiement peut-il se réaliser par QR code ?',
        a: 'Tradiz supporte les paiements par carte bancaire, espèces et chèque. Le paiement par QR code est une fonctionnalité en cours de développement et sera disponible prochainement.',
    },
    {
        q: "Je n'ai pas de matériel, pouvez-vous m'aider ?",
        a: "Oui, nous pouvons nous occuper de tout. Si vous n'avez pas de matériel, nous vous recommandons les équipements adaptés à votre activité et à votre budget. Nous proposons des solutions complètes : TPE (terminal de paiement), imprimantes thermiques, écrans de caisse, tiroirs-caisses, et postes complets prêts à l'emploi. Nous nous chargeons de l'installation et de la configuration.",
    },
    {
        q: 'Quel matériel est compatible avec Tradiz ?',
        a: "Tradiz est compatible avec la plupart des TPE du marché (Ingenico, Verifone, Pax), des imprimantes thermiques ESC/POS (Epson, Star, Bixolon), des tiroirs-caisses RJ11, et des écrans de caisse tactiles. Si vous avez déjà du matériel, il y a de fortes chances qu'il fonctionne. Si vous partez de zéro, nous vous accompagnons dans le choix et l'achat.",
    },
];

/* ─────────────────────── Fade-in on scroll hook ─────────────────────── */

function useFadeIn<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.15 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return { ref, visible };
}

/* ─────────────────────────── ThemeToggle ─────────────────────────── */

function LandingThemeToggle({ mode, set }: { mode: ThemeMode; set: (m: ThemeMode) => void }) {
    const options: { value: ThemeMode; icon: typeof IconSun; label: string }[] = [
        { value: 'light', icon: IconSun, label: 'Clair' },
        { value: 'dark', icon: IconMoon, label: 'Sombre' },
    ];
    return (
        <div className="inline-flex items-center gap-0.5 rounded-full p-0.5 bg-site-surface-hover border border-site-border shrink-0">
            <button
                type="button"
                onClick={() => set('system')}
                title="Système"
                aria-label="Système"
                aria-checked={mode === 'system'}
                role="radio"
                className={`rounded-full flex items-center justify-center transition-all p-1.5 cursor-pointer ${mode === 'system' ? 'bg-orange-500 text-white shadow-sm' : 'text-site-text-muted hover:text-site-text'}`}
            >
                <IconDeviceDesktop size={16} className="hidden lg:block" />
                <IconDeviceTablet size={16} className="hidden md:block lg:hidden" />
                <IconDeviceMobile size={16} className="block md:hidden" />
            </button>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => set(opt.value)}
                    title={opt.label}
                    aria-label={opt.label}
                    aria-checked={mode === opt.value}
                    role="radio"
                    className={`rounded-full flex items-center justify-center transition-all p-1.5 cursor-pointer ${mode === opt.value ? 'bg-orange-500 text-white shadow-sm' : 'text-site-text-muted hover:text-site-text'}`}
                >
                    <opt.icon size={16} />
                </button>
            ))}
        </div>
    );
}

/* ─────────────────────────── Header ─────────────────────────── */

function Header({ themeMode, setTheme }: { themeMode: ThemeMode; setTheme: (m: ThemeMode) => void }) {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                scrolled
                    ? 'bg-site-nav-bg backdrop-blur-xl border-b border-site-border shadow-sm'
                    : 'bg-transparent border-b border-transparent'
            }`}
        >
            <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
                <a href="#hero" className="flex items-center gap-2.5 group">
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                        <IconToolsKitchen2 size={20} className="text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-site-text">Tradiz</span>
                </a>

                <nav className="hidden md:flex items-center gap-1">
                    {NAV_LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="px-3 py-2 text-sm font-medium text-site-text-secondary hover:text-site-text transition-colors rounded-lg hover:bg-site-surface-hover"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-3">
                    <LandingThemeToggle mode={themeMode} set={setTheme} />
                    <a
                        href="https://demo.tradiz.fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all"
                    >
                        Tester
                        <IconArrowRight size={15} />
                    </a>
                    <button
                        type="button"
                        onClick={() => setMobileOpen((v) => !v)}
                        className="md:hidden p-2 text-site-text rounded-lg hover:bg-site-surface-hover"
                        aria-label="Menu"
                    >
                        {mobileOpen ? <IconX size={22} /> : <IconMenu2 size={22} />}
                    </button>
                </div>
            </div>

            {mobileOpen && (
                <nav className="md:hidden bg-site-nav-bg backdrop-blur-xl border-b border-site-border px-4 py-3 flex flex-col gap-1">
                    {NAV_LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            onClick={() => setMobileOpen(false)}
                            className="px-3 py-2.5 text-sm font-medium text-site-text-secondary hover:text-site-text hover:bg-site-surface-hover rounded-lg transition-colors"
                        >
                            {link.label}
                        </a>
                    ))}
                    <a
                        href="https://demo.tradiz.fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 px-4 py-2.5 text-sm font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 rounded-full text-center"
                    >
                        Tester le logiciel
                    </a>
                </nav>
            )}
        </header>
    );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero() {
    return (
        <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
            {/* Gradient background */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-linear-to-b from-orange-50/50 via-site-bg to-site-bg site-dark:from-orange-950/20 site-dark:via-site-bg site-dark:to-site-bg" />
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-150 h-150 bg-orange-400/10 rounded-full blur-3xl" />
            </div>

            <div className="max-w-5xl mx-auto px-4 md:px-6 text-center py-20">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-sm font-medium mb-8 animate-[display_0.6s_ease-out]">
                    <IconBolt size={15} />
                    Le logiciel de caisse qui s'adapte à vous
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-site-text leading-[1.05] animate-[display_0.8s_ease-out]">
                    Votre allié pour des
                    <br />
                    <span className="bg-linear-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">
                        transactions fluides
                    </span>
                    <br />
                    et des clients satisfaits.
                </h1>

                <p className="mt-8 text-lg md:text-xl text-site-text-secondary max-w-2xl mx-auto animate-[display_1s_ease-out]">
                    Un logiciel de caisse sur mesure, intuitif et aux normes. Pensé pour les petites entreprises qui
                    veulent se concentrer sur l'essentiel.
                </p>

                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-[display_1.2s_ease-out]">
                    <a
                        href="https://demo.tradiz.fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                    >
                        Tester le logiciel
                        <IconArrowRight size={18} />
                    </a>
                    <a
                        href="#mission"
                        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-site-text bg-site-surface border border-site-border rounded-full hover:bg-site-surface-hover transition-all"
                    >
                        Découvrir
                        <IconChevronDown size={18} />
                    </a>
                </div>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
                <IconChevronDown size={28} className="text-site-text-muted" />
            </div>
        </section>
    );
}

/* ─────────────────────────── Section wrapper ─────────────────────────── */

function Section({ id, children, className = '' }: { id: string; children: React.ReactNode; className?: string }) {
    return (
        <section id={id} className={`max-w-7xl mx-auto px-4 md:px-6 py-20 md:py-32 ${className}`}>
            {children}
        </section>
    );
}

/* ─────────────────────────── Mission ─────────────────────────── */

function Mission() {
    const { ref, visible } = useFadeIn();
    return (
        <Section id="mission">
            <div
                ref={ref}
                className={`max-w-3xl mx-auto text-center transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text mb-8">Notre mission</h2>
                <p className="text-lg md:text-xl text-site-text-secondary leading-relaxed">
                    Notre mission avec Tradiz est de rendre accessible la gestion des transactions pour les petites
                    entreprises en offrant un logiciel sur mesure, intuitif, efficace et aux normes actuelles. Nous nous
                    engageons à vous faciliter le processus de paiement, en vous fournissant des outils innovants,
                    simples d'accès afin que vous puissiez vous concentrer sur votre cœur de métier et satisfaire
                    pleinement votre clientèle. Avec Tradiz, nous visons à créer un environnement où chaque transaction
                    est fluide, chaque interaction est positive, et chaque entreprise peut prospérer.
                </p>
            </div>
        </Section>
    );
}

/* ─────────────────────────── Promises ─────────────────────────── */

function Promises() {
    const { ref, visible } = useFadeIn();
    return (
        <Section id="promesses">
            <div
                ref={ref}
                className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text">Nos promesses</h2>
                <p className="mt-4 text-lg text-site-text-secondary">Quatre engagements qui nous définissent.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {PROMISES.map((promise, i) => {
                    const Icon = promise.icon;
                    return <PromiseCard key={promise.title} promise={promise} icon={Icon} index={i} />;
                })}
            </div>
        </Section>
    );
}

function PromiseCard({
    promise,
    icon: Icon,
    index,
}: {
    promise: { title: string; text: string };
    icon: typeof IconHeart;
    index: number;
}) {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`group relative p-8 rounded-3xl bg-site-surface border border-site-border shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
            style={{ transitionDelay: `${index * 100}ms` }}
        >
            <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-orange-500/10 to-amber-500/10 flex items-center justify-center mb-6 group-hover:from-orange-500/20 group-hover:to-amber-500/20 transition-colors">
                <Icon size={28} className="text-orange-500" />
            </div>
            <h3 className="text-xl font-bold text-site-text mb-2">
                Engagement n°{index + 1} : {promise.title}
            </h3>
            <p className="text-site-text-secondary leading-relaxed">{promise.text}</p>
        </div>
    );
}

/* ─────────────────────────── Software ─────────────────────────── */

function Software() {
    const { ref, visible } = useFadeIn();
    return (
        <Section id="logiciel">
            <div
                ref={ref}
                className={`max-w-3xl mx-auto text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text">Le logiciel</h2>
                <p className="mt-4 text-lg text-site-text-secondary">
                    Un produit qui s'adapte à vos besoins et non l'inverse.
                </p>
            </div>

            {/* Features grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
                {FEATURES.map((feature, i) => {
                    const Icon = feature.icon;
                    return <FeatureCard key={feature.title} feature={feature} icon={Icon} index={i} />;
                })}
            </div>

            {/* CTA */}
            <div className="mt-16 text-center">
                <p className="text-xl font-semibold text-site-text mb-2">Une image vaut mille mots</p>
                <p className="text-site-text-secondary mb-8">
                    Exemple d'intégration pour une boulangerie / épicerie / salon de thé
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <a
                        href="https://demo.tradiz.fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                    >
                        Tester par moi-même
                        <IconArrowRight size={18} />
                    </a>
                    <a
                        href="#contact"
                        onClick={(e) => {
                            e.preventDefault();
                            window.dispatchEvent(new CustomEvent('contactSubject', { detail: 'demo' }));
                            document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-site-text bg-site-surface border border-site-border rounded-full hover:bg-site-surface-hover transition-all"
                    >
                        Tester avec quelqu'un
                    </a>
                </div>
            </div>
        </Section>
    );
}

function FeatureCard({
    feature,
    icon: Icon,
    index,
}: {
    feature: { title: string; text: string };
    icon: typeof IconBolt;
    index: number;
}) {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`p-6 rounded-2xl bg-site-surface border border-site-border shadow-sm hover:shadow-md transition-all duration-500 hover:-translate-y-1 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
            style={{ transitionDelay: `${index * 80}ms` }}
        >
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Icon size={24} className="text-orange-500" />
            </div>
            <h4 className="text-lg font-bold text-site-text mb-2">{feature.title}</h4>
            <p className="text-sm text-site-text-secondary leading-relaxed">{feature.text}</p>
        </div>
    );
}

/* ─────────────────────────── Pricing ─────────────────────────── */

function Pricing() {
    const { ref, visible } = useFadeIn();
    const [annual, setAnnual] = useState(false);
    const [revolutConfigured, setRevolutConfigured] = useState<boolean | null>(null);

    useEffect(() => {
        fetch('/api/revolut-config')
            .then((r) => r.json())
            .then((d) => setRevolutConfigured(d.configured))
            .catch(() => setRevolutConfigured(false));
    }, []);
    return (
        <Section id="tarifs">
            <div
                ref={ref}
                className={`text-center mb-12 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text">
                    Des tarifs{' '}
                    <span className="bg-linear-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                        adaptés
                    </span>
                </h2>
                <p className="mt-4 text-lg text-site-text-secondary">
                    Choisissez la formule qui vous correspond. Sans engagement.
                </p>

                {/* Monthly / Annual toggle */}
                <div className="inline-flex items-center gap-4 rounded-full p-1.5 mt-8 bg-site-surface-hover border border-site-border">
                    <button
                        type="button"
                        onClick={() => setAnnual(false)}
                        className={`px-6 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                            !annual
                                ? 'bg-linear-to-r from-orange-500 to-amber-600 text-white'
                                : 'text-site-text-muted hover:text-site-text'
                        }`}
                    >
                        Mensuel
                    </button>
                    <button
                        type="button"
                        onClick={() => setAnnual(true)}
                        className={`px-6 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                            annual
                                ? 'bg-linear-to-r from-orange-500 to-amber-600 text-white'
                                : 'text-site-text-muted hover:text-site-text'
                        }`}
                    >
                        Annuel
                        <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                                annual ? 'bg-white/20 text-white' : 'bg-orange-500/20 text-orange-500'
                            }`}
                        >
                            2 mois offerts
                        </span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {PRICING_PLANS.map((plan, i) => (
                    <PricingCard
                        key={plan.id}
                        plan={plan}
                        index={i}
                        annual={annual}
                        revolutConfigured={revolutConfigured}
                    />
                ))}
            </div>

            <p className="mt-8 text-center text-sm text-site-text-muted">
                La facturation se fait à la transaction. Pas d'abonnement, pas d'engagement.
            </p>
        </Section>
    );
}

function PricingCard({
    plan,
    index,
    annual,
    revolutConfigured,
}: {
    plan: (typeof PRICING_PLANS)[number];
    index: number;
    annual: boolean;
    revolutConfigured: boolean | null;
}) {
    const { ref, visible } = useFadeIn();
    const [openTooltip, setOpenTooltip] = useState<string | null>(null);
    const price = annual ? plan.annualPrice : plan.monthlyPrice;

    useEffect(() => {
        if (!openTooltip) return;
        const handler = () => setOpenTooltip(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openTooltip]);

    const handleContact = (e: React.MouseEvent, subject: string) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('contactSubject', { detail: subject }));
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div
            ref={ref}
            className={`relative p-8 rounded-3xl bg-site-surface border shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1 flex flex-col ${
                plan.highlighted ? 'border-orange-500/40 border-2' : 'border-site-border'
            } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: `${index * 100}ms` }}
        >
            {plan.badge && (
                <div
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-white text-xs font-bold ${
                        plan.badge === 'VIP'
                            ? 'bg-linear-to-r from-amber-500 to-yellow-500'
                            : 'bg-linear-to-r from-orange-500 to-amber-600'
                    }`}
                >
                    {plan.badge}
                </div>
            )}
            <h3 className="text-xl font-bold text-site-text mb-2">{plan.name}</h3>
            <p className="text-sm text-site-text-muted mb-4">{plan.desc}</p>
            <div className="mb-1">
                <span className="text-4xl font-extrabold bg-linear-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                    {price}€
                </span>
                <span className="text-site-text-muted text-sm ml-1">{annual ? '/ an' : '/ mois'}</span>
            </div>
            {annual && (
                <p className="text-xs text-orange-500 mb-4">
                    Soit {Math.round(plan.annualPrice / 12)}€/mois — 2 mois offerts
                </p>
            )}
            {!annual && <div className="mb-4" />}
            <div className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, j) => {
                    const tooltip = TOOLTIP_TEXTS[feature];
                    return (
                        <div key={j} className="flex items-center gap-2">
                            <IconCircleCheck size={18} className="text-orange-500 shrink-0" />
                            {tooltip ? (
                                <span className="text-sm text-site-text-secondary flex items-center gap-1">
                                    {feature}
                                    <span
                                        className="relative"
                                        onMouseEnter={() => setOpenTooltip(feature)}
                                        onMouseLeave={() => setOpenTooltip(null)}
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenTooltip(openTooltip === feature ? null : feature);
                                            }}
                                            className="cursor-pointer"
                                        >
                                            <IconSparkles
                                                size={14}
                                                className="text-site-text-muted hover:text-orange-500"
                                            />
                                        </button>
                                        {openTooltip === feature && (
                                            <span
                                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs text-site-text max-w-50 w-max z-50 bg-site-surface border border-site-border shadow-lg"
                                                onClick={() => setOpenTooltip(null)}
                                            >
                                                {tooltip}
                                            </span>
                                        )}
                                    </span>
                                </span>
                            ) : (
                                <span className="text-sm text-site-text-secondary">{feature}</span>
                            )}
                        </div>
                    );
                })}
            </div>
            <a
                href={
                    revolutConfigured
                        ? `/checkout?plan=${plan.id}&billing=${annual ? 'annual' : 'monthly'}`
                        : '#contact'
                }
                onClick={(e) => {
                    if (revolutConfigured) return;
                    e.preventDefault();
                    handleContact(e, `forfait-${plan.id}`);
                }}
                className={`block text-center py-3 rounded-full font-semibold transition-all ${
                    plan.highlighted
                        ? 'bg-linear-to-r from-orange-500 to-amber-600 text-white hover:scale-105'
                        : 'bg-site-surface-hover text-site-text border border-site-border hover:bg-site-border'
                }`}
            >
                Choisir {plan.name}
            </a>
            <a
                href="#contact"
                onClick={(e) => handleContact(e, `forfait-${plan.id}`)}
                className="block text-center text-xs text-site-text-muted hover:text-orange-500 transition-colors mt-3"
            >
                Ou nous contacter
            </a>
        </div>
    );
}

/* ─────────────────────────── Team ─────────────────────────── */

function Team() {
    const { ref, visible } = useFadeIn();
    return (
        <Section id="equipe">
            <div
                ref={ref}
                className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text">L'équipe</h2>
                <p className="mt-4 text-lg text-site-text-secondary">Tradiz, c'est avant tout une aventure humaine.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:gap-8 max-w-2xl mx-auto mb-12">
                <TeamCard
                    name="Flojito"
                    role="Le gourou du développement technique"
                    icon={IconCode}
                    text="Toujours aux commandes du côté technique, Flojito est le cerveau derrière la magie des lignes de code qui alimentent nos solutions de pointe. Avec une expertise inégalée en développement logiciel et une passion pour l'innovation, Flojito transforme les idées en réalité numérique. Toujours à la pointe de la technologie, il garantit que nos produits sont à la fois puissants et conviviaux."
                    email="flo@tradiz.fr"
                    index={0}
                />
            </div>

            <PartnershipBlock />

            <JoinBlock />
        </Section>
    );
}

/* ─────────────────────────── Partnership ─────────────────────────── */

function PartnershipBlock() {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`max-w-2xl mx-auto mb-12 p-6 rounded-2xl bg-site-surface border border-site-border transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
        >
            <div className="flex items-center gap-3 mb-4">
                <IconDeviceMobile size={28} className="text-orange-500 shrink-0" />
                <div>
                    <h3 className="text-lg font-bold text-site-text">
                        Tradiz <span className="text-site-text-muted">×</span> Digi-Carte
                    </h3>
                    <p className="text-xs text-site-text-muted">Partenariat — Menu digital & prise de commande</p>
                </div>
            </div>
            <p className="text-sm text-site-text-secondary leading-relaxed mb-4">
                En plus de notre logiciel de caisse, nous proposons une solution de menu digital en partenariat avec{' '}
                <a
                    href="https://digi-carte.fr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:underline"
                >
                    Digi-Carte
                </a>
                . Vos clients scannent un QR code pour consulter la carte, commander et payer directement depuis leur
                smartphone. Les commandes remontent automatiquement en cuisine sur un écran dédié, et la gestion de la
                salle (tables, murs) se fait par glisser-déposer. Les deux solutions sont intégrées : votre caisse
                Tradiz et votre menu digital Digi-Carte fonctionnent ensemble, en temps réel.
            </p>
            <a
                href="https://digi-carte.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-orange-500 hover:underline"
            >
                Découvrir Digi-Carte
                <IconExternalLink size={14} />
            </a>
        </div>
    );
}

function TeamCard({
    name,
    role,
    icon: Icon,
    text,
    email,
    index,
}: {
    name: string;
    role: string;
    icon: typeof IconRocket;
    text: string;
    email: string;
    index: number;
}) {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`group p-8 rounded-3xl bg-site-surface border border-site-border shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
            style={{ transitionDelay: `${index * 120}ms` }}
        >
            <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md">
                    <Icon size={32} className="text-white" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-site-text">{name}</h3>
                    <p className="text-sm text-site-text-secondary">{role}</p>
                </div>
            </div>
            <p className="text-site-text-secondary leading-relaxed mb-4">{text}</p>
            <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:gap-2.5 transition-all"
            >
                <IconMail size={15} />
                {email}
            </a>
        </div>
    );
}

function JoinBlock() {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`max-w-3xl mx-auto p-8 rounded-3xl bg-linear-to-br from-orange-500/5 to-amber-500/5 border border-orange-500/10 text-center transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
        >
            <h3 className="text-2xl font-bold text-site-text mb-4">
                Rejoignez l'équipe : où les codes sont plus que des chiffres !
            </h3>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                Vous êtes développeur·se passionné·e par le code ? Ou commercial·e qui sait vendre de la magie en boîte
                ? Chez Tradiz, nous avons besoin de vous !
            </p>
            <ul className="text-left text-site-text-secondary space-y-2 mb-6 max-w-xl mx-auto">
                <li className="flex gap-2">
                    <IconCode size={20} className="text-orange-500 shrink-0 mt-0.5" />
                    <span>
                        <strong className="text-site-text">Développeur·se :</strong> vous rêvez d'un lieu où les bugs
                        sont des créatures mythiques et où les pauses café sont des moments de brainstorming génial ?
                        Bienvenue chez nous !
                    </span>
                </li>
                <li className="flex gap-2">
                    <IconRocket size={20} className="text-orange-500 shrink-0 mt-0.5" />
                    <span>
                        <strong className="text-site-text">Commercial·e :</strong> vous avez le charisme d'un magicien
                        et la persuasion d'un vendeur de potions ? Chez Tradiz, vous vendrez plus que des logiciels :
                        vous vendrez des solutions.
                    </span>
                </li>
            </ul>
            <a
                href="#contact"
                onClick={(e) => {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('contactSubject', { detail: 'candidature' }));
                    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all"
            >
                Postulez
                <IconArrowRight size={16} />
            </a>
        </div>
    );
}

/* ─────────────────────────── FAQ ─────────────────────────── */

function FAQ() {
    const { ref, visible } = useFadeIn();
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <Section id="faq">
            <div
                ref={ref}
                className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text">Foire aux questions</h2>
                <p className="mt-4 text-lg text-site-text-secondary">Vos questionnements</p>
            </div>

            <div className="max-w-3xl mx-auto space-y-3">
                {FAQ_ITEMS.map((item, i) => (
                    <FAQItem
                        key={i}
                        item={item}
                        isOpen={openIndex === i}
                        onToggle={() => setOpenIndex(openIndex === i ? null : i)}
                        index={i}
                    />
                ))}
            </div>

            <div className="mt-12 text-center">
                <p className="text-site-text-secondary mb-4">Votre question est absente de la liste ?</p>
                <a
                    href="#contact"
                    onClick={(e) => {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent('contactSubject', { detail: 'demande-renseignement' }));
                        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all"
                >
                    Contactez-nous
                    <IconArrowRight size={16} />
                </a>
            </div>
        </Section>
    );
}

function FAQItem({
    item,
    isOpen,
    onToggle,
    index,
}: {
    item: { q: string; a: string };
    isOpen: boolean;
    onToggle: () => void;
    index: number;
}) {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`rounded-2xl bg-site-surface border border-site-border overflow-hidden transition-all duration-500 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: `${index * 60}ms` }}
        >
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-site-surface-hover transition-colors"
            >
                <span className="text-base font-semibold text-site-text">{item.q}</span>
                <IconChevronDown
                    size={20}
                    className={`text-site-text-muted shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-150' : 'max-h-0'}`}>
                <p className="p-5 pt-0 text-site-text-secondary leading-relaxed">{item.a}</p>
            </div>
        </div>
    );
}

/* ─────────────────────────── Contact ─────────────────────────── */

function Contact() {
    const { ref, visible } = useFadeIn();
    const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', subject: '', message: '' });
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [honeypot, setHoneypot] = useState('');
    const [subjectOpen, setSubjectOpen] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as string;
            setForm((prev) => ({ ...prev, subject: detail }));
        };
        window.addEventListener('contactSubject', handler);
        return () => window.removeEventListener('contactSubject', handler);
    }, []);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (sending || cooldown > 0) return;
            if (honeypot) return;
            if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;

            setSending(true);
            setError(false);
            try {
                const subjectLabel =
                    CONTACT_SUBJECTS.find((s) => s.value === form.subject)?.label || "Demande d'information";
                const fullMessage = form.phone
                    ? `${form.message}\n\nTéléphone : ${form.phone}${form.company ? `\nEntreprise : ${form.company}` : ''}`
                    : form.company
                      ? `${form.message}\n\nEntreprise : ${form.company}`
                      : form.message;
                const success = await sendContactEmail(
                    'flo@tradiz.fr',
                    form.name,
                    form.email,
                    subjectLabel,
                    fullMessage
                );
                if (success) {
                    setSent(true);
                    setForm({ name: '', company: '', email: '', phone: '', subject: '', message: '' });
                    setCooldown(30);
                } else {
                    setError(true);
                }
            } catch {
                setError(true);
            } finally {
                setSending(false);
            }
        },
        [form, sending, cooldown, honeypot]
    );

    const inputClass =
        'w-full px-4 py-2.5 rounded-xl bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all';

    return (
        <Section id="contact">
            <div
                ref={ref}
                className={`max-w-2xl mx-auto text-center mb-12 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text">
                    Demandez une{' '}
                    <span className="bg-linear-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                        démo
                    </span>
                </h2>
                <p className="mt-4 text-lg text-site-text-secondary">
                    Voyons ensemble comment Tradiz peut transformer votre commerce. Réponse sous 24h, sans engagement.
                </p>
            </div>

            <div className="max-w-2xl mx-auto">
                {sent ? (
                    <div className="text-center p-8 rounded-3xl bg-green-500/5 border border-green-500/10">
                        <IconCircleCheck size={48} className="text-green-500 mx-auto mb-4" />
                        <p className="text-lg font-semibold text-site-text mb-2">Message envoyé !</p>
                        <p className="text-site-text-secondary">Nous vous répondrons dans les plus brefs délais.</p>
                        <button
                            type="button"
                            onClick={() => setSent(false)}
                            className="mt-6 text-sm font-semibold text-orange-500 hover:underline"
                        >
                            Envoyer un autre message
                        </button>
                    </div>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        className="p-8 rounded-3xl bg-site-surface border border-site-border shadow-sm space-y-5"
                    >
                        {/* Honeypot */}
                        <input
                            type="text"
                            name="website"
                            value={honeypot}
                            onChange={(e) => setHoneypot(e.target.value)}
                            className="absolute left-[-9999px]"
                            tabIndex={-1}
                            autoComplete="off"
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-site-text mb-1.5">Nom complet *</label>
                                <input
                                    type="text"
                                    required
                                    minLength={2}
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className={inputClass}
                                    placeholder="Jean Dupont"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-site-text mb-1.5">Entreprise</label>
                                <input
                                    type="text"
                                    value={form.company}
                                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                                    className={inputClass}
                                    placeholder="Ma Boulangerie"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-site-text mb-1.5">Email *</label>
                                <input
                                    type="email"
                                    required
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className={inputClass}
                                    placeholder="vous@exemple.fr"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-site-text mb-1.5">Téléphone</label>
                                <input
                                    type="tel"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    className={inputClass}
                                    placeholder="06 00 00 00 00"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-site-text mb-1.5">Sujet</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setSubjectOpen(!subjectOpen)}
                                    className={
                                        inputClass + ' text-left flex items-center justify-between cursor-pointer'
                                    }
                                >
                                    <span className={form.subject ? 'text-site-text' : 'text-site-text-muted'}>
                                        {form.subject
                                            ? CONTACT_SUBJECTS.find((s) => s.value === form.subject)?.label
                                            : 'Choisir un sujet...'}
                                    </span>
                                    <IconChevronDown
                                        size={18}
                                        className={`text-site-text-muted transition-transform ${subjectOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                {subjectOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setSubjectOpen(false)} />
                                        <div className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden bg-site-surface border border-site-border shadow-lg">
                                            {CONTACT_SUBJECTS.map((s) => (
                                                <button
                                                    key={s.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setForm({ ...form, subject: s.value });
                                                        setSubjectOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-site-surface-hover ${
                                                        form.subject === s.value
                                                            ? 'text-orange-500'
                                                            : 'text-site-text-secondary'
                                                    } cursor-pointer`}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-site-text mb-1.5">Votre message *</label>
                            <textarea
                                required
                                minLength={10}
                                rows={4}
                                value={form.message}
                                onChange={(e) => setForm({ ...form, message: e.target.value })}
                                className={inputClass + ' resize-none'}
                                placeholder="Parlez-nous de votre commerce, vos besoins..."
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-500">
                                Une erreur est survenue. Veuillez réessayer ou nous écrire directement.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={sending || cooldown > 0}
                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 rounded-full shadow-sm hover:shadow-md hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                            {sending ? (
                                'Envoi en cours...'
                            ) : cooldown > 0 ? (
                                `Attendez ${cooldown}s`
                            ) : (
                                <>
                                    <IconSend size={18} />
                                    Envoyer ma demande
                                </>
                            )}
                        </button>
                    </form>
                )}

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm">
                    <a
                        href="mailto:flo@tradiz.fr"
                        className="inline-flex items-center gap-2 text-site-text-secondary hover:text-site-text transition-colors"
                    >
                        <IconMail size={16} />
                        flo@tradiz.fr
                    </a>
                </div>
            </div>
        </Section>
    );
}

/* ─────────────────────────── Footer ─────────────────────────── */

function Footer() {
    return (
        <footer className="bg-site-footer-bg text-site-footer-text">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                            <IconToolsKitchen2 size={20} className="text-white" />
                        </div>
                        <span className="text-lg font-bold text-white">Tradiz</span>
                    </div>

                    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
                        {NAV_LINKS.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="text-site-footer-text/70 hover:text-white transition-colors"
                            >
                                {link.label}
                            </a>
                        ))}
                    </nav>

                    <a
                        href="https://demo.tradiz.fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-orange-400 hover:text-orange-300 transition-colors"
                    >
                        Tester le logiciel →
                    </a>
                </div>

                <div className="mt-8 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-site-footer-text/60">
                        Fait avec 💕 par{' '}
                        <a href="mailto:flo@tradiz.fr" className="hover:text-white transition-colors">
                            Flojito
                        </a>
                    </p>
                    <p className="text-sm text-site-footer-text/60">
                        &copy; {new Date().getFullYear()} Tradiz. Tous droits réservés.
                    </p>
                </div>
            </div>
        </footer>
    );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function LandingPage() {
    const { mode: themeMode, set: setTheme } = useTheme();

    return (
        <div className="min-h-screen bg-site-bg text-site-text transition-colors duration-200">
            {/* Background gradient */}
            <div className="fixed inset-0 -z-10 bg-linear-to-br from-gray-50 via-white to-gray-100 site-dark:from-gray-950 site-dark:via-gray-900 site-dark:to-gray-800" />

            <Header themeMode={themeMode} setTheme={setTheme} />

            <main>
                <Hero />
                <Mission />
                <Promises />
                <Software />
                <Pricing />
                <Team />
                <FAQ />
                <Contact />
            </main>

            <Footer />
        </div>
    );
}
