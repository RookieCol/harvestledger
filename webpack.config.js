// Custom webpack config for `nest build` (referenced from nest-cli.json).
//
// By default Nest bundles the entire dependency tree into a single self-contained
// main.js. That breaks OpenTelemetry auto-instrumentation, which monkey-patches
// libraries (http, pg, mongodb, amqplib, ioredis) as they are require()'d at
// runtime — a bundled library is never require()'d, so there is nothing to patch.
//
// We externalize node_modules so those libraries are loaded from the installed
// node_modules at runtime (the prod Docker stage installs them), while keeping
// our own `@app/common` source bundled (it is a tsconfig path alias, not a real
// package, so it must stay in the bundle).
const nodeExternals = require('webpack-node-externals');

module.exports = (options) => ({
  ...options,
  externals: [
    nodeExternals({
      // Keep @app/common (and its subpaths) bundled; externalize everything else.
      allowlist: [/^@app\/common(\/.*)?$/],
    }),
  ],
});
