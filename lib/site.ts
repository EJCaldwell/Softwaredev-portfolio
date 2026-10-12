/**
 * lib/site.ts — site identity, navigation, and all page copy.
 *
 * Owns: the strings that appear in more than one chrome surface (document title, nav
 * brand, footer byline, contact links), the canonical nav route list, the headshot
 * metadata, and the prose for `/`, `/projects` and `/about`. Project entries themselves
 * live in `lib/projects.ts`.
 *
 * Why copy lives here instead of in the page components: editing content should be a
 * one-file, JSX-free change. Every stand-in string carries {@link PLACEHOLDER_MARKER}
 * literally, so `grep -rn PLACEHOLDER lib/` lists everything still to be written.
 */

import type { SkillGroup, TimelineEntry } from "@/lib/types";

/**
 * The marker every piece of stand-in copy carries. Search the repo for it to find all
 * remaining placeholder content; pages render a visible notice while any remains.
 */
export const PLACEHOLDER_MARKER = "PLACEHOLDER" as const;

/**
 * Identity of the portfolio's subject and the site's contact points.
 *
 * A flat `as const` object so call sites read as `SITE.name` and adding a field never
 * touches imports.
 */
export const SITE = {
  /** Display name: nav brand, footer byline, `title.template` suffix, hero `<h1>`. */
  name: "Ethan Caldwell",
  /** Short role label shown above the name in the hero and in the default title. */
  role: "Software Developer",
  /**
   * One-line positioning statement — the hero's lead sentence.
   */
  tagline:
    "I build web apps and APIs by day and games whenever I can, while studying Software Development.",
  /** Document `<meta name="description">`. Keep under ~160 characters. */
  description:
    "Portfolio of Ethan Caldwell, software developer — projects, skills, and contact information.",
  /**
   * Contact email, rendered as a visible `mailto:` link (hero CTA, footer, 404 page).
   */
  email: "EJCaldwell06@gmail.com",
  /** GitHub profile URL (absolute). Shown in the footer and the hero CTAs. */
  githubUrl: "https://github.com/EJCaldwell",
  /**
   * LinkedIn profile URL, or `undefined` to hide the link everywhere.
   * PLACEHOLDER: set to your profile URL when you have one.
   */
  linkedinUrl: undefined as string | undefined,
} as const;

/**
 * A single top-level navigation destination.
 *
 * `href` is a root-relative app route; `label` is the visible link text.
 */
export type NavLink = {
  readonly href: string;
  readonly label: string;
};

/**
 * The site's primary navigation, in presentation order. Every entry must be a real route —
 * `next/link` prefetches in-viewport links on every page, so a dead entry costs a failed
 * request per page view. Contact is a `mailto:` in the hero and footer, not a route.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
] as const;

/**
 * The visible "this copy is not real yet" banner, shown on any page that still renders
 * placeholder content. `{ label, body }` so the component can render a short badge plus a
 * sentence rather than splitting one string.
 */
export const PLACEHOLDER_NOTICE = {
  /** Short badge text. */
  label: `${PLACEHOLDER_MARKER} CONTENT`,
  /** Names exactly what must be replaced and where it lives. */
  body: "Some content on this page is stand-in text. Replace the PLACEHOLDER entries in lib/site.ts and lib/projects.ts; this notice disappears once none remain.",
} as const;

/** Copy for the landing route `/`. */
export const LANDING_PAGE = {
  /**
   * Full document title for `/`. Not a leaf: the root layout's `title.template` applies to
   * child segments only, so `app/page.tsx` must supply the whole string.
   */
  metaTitle: `${SITE.name} — ${SITE.role}`,
  /**
   * Primary CTA label, linking to `/projects`.
   *
   * CTA and link labels must NOT contain a nav label ("Home", "Projects", "About"):
   * accessible-name matching in the e2e suite is substring-based, so "View projects"
   * would make every `getByRole("link", { name: "Projects" })` ambiguous.
   */
  projectsCta: "See my work",
  /** Secondary CTA label, a `mailto:` link. */
  contactCta: "Get in touch",
  /** Heading over the featured-projects grid. */
  featuredHeading: "Featured projects",
  /** Link under the featured grid to the full list. Avoids nav labels; see `projectsCta`. */
  allProjectsLink: "Browse all work",
} as const;

/** Copy for the `/projects` route. */
export const PROJECTS_PAGE = {
  /** Document `<title>` leaf; the root layout appends the name. */
  metaTitle: "Projects",
  /** Document description for this route. */
  metaDescription: `Software projects by ${SITE.name}, with source code.`,
  /** The page's single `<h1>`. */
  heading: "Projects",
  /** Lead paragraph under the heading. */
  intro:
    "A mix of school and personal projects: APIs, full-stack web apps, and the databases and tests behind them. I like to create things people can use and enjoy.",
  /** Accessible label for the tag-filter navigation landmark. */
  filterLabel: "Filter projects by technology",
  /** Label of the "show everything" filter chip. */
  allLabel: "All",
  /** Shown when a `?tag=` value matches no project (e.g. a stale shared link). */
  emptyMessage: "No projects use that technology yet.",
} as const;

/** Repo-relative headshot path; declared before {@link HEADSHOT}, which derives from it. */
const HEADSHOT_FILE_PATH = "public/images/headshot.jpg";

/**
 * Headshot dimensions, paths and alt text for `/about`.
 *
 * The numbers feed both the reserved `<figure>` box and `next/image`'s `width`/`height`, so
 * the reserved space and the image can't drift apart (no layout shift). 256×384 matches
 * the 1024×1536 (2:3) source; change the file and these numbers together.
 */
export const HEADSHOT = {
  /** Intrinsic width in CSS pixels. */
  width: 256,
  /** Intrinsic height in CSS pixels (256 × 3/2). */
  height: 384,
  /** Descriptive alt text: who and what is in the frame. Rewrite if the photo changes. */
  alt:
    `${SITE.name} from the waist up, smiling and looking off to one side, in a ` +
    `navy zip-up fleece over a grey T-shirt, with sunlit red and white sandstone ` +
    `cliffs behind him at dusk.`,
  /** Where the file lives in the repository. */
  filePath: HEADSHOT_FILE_PATH,
  /** Web-root URL for `next/image` — `filePath` minus `public/`, which Next serves at `/`. */
  src: `/${HEADSHOT_FILE_PATH.slice("public/".length)}`,
} as const;

/** Copy and structured content for the `/about` route. */
export const ABOUT_PAGE = {
  /** Document `<title>` leaf. */
  metaTitle: "About",
  /** Document description for this route. */
  metaDescription: `About ${SITE.name}: background, skills, and education.`,
  /** The page's single `<h1>`. */
  heading: `About ${SITE.name}`,
  /** Lead line under the h1. */
  intro:
    "Software Development student at Dixie Technical College, based in St. George, Utah. I build software across the stack, but game development is what I enjoy most of all.",
  /** Heading over the bio paragraphs. */
  bioHeading: "Background",
  /** Bio paragraphs, rendered one `<p>` each. */
  bio: [
    `${PLACEHOLDER_MARKER}: how you got into software and what you enjoy building.`,
    `${PLACEHOLDER_MARKER}: what you're working on or learning now, and what you're looking for next.`,
  ] as readonly string[],
  /** Heading over the skills list. */
  skillsHeading: "Skills",
  /** Skills grouped by area. PLACEHOLDER: replace the items with your real stack. */
  skills: [
    {
      area: "Languages",
      items: ["Python", "TypeScript", "C#"],
    },
    {
      area: "Frontend",
      items: ["React", "Next.js", "Tailwind CSS"],
    },
    { area: "Backend", items: ["Python", "C#"] },
    { area: "Tools", items: ["Git", "Vitest", "Playwright"] },
    { area: "AI", items: ["Claude", "Claude Code", "AI-assisted development"] },
    { area: "Platforms", items: ["macOS", "Windows"] },
  ] as readonly SkillGroup[],
  /** Heading over the experience timeline. */
  experienceHeading: "Experience",
  /**
   * Work history, most recent first. Empty for now — no work experience yet, only school —
   * and `/about` hides the section while it is empty. Add an entry here to show it again.
   */
  experience: [] as readonly TimelineEntry[],
  /** Heading over the education timeline. */
  educationHeading: "Education",
  /** Education history, most recent first. */
  education: [
    {
      // In progress; replace "Current" with the completion date when the program ends.
      title: "Software Development",
      organization: "Dixie Technical College",
      period: "Jan 2026 – Current",
    },
  ] as readonly TimelineEntry[],
} as const;
