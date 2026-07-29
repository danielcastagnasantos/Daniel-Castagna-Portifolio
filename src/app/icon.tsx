import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon gerado em build: monograma DC sobre o roxo da marca.
 * Gerar evita manter um binário no repositório e mantém a identidade num
 * lugar só — se a paleta mudar, o ícone acompanha.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #7C3AED 0%, #C084FC 100%)",
          color: "#FFFFFF",
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: -1,
          borderRadius: 7,
        }}
      >
        DC
      </div>
    ),
    size,
  );
}
