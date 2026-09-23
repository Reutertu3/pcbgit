# Notice

pcbgit
Copyright (C) 2026 Michael Reuter — https://pcbgit.com
Source: https://github.com/Reutertu3/pcbgit

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See [LICENSE](LICENSE).

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

## Additional terms (AGPL-3.0 section 7(b))

The web interface of pcbgit credits the original project as part of its
Appropriate Legal Notices: the footer names pcbgit and links to it.

> pcbgit.com — https://github.com/Reutertu3/pcbgit

You must preserve a credit of this kind: the name "pcbgit" and a link to the
original project (either address), legibly and where users of the web interface
can see it. You may rename your fork, restyle the footer and add your own
notices; you may not drop the credit. It is separate from the "Source" link,
which points at your own source code (see below).

## Source for network users (AGPL-3.0 section 13)

If you run a modified version of pcbgit for other users over a network, you must
offer them the corresponding source of your version. The footer's "Source" link
does this; point it at your own repository with the `PCBGIT_SOURCE_URL` setting.

## Third-party software

pcbgit includes or uses the following software. Each keeps its own license.

### Included in pcbgit

Bundled into the application or shipped in the Docker image's `node_modules`.

| Component | License | Copyright |
|---|---|---|
| [Svelte](https://svelte.dev), [SvelteKit](https://kit.svelte.dev) and its adapter-node | MIT | Svelte contributors |
| [three.js](https://threejs.org) | MIT | three.js authors |
| [adm-zip](https://github.com/cthackers/adm-zip) | MIT | Another-D-Mention Software and contributors |
| [glTF Transform](https://gltf-transform.dev) (`@gltf-transform/core`, `@gltf-transform/extensions`) | MIT | Don McCurdy |
| [ktx-parse](https://github.com/donmccurdy/KTX-Parse) and [property-graph](https://github.com/donmccurdy/property-graph), dependencies of glTF Transform | MIT | Don McCurdy |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) | MIT | Arseny Kapoulkine |
| [devalue](https://github.com/sveltejs/devalue) | MIT | devalue contributors |
| [esm-env](https://github.com/benmccann/esm-env) | MIT | Benjamin McCann |
| [Tailwind CSS](https://tailwindcss.com) (generated stylesheet) | MIT | Tailwind Labs, Inc. |
| [Inter](https://rsms.me/inter/) font, via Fontsource | OFL-1.1 | The Inter Project Authors |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) font, via Fontsource | OFL-1.1 | The JetBrains Mono Project Authors |
| Icons in `src/lib/icons.ts`, several derived from [Feather](https://feathericons.com) and [Lucide](https://lucide.dev) | MIT (Feather), ISC (Lucide) | Cole Bemis (Feather); Lucide Contributors |
| [Gruvbox](https://github.com/morhetz/gruvbox) colour palette, used by the Gruvbox themes and the dark schematic view | MIT | Pavel Pertsev |

### Run alongside pcbgit

Separate programs that pcbgit starts or talks to. They are not linked into pcbgit,
so their licenses do not extend to pcbgit's code.

| Component | License | Notes |
|---|---|---|
| [KiCad](https://www.kicad.org) (`kicad-cli`) | GPL-3.0-or-later | Renders schematics, boards, 3D models, BOM and checks |
| [KiCad libraries](https://www.kicad.org/libraries/license/) (3D models) | CC-BY-SA-4.0 with a design exception | The exception waives share-alike for designs and generated files that use the libraries |
| [git](https://git-scm.com) | GPL-2.0 | Repositories, clone and push |
| [Node.js](https://nodejs.org) | MIT | Runtime |
| [librsvg](https://gitlab.gnome.org/GNOME/librsvg) (`rsvg-convert`) | LGPL-2.1-or-later | Card thumbnails |
| [libwebp](https://chromium.googlesource.com/webm/libwebp) (`cwebp`) | BSD-3-Clause | Card thumbnails |
| [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) | MIT | Interactive BOM pages. The generated pages embed its scripts and theirs: Split.js (MIT), PEP (MIT), lz-string (MIT) |
| [tini](https://github.com/krallin/tini) | MIT | Process supervisor in the container |
| [Caddy](https://caddyserver.com) | Apache-2.0 | HTTPS reverse proxy (production setup, separate container) |
| [Ubuntu](https://ubuntu.com) base image | Various | Operating system of the Docker image |

The web fonts Inter and JetBrains Mono (SIL Open Font License 1.1) are loaded from
Google Fonts and are not distributed with pcbgit.

### Distributing Docker images

Building the image yourself, as the setup instructions do, is not distribution.
If you publish a built image, it contains KiCad, git and other GPL software, and
you must offer their source code, for example by linking to KiCad's source at
<https://gitlab.com/kicad/code/kicad> and to the Ubuntu source packages the
image was built from.
