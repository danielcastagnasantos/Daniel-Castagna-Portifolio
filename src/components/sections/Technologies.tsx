import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tilt3D } from "@/components/ui/Tilt3D";
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
              <Tilt3D className="h-full">
                {/*
                  O tooltip usa `title` nativo em vez de painel customizado: é
                  anunciado por leitores de tela, aparece no foco por teclado e
                  não custa JS. O nome também fica visível abaixo do ícone, para
                  quem nunca chega a passar o mouse.
                */}
                <div
                  title={`${tech.name} — ${t(`categories.${tech.category}`)}`}
                  className="group relative flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--line)] bg-card/60 p-5 backdrop-blur transition-[border-color] duration-500 ease-[var(--ease-out-expo)] hover:border-primary/70"
                >
                  {/* Halo na cor da marca, no plano do card */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-40"
                    style={{ backgroundColor: tech.color }}
                  />

                  {/*
                    Ícone e rótulo em planos Z distintos. É daqui que vem a
                    sensação de profundidade: ao inclinar, eles se deslocam em
                    velocidades diferentes em relação à borda do card.
                  */}
                  <svg
                    viewBox="0 0 24 24"
                    className="relative h-9 w-9 transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-110"
                    style={{ transform: "translateZ(46px)" }}
                    fill={tech.color}
                    aria-hidden="true"
                  >
                    <path d={tech.path} />
                  </svg>

                  <span
                    className="relative text-center font-mono text-[11px] text-muted transition-colors duration-300 group-hover:text-ink"
                    style={{ transform: "translateZ(22px)" }}
                  >
                    {tech.name}
                  </span>

                  {/* Sombra projetada, atrás do card, reforçando o relevo */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-4 bottom-1 h-6 rounded-full opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-60"
                    style={{ backgroundColor: tech.color, transform: "translateZ(-30px)" }}
                  />
                </div>
              </Tilt3D>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
