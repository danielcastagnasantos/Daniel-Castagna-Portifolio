import Image from "next/image";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { projects } from "@/content/projects";

/**
 * Quais cards ocupam a largura inteira da grade.
 *
 * Destaques sempre ocupam. Além deles, um card que sobra sozinho na última
 * linha também ocupa — senão fica meio card de conteúdo e meio de vazio, que
 * é como a seção aparecia com dois projetos.
 */
function fullWidthIds(): ReadonlySet<string> {
  const ids = new Set(projects.filter((p) => p.featured).map((p) => p.id));
  const rest = projects.filter((p) => !p.featured);

  if (rest.length % 2 === 1) {
    ids.add(rest[rest.length - 1].id);
  }

  return ids;
}

export function Projects() {
  const t = useTranslations("projects");
  const fullWidth = fullWidthIds();

  return (
    <section id="projects" aria-labelledby="projects-title" className="section-py">
      <div className="container-x flex flex-col gap-12">
        <SectionHeading
          id="projects-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <ul className="grid gap-6 lg:grid-cols-2">
          {projects.map((project, index) => (
            <Reveal
              as="li"
              key={project.id}
              delay={index * 0.1}
              className={fullWidth.has(project.id) ? "lg:col-span-2" : ""}
            >
              <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-card/70 backdrop-blur transition-[border-color,transform] duration-500 ease-[var(--ease-out-expo)] hover:-translate-y-1 hover:border-primary/60">
                <div
                  // 2/1 acompanha a proporção real da captura do Tô Chegando
                  // (1864x964) e evita cortar a base da página. Cards de
                  // largura inteira usam a mesma proporção para não virarem
                  // um bloco alto demais.
                  className={`relative w-full overflow-hidden border-b border-[var(--line)] ${
                    fullWidth.has(project.id) ? "aspect-[2/1]" : "aspect-[16/10]"
                  }`}
                >
                  {project.image ? (
                    <Image
                      src={project.image}
                      alt={t(`items.${project.id}.imageAlt`)}
                      fill
                      sizes={project.featured ? "100vw" : "(max-width: 1024px) 100vw, 50vw"}
                      className="object-cover object-top transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(60%_80%_at_50%_0%,rgba(124,58,237,.25),transparent_70%)]">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                        {t(`items.${project.id}.title`)}
                      </span>
                    </div>
                  )}

                  <span
                    className={[
                      "absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur",
                      project.status === "live"
                        ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30"
                        : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${
                        project.status === "live" ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    {project.status === "live" ? t("liveBadge") : t("inProgressBadge")}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-6 sm:p-8">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-display text-2xl font-bold">
                      {t(`items.${project.id}.title`)}
                    </h3>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-glow">
                      {t(`items.${project.id}.client`)}
                    </p>
                  </div>

                  <p className="text-pretty text-sm leading-relaxed text-muted">
                    {t(`items.${project.id}.problem`)}
                  </p>
                  <p className="text-pretty text-sm leading-relaxed text-muted">
                    {t(`items.${project.id}.solution`)}
                  </p>

                  <ul className="mt-auto flex flex-wrap gap-2 pt-2">
                    {project.stack.map((tech) => (
                      <li
                        key={tech}
                        className="rounded-full border border-[var(--line)] px-3 py-1 font-mono text-[11px] text-muted"
                      >
                        {tech}
                      </li>
                    ))}
                  </ul>

                  {project.url && (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink transition-colors duration-300 hover:text-glow"
                    >
                      {t("viewProject")}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 17 17 7M9 7h8v8" />
                      </svg>
                    </a>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
