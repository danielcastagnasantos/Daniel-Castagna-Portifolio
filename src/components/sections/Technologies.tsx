import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { technologies } from "@/content/technologies";

export function Technologies() {
  const t = useTranslations("tech");

  return (
    <section id="tech" aria-labelledby="tech-title" className="section-py">
      <div className="container-x flex flex-col gap-12">
        <SectionHeading
          id="tech-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {technologies.map((tech, index) => (
            <Reveal as="li" key={tech.id} delay={index * 0.04}>
              {/*
                O tooltip usa `title` nativo em vez de painel customizado: é
                anunciado por leitores de tela, aparece no foco por teclado e
                não custa JS. O nome também fica visível abaixo do ícone, para
                quem nunca chega a passar o mouse.
              */}
              <div
                title={`${tech.name} — ${t(`categories.${tech.category}`)}`}
                className="group relative flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--line)] bg-card/60 p-5 backdrop-blur transition-[transform,border-color] duration-500 ease-[var(--ease-out-expo)] hover:-translate-y-1 hover:border-primary/70"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-40"
                  style={{ backgroundColor: tech.color }}
                />

                <svg
                  viewBox="0 0 24 24"
                  className="relative h-9 w-9 transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-110"
                  fill={tech.color}
                  aria-hidden="true"
                >
                  <path d={tech.path} />
                </svg>

                <span className="relative text-center font-mono text-[11px] text-muted transition-colors duration-300 group-hover:text-ink">
                  {tech.name}
                </span>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
