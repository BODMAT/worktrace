import path from "node:path";

const dashboardLint = (files) => {
  const dashboardDir = path.resolve("dashboard");
  const relative = files
    .map((f) => path.relative(dashboardDir, f).replace(/\\/g, "/"))
    .map((f) => `"${f}"`)
    .join(" ");
  return `npm --prefix dashboard run lint -- --fix ${relative}`;
};

export default {
  "dashboard/**/*.{ts,tsx,mjs,cjs,js,jsx}": dashboardLint,
};
