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
} from '@tabler/icons-react';
import { useTheme, type ThemeMode } from '../site/theme';

/* ─────────────────────────── Content ─────────────────────────── */

const NAV_LINKS = [
    { label: 'Mission', href: '#mission' },
    { label: 'Promesses', href: '#promesses' },
    { label: 'Le logiciel', href: '#logiciel' },
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
        title: 'Simplicité',
        text: 'Une interface conviviale et intuitive qui vous permet de gérer vos transactions en quelques clics.',
    },
    {
        icon: IconPalette,
        title: 'Personnalisation',
        text: 'Adaptez Tradiz à votre style et à vos besoins spécifiques. Vous êtes aux commandes !',
    },
    {
        icon: IconShieldCheck,
        title: 'Économies',
        text: 'Fini les frais exorbitants ! Tradiz est abordable et sans surprises.',
    },
    {
        icon: IconDevices2,
        title: 'Autonomie',
        text: 'Prenez le contrôle de votre caisse enregistreuse et gérez vos ventes comme bon vous semble.',
    },
];

const FAQ_ITEMS = [
    {
        q: "Je ne veux pas m'engager, ou j'ai une activité saisonnière donc comment puis-je intégrer votre solution ?",
        a: "Soyez rassuré, Tradiz est un logiciel sans engagement. La facturation ne se fait qu'à chaque transaction effectuée et en fin de mois. Donc en fin d'activité si aucune transaction, pas de facturation, et c'est en ça que c'est adapté pour vous qui êtes saisonnier.",
    },
    {
        q: 'Comment installer votre logiciel dans mon système et de quoi ai-je besoin ?',
        a: 'Notre logiciel de caisse fonctionne sans installation, démarre instantanément et se met à jour automatiquement. Et ce, sur tous les appareils, pour une prise en main rapide pour les employés.',
    },
    {
        q: 'Votre logiciel est-il sécurisé ?',
        a: 'Tradiz est aux normes de la nouvelle loi concernant les logiciels de caisse. Nous pouvons vous fournir une attestation de conformité. Des mises à jour régulières sont déployées pour garantir la sécurité. Un support technique est disponible 6 jours sur 7.',
    },
    {
        q: 'Quels sont les avantages et les inconvénients de votre logiciel ?',
        a: "Avantages : interface intuitive, utilisation indépendante d'internet et de la connexion (en attente de synchronisation sur le Cloud), logiciel rapide, gestion multi-caisses, possibilité d'utilisation sur tablette, smartphone ou PC. Nous vous laissons le choix de votre caisse en fonction de votre besoin.",
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

            {/* History */}
            <HistoryBlock />

            {/* Today */}
            <TodayBlock />

            {/* Features grid */}
            <FeaturesGrid />

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
                        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-site-text bg-site-surface border border-site-border rounded-full hover:bg-site-surface-hover transition-all"
                    >
                        Tester avec quelqu'un
                    </a>
                </div>
            </div>
        </Section>
    );
}

function HistoryBlock() {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`max-w-3xl mx-auto mb-20 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
            <h3 className="text-2xl font-bold text-site-text mb-6">Naissance de Tradiz</h3>
            <p className="text-site-text-secondary leading-relaxed mb-4">Un peu d'histoire...</p>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                Dans les années 1880, avant l'avènement des caisses enregistreuses, les commerçants étaient confrontés à
                un problème majeur : ils n'avaient pas de moyen fiable pour enregistrer leurs ventes quotidiennes. Les
                employés peu scrupuleux pouvaient facilement détourner une partie des recettes, et les propriétaires de
                commerces ne disposaient pas d'une vue précise de leurs revenus.
            </p>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                C'est alors qu'un propriétaire de saloon obscur dans l'Ohio, James Ritty, eut une idée géniale. Après
                avoir observé un mécanisme de comptage des tours d'hélice lors d'un voyage en bateau à vapeur vers
                l'Europe, il se demanda si un dispositif similaire pourrait être utilisé pour garder la trace des
                paiements au sein de son établissement, le Pony House.
            </p>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                Ritty inventa la première caisse enregistreuse mécanique, qu'il appela la « caisse incorruptible de
                Ritty ». Cette caisse affichait les sommes payées par les clients et les additionnait, mais elle ne
                disposait pas encore d'un tiroir pour ranger l'argent ni de la possibilité de délivrer des reçus.
            </p>

            <h4 className="text-xl font-bold text-site-text mt-8 mb-4">
                L'évolution de la caisse enregistreuse : de Ritty à Tradiz
            </h4>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                La caisse enregistreuse de Ritty fut ensuite améliorée par Jacob H. Eckert, qui ajouta un tiroir et
                améliora le son de la cloche qui retentissait lorsque le vendeur appuyait sur le bouton « Total ». Le
                son de la cloche avertissait le propriétaire du magasin qu'un paiement était en cours, réduisant ainsi
                les risques de vol.
            </p>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                Au fil des décennies, les caisses enregistreuses ont continué à évoluer. Les systèmes informatisés ont
                remplacé les mécanismes manuels, et les logiciels de caisse ont vu le jour. Cependant, de nombreux
                logiciels de caisse actuels souffrent de problèmes similaires à ceux rencontrés par les commerçants du
                XIXe siècle : ils sont souvent laids, coûteux et peu adaptés aux besoins spécifiques de chaque commerce.
            </p>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                C'est là que Tradiz entre en scène. Ce logiciel de caisse révolutionnaire a été conçu pour inverser la
                tendance. Au lieu d'obliger les commerçants à s'adapter à un logiciel standard, Tradiz met l'accent sur
                l'autonomie et l'indépendance des commerçants. Il offre une interface conviviale, des fonctionnalités
                personnalisables et une expérience utilisateur agréable.
            </p>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                Ainsi, grâce à Tradiz, les commerçants peuvent désormais gérer leurs transactions en toute simplicité,
                sans sacrifier leur style ni leur budget. Tradiz est bien plus qu'un simple logiciel de caisse ; c'est
                une révolution dans la gestion des transactions commerciales.
            </p>
            <p className="text-site-text-secondary leading-relaxed">
                C'est ainsi que Tradiz est né, portant l'étendard de l'autonomie et de l'indépendance pour les
                commerçants du XXIe siècle !
            </p>
        </div>
    );
}

function TodayBlock() {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`max-w-3xl mx-auto mb-20 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
            <h3 className="text-2xl font-bold text-site-text mb-6">Où en sommes-nous aujourd'hui ?</h3>
            <p className="text-site-text-secondary leading-relaxed mb-4">
                Vous êtes propriétaire d'un commerce et vous en avez assez des logiciels de caisse compliqués, coûteux
                et peu adaptés à vos besoins ? Ne cherchez plus ! Tradiz est là pour révolutionner votre expérience de
                gestion.
            </p>
            <p className="text-site-text-secondary leading-relaxed mb-4">Avec Tradiz, vous bénéficiez de :</p>
        </div>
    );
}

function FeaturesGrid() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {FEATURES.map((feature, i) => {
                const Icon = feature.icon;
                return <FeatureCard key={feature.title} feature={feature} icon={Icon} index={i} />;
            })}
        </div>
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

            <JoinBlock />
        </Section>
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
            <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
                <p className="p-5 pt-0 text-site-text-secondary leading-relaxed">{item.a}</p>
            </div>
        </div>
    );
}

/* ─────────────────────────── Contact ─────────────────────────── */

function Contact() {
    const { ref, visible } = useFadeIn();
    const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [honeypot, setHoneypot] = useState('');

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
                if (honeypot) return;
                const success = await sendContactEmail(
                    'flo@tradiz.fr',
                    form.name,
                    form.email,
                    form.subject || "Demande d'information",
                    form.message
                );
                if (success) {
                    setSent(true);
                    setForm({ name: '', email: '', subject: '', message: '' });
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

    return (
        <Section id="contact">
            <div
                ref={ref}
                className={`max-w-2xl mx-auto text-center mb-12 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-site-text">Des questions ?</h2>
                <p className="mt-4 text-lg text-site-text-secondary">
                    Nous sommes à votre écoute et là pour vous répondre.
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
                            name="company"
                            value={honeypot}
                            onChange={(e) => setHoneypot(e.target.value)}
                            className="absolute left-[-9999px]"
                            tabIndex={-1}
                            autoComplete="off"
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-site-text mb-1.5">Nom</label>
                                <input
                                    type="text"
                                    required
                                    minLength={2}
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all"
                                    placeholder="Votre nom"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-site-text mb-1.5">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all"
                                    placeholder="vous@exemple.fr"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-site-text mb-1.5">Sujet</label>
                            <input
                                type="text"
                                value={form.subject}
                                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all"
                                placeholder="Objet de votre message"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-site-text mb-1.5">Message</label>
                            <textarea
                                required
                                minLength={10}
                                rows={5}
                                value={form.message}
                                onChange={(e) => setForm({ ...form, message: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all resize-none"
                                placeholder="Votre message..."
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
                                    Envoyer
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
                <Team />
                <FAQ />
                <Contact />
            </main>

            <Footer />
        </div>
    );
}
