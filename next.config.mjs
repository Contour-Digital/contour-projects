/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      // The dashboard must never be framed by another site.
      { source: "/((?!embed).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      // The booking widget is meant to be embedded on any website.
      { source: "/embed/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
    ];
  },
};
export default nextConfig;
