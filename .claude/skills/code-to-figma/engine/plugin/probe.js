// code-to-figma probe — read-only: proves watch mode works and reports what the file contains.
/*LIB*/
const pages = figma.root.children.map((p) => p.name);
const lib = await page('library');
const boards = lib.children.filter((n) => n.name.startsWith('Board · ')).map((n) => n.name.replace('Board · ', ''));
return { file: figma.root.name, pages, boards, variables: _vars.length, textStyles: Object.keys(TS).length, effectStyles: Object.keys(ES).length };
