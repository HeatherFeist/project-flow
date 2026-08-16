// Shown instead of the app when required build-time env vars are missing,
// so a misconfigured deploy shows an explanation instead of a blank screen.
export function ConfigError() {
  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
        background: "#0f0f12",
        color: "#e5e5e5",
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Project Flow isn't configured yet</h1>
        <p style={{ color: "#a3a3a3", marginBottom: "1rem" }}>
          This deploy is missing <code>VITE_SUPABASE_URL</code> and/or{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>. Vite bakes these in at build time, so they need to be
          set as build environment variables wherever this app is hosted (Cloudflare, Vercel, etc.),
          then the app needs to be rebuilt and redeployed.
        </p>
        <p style={{ color: "#a3a3a3" }}>See the README's "Supabase setup" section for where to find these values.</p>
      </div>
    </div>
  );
}
