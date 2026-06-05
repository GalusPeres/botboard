// Auto-entdeckte Page-Registry.
//
// Jede Datei in diesem Ordner, die `export const page = { kind, render }` hat,
// wird automatisch eingesammelt — Vites import.meta.glob scannt den Ordner zur
// Build-Zeit. Eine neue Seite hinzufügen = eine Datei hier ablegen. KEIN Edit
// in App.jsx, keine zentrale Liste pflegen.
//
//   export const page = {
//     kind: 'meine-seite',                 // muss zum manifest.pages[].kind passen
//     render: (ctx) => <MeineSeite ... />,  // ctx = geteilte Daten + Handler aus App
//   };

const modules = import.meta.glob('./*.jsx', { eager: true });

const PAGE_RENDERERS = {};
for (const path in modules) {
  const page = modules[path].page;
  if (page?.kind) PAGE_RENDERERS[page.kind] = page.render;
}

export default PAGE_RENDERERS;
