/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The worker opt-in form lives on the homepage. The old /register page
      // used redirect() in a prerendered component, which Vercel served as a
      // 307 with no Location header — a dead end for non-JS clients like
      // Twilio's toll-free verification reviewers (error 30491).
      {
        source: '/register',
        destination: '/',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
