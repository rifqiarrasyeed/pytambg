import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24
      }}
    >
      <section className="card" style={{ width: "100%", maxWidth: 520 }}>
        <div className="card-header">
          <strong style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>Halaman Tidak Ditemukan</strong>
          <span className="badge badge-warn">404</span>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Rute yang kamu akses tidak tersedia atau sudah dipindahkan.
          </p>
          <div className="action-row">
            <Link className="btn btn-primary" href="/planning">
              Ke Planning
            </Link>
            <Link className="btn btn-secondary" href="/login">
              Ke Login
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
