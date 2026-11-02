# Contributing

```sh
cd app
npm install
npm run dev      # http://localhost:5173
npm run check    # svelte-check + tsc
npm test         # vitest
npm run build
npm run e2e      # real Chrome against a local Synapse
```

`npm run e2e` drives the installed Google Chrome against the production build and a Synapse. It needs `SYNAPSE_URL` and, if registration is closed, `SYNAPSE_REGISTRATION_SECRET`; CI runs it against a throwaway Synapse on every push. A security fix gets a regression test that fails without the fix.

Releases are signed tags (`git tag -s X.Y`): the tag workflow builds a draft release with the static build, which is then published with notes. See the Releases section of the [README](https://github.com/hbenali/tessera#releases).

Report vulnerabilities privately: see [Security](Security).
